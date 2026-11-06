// Pure helpers for the Journal (blog): reading time, dates, links, ordering.

const WORDS_PER_MINUTE = 200;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CATEGORY_LABELS = { guides: "Guides", diaries: "Rider Diaries", tips: "Tips" };

function collectText(node, out) {
  if (!node) return;
  if (typeof node.text === "string") out.push(node.text);
  (node.children ?? []).forEach((child) => collectText(child, out));
}

// Counts words across every text leaf of a Contentstack JSON rich-text document.
export function countWords(rte) {
  const parts = [];
  collectText(rte, parts);
  return parts.join(" ").split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(rte) {
  return Math.max(1, Math.ceil(countWords(rte) / WORDS_PER_MINUTE));
}

// "2026-09-20" → "20 Sep 2026". Date-only values are read as UTC so the day
// never shifts with the viewer's timezone.
export function formatPublishDate(iso) {
  if (!iso) return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function articleHref(article, locale) {
  const url = article?.url;
  if (!url) return `/${locale}/blog`;
  return `/${locale}${url.startsWith("/") ? url : `/${url}`}`;
}

export function categoryLabel(value) {
  return CATEGORY_LABELS[value] ?? value ?? "";
}

const newestFirst = (a, b) => (b?.publish_date ?? "").localeCompare(a?.publish_date ?? "");

export function sortByPublishDate(articles) {
  return [...(articles ?? [])].sort(newestFirst);
}

// Same order, but each article keeps its index in the CMS reference field, which
// Live Preview edit tags (`articles__<index>`) are keyed on.
export function newestFirstWithIndex(articles) {
  return (articles ?? []).map((article, index) => ({ article, index })).sort((x, y) => newestFirst(x.article, y.article));
}

// Referenced entries that are unpublished or deleted come back without a url.
export function publishedArticles(articles) {
  return (articles ?? []).filter((article) => Boolean(article?.url));
}

// The homepage Article Previews module: the n most recently published articles.
export function latestArticles(articles, n = 3) {
  return sortByPublishDate(publishedArticles(articles)).slice(0, n);
}

// Everything an article card renders, and nothing else. A card links to an article,
// so the article's own content - its body, its Trip Planner - has no business in the
// HTML of the page holding the card. Reading time is counted here so the body itself
// never has to travel to the browser.
const CARD_FIELDS = ["uid", "_content_type_uid", "url", "title", "excerpt", "category", "cover_image", "publish_date", "locale", "$"];

export function articleCards(articles) {
  return (articles ?? []).map((article) => {
    const card = { reading_minutes: readingMinutes(article?.body) };
    for (const field of CARD_FIELDS) if (article?.[field] !== undefined) card[field] = article[field];
    return card;
  });
}

// Article Previews cards: the block's picked references, newest first, so one just
// added at the end of the field can still lead. In Live Preview unpublished picks
// resolve too. If no reference resolves, the latest articles (index null: no edit tag).
export function previewArticles(references, latest = []) {
  const picked = newestFirstWithIndex(references).filter(({ article }) => article?.url);
  if (picked.length > 0) return picked;
  return (latest ?? []).map((article) => ({ article, index: null }));
}

export function pickRelated(articles, currentUid, n = 2) {
  return sortByPublishDate(publishedArticles(articles))
    .filter((article) => article.uid !== currentUid)
    .slice(0, n);
}

export function hasTripPlanner(tripPlanner) {
  return Array.isArray(tripPlanner?.attractions) && tripPlanner.attractions.length > 0;
}

// Only forward searchParams to the Contentstack SDK's live_preview query when
// they actually carry a preview hash, so published fetches stay untouched.
export function livePreviewParams(searchParams) {
  if (searchParams?.live_preview || searchParams?.hash) return searchParams;
  return {};
}

export function bylineParts(article) {
  const parts = [];
  if (article?.author_name) parts.push({ key: "author_name", text: article.author_name });
  if (article?.author_role) parts.push({ key: "author_role", text: article.author_role });
  if (article?.publish_date) parts.push({ key: "publish_date", text: formatPublishDate(article.publish_date) });
  parts.push({ key: "reading_time", text: `${readingMinutes(article?.body)} min read` });
  return parts;
}
