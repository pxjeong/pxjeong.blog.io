"""Build the GitHub Pages site and publish rich Tistory articles as static pages."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from html import escape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from article_content import clean_article
from sync_tistory import canonical_link


ROOT = Path(__file__).resolve().parent.parent
IMAGE_HOSTS = {"blog.kakaocdn.net", "img1.daumcdn.net", "t1.daumcdn.net"}
IMAGE_LIMIT = 20 * 1024 * 1024
PAGE_LIMIT = 8 * 1024 * 1024
IMAGE_EXTENSIONS = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif",
}
CATEGORY_NAMES = {
    "dev": "개발", "ctf": "CTF/Wargame", "bounty": "Bug Bounty",
    "docs": "블로그/기술문서", "research": "논문/컨퍼런스", "awards": "공모전/자격증",
}


class ImageSources(HTMLParser):
    def __init__(self, original=False):
        super().__init__()
        self.original = original
        self.body_depth = 0
        self.sources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div" and (self.body_depth or "contents_style" in (attrs.get("class") or "").split()):
            self.body_depth += 1
        if tag == "img" and (self.body_depth or not self.original):
            self.sources.append(attrs.get("src") or "")

    def handle_endtag(self, tag):
        if tag == "div" and self.body_depth:
            self.body_depth -= 1


def image_sources(markup, original=False):
    parser = ImageSources(original)
    parser.feed(markup)
    parser.close()
    return parser.sources


def is_tistory_image(url):
    try:
        parts = urlsplit(url)
        return parts.scheme == "https" and parts.hostname in IMAGE_HOSTS and not (
            parts.username or parts.password or parts.port
        )
    except ValueError:
        return False


class AllowedRedirects(HTTPRedirectHandler):
    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not self.allowed(newurl):
            raise ValueError("Redirected outside the Tistory source")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def copy_image(source, url, cache, media):
    if not is_tistory_image(url):
        return None
    key = sha256(source.encode()).hexdigest()
    cached = next((path for path in cache.glob(key + ".*") if path.suffix in IMAGE_EXTENSIONS.values()), None)
    if cached is None:
        try:
            request = Request(url, headers={"User-Agent": "pxjeong-blog-image-mirror/1.0"})
            with build_opener(AllowedRedirects(is_tistory_image)).open(request, timeout=10) as response:
                extension = IMAGE_EXTENSIONS.get(response.headers.get_content_type())
                if not extension:
                    return None
                data = response.read(IMAGE_LIMIT + 1)
            if not data or len(data) > IMAGE_LIMIT:
                return None
            cached = cache / (key + extension)
            cached.write_bytes(data)
        except (OSError, ValueError):
            return None
    shutil.copyfile(cached, media / cached.name)
    return "../media/" + cached.name


def live_sources(post_url, expected_count):
    try:
        with build_opener(AllowedRedirects(canonical_link)).open(post_url, timeout=12) as response:
            page = response.read(PAGE_LIMIT + 1)
        if len(page) > PAGE_LIMIT:
            return []
        sources = image_sources(page.decode("utf-8", errors="replace"), original=True)
        return sources if len(sources) == expected_count else []
    except (OSError, ValueError):
        return []


def mirror_images(entries, output, cache):
    by_post = [(entry["url"], image_sources(entry.get("html", ""))) for entry in entries]
    sources = {source for _, images in by_post for source in images if is_tistory_image(source)}
    media = output / "media"
    media.mkdir(exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)

    def download(pairs, pool):
        results = pool.map(lambda pair: (pair[0], copy_image(*pair, cache, media)), pairs)
        return {source: path for source, path in results if path}

    with ThreadPoolExecutor(max_workers=8) as pool:
        mirrored = download(((source, source) for source in sources), pool)
        missing = sources - mirrored.keys()
        fallback = {}
        for url, images in by_post:
            if missing.intersection(images):
                current = live_sources(url, len(images))
                fallback.update((source, new) for source, new in zip(images, current) if source in missing)
        mirrored.update(download(fallback.items(), pool))
    return mirrored, len(sources)


def render_article(post, images):
    title = escape(post["title"])
    url = escape(post["url"], quote=True)
    description = escape(post.get("excerpt", ""), quote=True)
    date = escape(post.get("date", "")[:10])
    category = escape(CATEGORY_NAMES.get(post.get("category"), CATEGORY_NAMES["docs"]))
    metadata = f"<span>{category}</span>" + (f'<time datetime="{date}">{date}</time>' if date else "")
    fallback = post.get("body") or post.get("excerpt") or ""
    body = clean_article(post["html"], post["url"], images) if post.get("html") else (
        f'<p class="plain-article">{escape(fallback)}</p>'
    )
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{description}">
  <meta name="theme-color" content="#0e0e0e">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; media-src https:; object-src 'none'; base-uri 'none'">
  <title>{title} · Px.</title>
  <link rel="icon" href="../assets/favicon.png" type="image/png">
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body class="article-page">
  <header class="header">
    <div class="shell header-inner">
      <a class="brand" href="../" aria-label="Px. 홈">Px.</a>
      <nav class="navigation" aria-label="주 메뉴"><a href="../#posts">← 글 목록</a></nav>
    </div>
  </header>
  <main class="shell">
    <article class="reader">
      <header class="reader-heading">
        <p class="reader-meta">{metadata}</p>
        <h1>{title}</h1>
      </header>
      <div class="article-content">{body}</div>
      <footer class="reader-footer"><a href="{url}">티스토리 원문 ↗</a></footer>
    </article>
  </main>
</body>
</html>
"""


def build_site(output, cache, skip_media, require_media):
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "index.html", output / "index.html")
    shutil.copytree(ROOT / "assets", output / "assets", dirs_exist_ok=True)
    data = output / "data"
    data.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "data" / "posts.json", data / "posts.json")
    entries = json.loads((ROOT / "data" / "tistory.json").read_text(encoding="utf-8"))
    posts = [entry for entry in entries if canonical_link(entry.get("url", "")) == entry.get("url")]
    images, expected = ({}, 0) if skip_media else mirror_images(posts, output, cache)
    image_report = f"Copied {len(images)} of {expected} Tistory images"
    print(image_report)
    if job_summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(job_summary, "a", encoding="utf-8") as report:
            report.write(image_report + "\n")
    if require_media and len(images) != expected:
        raise RuntimeError("Some Tistory images could not be copied to the site")
    pages = output / "posts"
    pages.mkdir(exist_ok=True)
    index = []
    for post in posts:
        slug = sha256(post["url"].encode()).hexdigest()[:20] + ".html"
        (pages / slug).write_text(render_article(post, images), encoding="utf-8")
        index.append({key: post.get(key, "") for key in ("id", "title", "category", "date", "excerpt", "url")} | {
            "page": "posts/" + slug,
        })
    (data / "tistory.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(index)} full article pages in {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "_site")
    parser.add_argument("--media-cache", type=Path)
    media = parser.add_mutually_exclusive_group()
    media.add_argument("--skip-media", action="store_true", help="Leave the CDN image URLs in a local preview")
    media.add_argument("--require-media", action="store_true", help="Fail if a Tistory photo cannot be copied")
    args = parser.parse_args()
    with TemporaryDirectory() as temporary:
        build_site(args.output, args.media_cache or Path(temporary), args.skip_media, args.require_media)


if __name__ == "__main__":
    main()
