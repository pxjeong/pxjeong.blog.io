import { startAquarium } from "./aquarium.js";

const categories = [
  { id: "dev", name: "개발", color: "#e6e6e6" },
  { id: "ctf", name: "CTF/Wargame", color: "#b8b8b8" },
  { id: "bounty", name: "Bug Bounty", color: "#a1a1a1" },
  { id: "docs", name: "블로그/기술문서", color: "#d1d1d1" },
  { id: "research", name: "논문/컨퍼런스", color: "#f6f6f6" },
  { id: "awards", name: "공모전/자격증", color: "#c4c4c4" },
];
const categoryById = new Map(categories.map((category) => [category.id, category]));
const topics = document.querySelector("#topics");
const postList = document.querySelector("#post-list");
const postsTitle = document.querySelector("#posts-title");
const allButton = document.querySelector("#all-posts");
const moreButton = document.querySelector("#more-posts");
const dialog = document.querySelector("#post-dialog");
const pageSize = 5;
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });
let allPosts = [];
let selectedCategory = "";
let visibleLimit = pageSize;
let loadFailed = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function postMeta(post) {
  const parts = [categoryById.get(post.category).name];
  if (post.date) parts.push(dateFormat.format(new Date(post.date)));
  if (post.page) parts.push("Tistory");
  return parts.join(" · ");
}

function showPost(post) {
  document.querySelector("#post-dialog-meta").textContent = postMeta(post);
  document.querySelector("#post-dialog-title").textContent = post.title;
  const body = document.querySelector("#post-dialog-body");
  body.replaceChildren();
  const content = post.body || post.excerpt;
  if (content) body.append(element("p", "", content));
  dialog.showModal();
}

function buildTopics() {
  const counts = new Map(categories.map((category) => [category.id, 0]));
  for (const post of allPosts) counts.set(post.category, counts.get(post.category) + 1);
  for (const category of categories) {
    const button = element("button", "topic");
    button.type = "button";
    button.dataset.topic = category.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-controls", "post-list");
    button.style.setProperty("--topic-color", category.color);
    const marker = element("span", "topic-color");
    marker.setAttribute("aria-hidden", "true");
    const count = element("span", "topic-count", String(counts.get(category.id)));
    count.setAttribute("aria-label", `${counts.get(category.id)}개 글`);
    button.append(marker, element("span", "topic-name", category.name), count);
    button.addEventListener("click", () => setCategory(selectedCategory === category.id ? "" : category.id));
    topics.append(button);
  }
}

function setCategory(category) {
  selectedCategory = category;
  visibleLimit = pageSize;
  renderPosts();
}

function renderPosts() {
  const posts = selectedCategory ? allPosts.filter((post) => post.category === selectedCategory) : allPosts;
  postsTitle.textContent = selectedCategory ? categoryById.get(selectedCategory).name : "최근 글";
  allButton.hidden = !selectedCategory;
  moreButton.hidden = posts.length <= visibleLimit;
  for (const button of topics.children) {
    button.setAttribute("aria-pressed", String(button.dataset.topic === selectedCategory));
  }
  postList.replaceChildren();
  if (!posts.length) {
    const empty = element("div", "empty-state");
    const title = loadFailed ? "글을 불러오지 못했어요." : "아직 올라온 글이 없어요.";
    const copy = loadFailed ? "페이지를 새로고침하거나 티스토리를 방문해 주세요." : "새 글이 올라오면 이 목록과 수조에 나타납니다.";
    empty.append(element("p", "empty-title", title), element("p", "empty-copy", copy));
    postList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const post of posts.slice(0, visibleLimit)) {
    const article = element("article", "post-item");
    const heading = element("h3");
    const entry = element(post.page ? "a" : "button", "post-link");
    if (post.page) {
      entry.href = new URL(`../${post.page}`, import.meta.url);
    } else {
      entry.type = "button";
      entry.addEventListener("click", () => showPost(post));
    }
    entry.append(element("span", "post-meta", postMeta(post)), element("span", "post-title", post.title));
    if (post.excerpt) entry.append(element("span", "post-excerpt", post.excerpt));
    heading.append(entry);
    article.append(heading);
    fragment.append(article);
  }
  postList.append(fragment);
}

function parsePosts(raw, source) {
  if (!Array.isArray(raw)) throw new Error("Invalid post list");
  return raw.flatMap((entry) => {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.title !== "string" || !entry.title.trim()) return [];
    let page;
    if (source === "tistory") {
      try {
        const original = new URL(entry.url);
        if (original.protocol !== "https:" || original.hostname !== "pxjeong.tistory.com" || original.username || original.password || original.port) return [];
      } catch {
        return [];
      }
      if (typeof entry.page === "string" && /^posts\/[a-f0-9]{20}\.html$/.test(entry.page)) page = entry.page;
    }
    const body = typeof entry.body === "string" ? entry.body : "";
    const excerpt = typeof entry.excerpt === "string" ? entry.excerpt : body.slice(0, 160);
    return [{
      id: `${source}:${entry.id}`, title: entry.title,
      category: categoryById.has(entry.category) ? entry.category : "docs",
      date: typeof entry.date === "string" && Number.isFinite(Date.parse(entry.date)) ? entry.date : "",
      excerpt, body, page,
    }];
  });
}

async function loadPosts(path, source) {
  const response = await fetch(new URL(path, import.meta.url), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${source} posts`);
  return parsePosts(await response.json(), source);
}

function updateNavigation() {
  const route = ["posts", "experience"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

allButton.addEventListener("click", () => {
  const previous = topics.querySelector(`[data-topic="${selectedCategory}"]`);
  setCategory("");
  previous?.focus();
});
moreButton.addEventListener("click", () => {
  const firstNew = visibleLimit;
  visibleLimit += pageSize;
  renderPosts();
  postList.querySelectorAll(".post-link")[firstNew]?.focus();
});
document.querySelector("#close-post").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
window.addEventListener("hashchange", updateNavigation);
updateNavigation();

const results = await Promise.allSettled([
  loadPosts("../data/posts.json", "local"),
  loadPosts("../data/tistory.json", "tistory"),
]);
loadFailed = results.some((result) => result.status === "rejected");
const loaded = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
allPosts = [...new Map(loaded.map((post) => [post.id, post])).values()]
  .sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
buildTopics();
renderPosts();
startAquarium(allPosts, categories);
