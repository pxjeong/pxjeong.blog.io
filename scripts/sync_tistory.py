"""Keep a static archive of the public Tistory RSS feed for GitHub Pages."""

import argparse
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from article_content import clean_article

BLOG_HOST = "pxjeong.tistory.com"
FEED_URL = f"https://{BLOG_HOST}/rss"
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "tistory.json"
MAX_FEED_BYTES = 8 * 1024 * 1024
EXCERPT_LENGTH = 360

CATEGORY_TERMS = {
    "ctf": ("ctf", "wargame", "war game", "워게임", "드림핵", "pwn", "리버싱"),
    "bounty": ("bug bounty", "bugbounty", "버그바운티", "버그 바운티"),
    "research": ("논문", "컨퍼런스", "conference", "research", "학회"),
    "awards": ("공모전", "자격증", "수상", "awards", "certificate"),
    "dev": ("개발", "dev", "programming", "프로그래밍", "코딩", "자바"),
}
BLOCK_TAGS = {"br", "p", "div", "li", "article", "section", "pre", "h1", "h2", "h3", "h4", "tr"}
HIDDEN_TAGS = {"script", "style", "template", "noscript"}


class PostTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, _attrs):
        if tag in HIDDEN_TAGS:
            self.hidden_depth += 1
        elif tag in BLOCK_TAGS and not self.hidden_depth:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in HIDDEN_TAGS and self.hidden_depth:
            self.hidden_depth -= 1
        elif tag in BLOCK_TAGS and tag != "br" and not self.hidden_depth:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)


def plain_text(markup):
    parser = PostTextParser()
    parser.feed(markup)
    parser.close()
    lines = [line.rstrip() for line in "".join(parser.parts).splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def shorten(text, length):
    return text if len(text) <= length else text[:length].rstrip() + "…"


def canonical_link(raw):
    try:
        parts = urlsplit(raw.strip())
        if (
            parts.hostname == BLOG_HOST
            and parts.scheme in {"http", "https"}
            and not parts.username
            and not parts.password
            and parts.port is None
            and parts.path.strip("/")
        ):
            return urlunsplit(("https", BLOG_HOST, parts.path.rstrip("/"), "", ""))
    except ValueError:
        pass
    return ""


def post_category(item, title):
    for field in item.findall("category"):
        label = "".join(field.itertext()).casefold()
        label = re.sub(r"[_-]+", " ", label)
        for category, terms in CATEGORY_TERMS.items():
            if any(term in label for term in terms):
                return category
    if re.search(r"논문\s*(리뷰|리딩|발표)|\bpaper\s+review\b", title, re.IGNORECASE):
        return "research"
    return "docs"


def post_date(raw):
    if raw:
        try:
            return parsedate_to_datetime(raw).isoformat(timespec="seconds")
        except (TypeError, ValueError, OverflowError):
            pass
    return ""


def extract_posts(content):
    root = ET.fromstring(content)
    channel = root.find("channel")
    if root.tag != "rss" or channel is None:
        raise ValueError("Expected a Tistory RSS channel")
    posts = {}
    items = channel.findall("item")
    for item in items:
        title = " ".join(unescape(item.findtext("title") or "").split())
        url = canonical_link(item.findtext("link") or "")
        if not title or not url:
            continue
        description = item.findtext("description") or ""
        markup = item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or description
        body = plain_text(markup)
        posts[url] = {
            "id": url,
            "title": title,
            "category": post_category(item, title),
            "date": post_date(item.findtext("pubDate")),
            "excerpt": shorten(" ".join(body.split()), EXCERPT_LENGTH),
            "html": clean_article(markup, url),
            "url": url,
        }
    if items and not posts:
        raise ValueError("RSS contained items but no usable post links")
    return posts


def download_feed():
    request = Request(FEED_URL, headers={"User-Agent": "pxjeong-blog-rss-sync/1.0", "Accept": "application/rss+xml, application/xml, text/xml"})
    with urlopen(request, timeout=20) as response:
        if urlsplit(response.geturl()).hostname != BLOG_HOST:
            raise ValueError("RSS redirected outside the Tistory blog")
        content = response.read(MAX_FEED_BYTES + 1)
    if len(content) > MAX_FEED_BYTES:
        raise ValueError("RSS exceeds the response size limit")
    return content


def update_archive(content, output):
    existing = json.loads(output.read_text(encoding="utf-8")) if output.exists() else []
    if not isinstance(existing, list):
        raise ValueError("Expected a list in the RSS archive")
    previous = {entry["id"]: entry for entry in existing}
    fresh = extract_posts(content)
    merged = previous | fresh
    if previous != merged:
        entries = sorted(merged.values(), key=lambda post: (post["date"], post["id"]), reverse=True)
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as file:
            temporary = Path(file.name)
            json.dump(entries, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temporary.replace(output)
    print(f"RSS: {len(fresh)} entries read, {len(merged) - len(previous)} added, {len(merged)} archived")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed-file", type=Path, help="Read a saved RSS sample instead of Tistory")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    content = args.feed_file.read_bytes() if args.feed_file else download_feed()
    update_archive(content, args.output)


if __name__ == "__main__":
    main()
