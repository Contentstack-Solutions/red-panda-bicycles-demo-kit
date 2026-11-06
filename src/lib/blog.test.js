import { describe, expect, it } from "vitest";
import {
  articleHref,
  bylineParts,
  categoryLabel,
  countWords,
  formatPublishDate,
  hasTripPlanner,
  livePreviewParams,
  pickRelated,
  publishedArticles,
  readingMinutes,
  sortByPublishDate,
  newestFirstWithIndex,
  latestArticles,
  previewArticles,
  articleCards,
} from "./blog";

const doc = (...children) => ({ type: "doc", children });
const p = (...leaves) => ({ type: "p", children: leaves });
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("countWords / readingMinutes", () => {
  it("counts words across nested nodes and leaves", () => {
    const rte = doc(
      { type: "h2", children: [{ text: "Two words" }] },
      p({ text: "one " }, { text: "two", bold: true }, { type: "a", children: [{ text: "three four" }] }),
      { type: "ol", children: [{ type: "li", children: [{ text: "five" }] }] }
    );
    expect(countWords(rte)).toBe(7);
  });

  it("is at least one minute", () => {
    expect(readingMinutes(undefined)).toBe(1);
    expect(readingMinutes(doc())).toBe(1);
  });

  it("rounds up at 200 words per minute", () => {
    expect(readingMinutes(doc(p({ text: words(200) })))).toBe(1);
    expect(readingMinutes(doc(p({ text: words(201) })))).toBe(2);
    expect(readingMinutes(doc(p({ text: words(1200) })))).toBe(6);
  });
});

describe("formatPublishDate", () => {
  it("formats date-only values without timezone shift", () => {
    expect(formatPublishDate("2026-09-20")).toBe("20 Sep 2026");
    expect(formatPublishDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("formats full ISO timestamps in UTC", () => {
    expect(formatPublishDate("2026-12-31T23:30:00.000Z")).toBe("31 Dec 2026");
  });

  it("returns an empty string for missing or invalid input", () => {
    expect(formatPublishDate(undefined)).toBe("");
    expect(formatPublishDate("not a date")).toBe("");
  });
});

describe("articleHref", () => {
  it("prefixes the locale", () => {
    expect(articleHref({ url: "/blog/rainy-tuesday" }, "en")).toBe("/en/blog/rainy-tuesday");
    expect(articleHref({ url: "blog/rainy-tuesday" }, "fr")).toBe("/fr/blog/rainy-tuesday");
  });

  it("falls back to the blog landing page without a url", () => {
    expect(articleHref({}, "en")).toBe("/en/blog");
    expect(articleHref(undefined, "en")).toBe("/en/blog");
  });
});

describe("categoryLabel", () => {
  it("maps known categories", () => {
    expect(categoryLabel("guides")).toBe("Guides");
    expect(categoryLabel("diaries")).toBe("Rider Diaries");
    expect(categoryLabel("tips")).toBe("Tips");
  });

  it("falls back to the raw value or empty string", () => {
    expect(categoryLabel("news")).toBe("news");
    expect(categoryLabel(undefined)).toBe("");
  });
});

describe("sorting and selection", () => {
  const a = { uid: "a", url: "/blog/a", publish_date: "2026-09-10" };
  const b = { uid: "b", url: "/blog/b", publish_date: "2026-09-20" };
  const c = { uid: "c", url: "/blog/c", publish_date: "2026-09-15" };

  it("sorts newest first without mutating the input", () => {
    const input = [a, b, c];
    expect(sortByPublishDate(input).map((x) => x.uid)).toEqual(["b", "c", "a"]);
    expect(input.map((x) => x.uid)).toEqual(["a", "b", "c"]);
    expect(sortByPublishDate(undefined)).toEqual([]);
  });

  it("newestFirstWithIndex orders newest first and keeps each article's original index", () => {
    expect(newestFirstWithIndex([a, b, c])).toEqual([
      { article: b, index: 1 },
      { article: c, index: 2 },
      { article: a, index: 0 },
    ]);
    expect(newestFirstWithIndex(undefined)).toEqual([]);
  });

  it("newestFirstWithIndex puts undated articles last and keeps ties in curated order", () => {
    const undated = { uid: "u", url: "/blog/u" };
    const sameDayAsB = { uid: "b2", url: "/blog/b2", publish_date: "2026-09-20" };
    expect(newestFirstWithIndex([undated, b, a, sameDayAsB]).map((x) => x.article.uid)).toEqual(["b", "b2", "a", "u"]);
  });

  it("latestArticles returns the newest n published articles, mixed date formats included", () => {
    const newest = { uid: "n", url: "/blog/n", publish_date: "2026-09-25T00:00:00.000Z" };
    const unpublished = { uid: "z", publish_date: "2026-09-30" };
    expect(latestArticles([a, b, unpublished, c, newest]).map((x) => x.uid)).toEqual(["n", "b", "c"]);
    expect(latestArticles([a, b, c, newest], 2).map((x) => x.uid)).toEqual(["n", "b"]);
    expect(latestArticles(undefined)).toEqual([]);
  });

  it("previewArticles shows the picked references newest first, even one appended last", () => {
    const appended = { uid: "new", url: "/blog/new", publish_date: "2026-09-27T00:00:00.000Z" };
    const latest = [{ uid: "x", url: "/blog/x", publish_date: "2026-09-30" }];
    expect(previewArticles([a, b, appended], latest)).toEqual([
      { article: appended, index: 2 },
      { article: b, index: 1 },
      { article: a, index: 0 },
    ]);
  });

  it("previewArticles skips unresolved references and falls back to the latest articles", () => {
    const unresolved = { uid: "z", _content_type_uid: "blog_article" };
    expect(previewArticles([unresolved, c], [a]).map((x) => x.article.uid)).toEqual(["c"]);
    expect(previewArticles([unresolved], [a, b])).toEqual([
      { article: a, index: null },
      { article: b, index: null },
    ]);
    expect(previewArticles(undefined, undefined)).toEqual([]);
  });

  it("publishedArticles drops unresolved references", () => {
    const unresolved = { uid: "z", _content_type_uid: "blog_article" };
    expect(publishedArticles([a, unresolved, null, c])).toEqual([a, c]);
    expect(publishedArticles(undefined)).toEqual([]);
  });

  it("pickRelated excludes the current article and returns the newest n", () => {
    expect(pickRelated([a, b, c], "b").map((x) => x.uid)).toEqual(["c", "a"]);
    expect(pickRelated([a, b, c], "b", 1).map((x) => x.uid)).toEqual(["c"]);
    expect(pickRelated([b], "b")).toEqual([]);
  });
});

describe("hasTripPlanner", () => {
  it("is true only with at least one attraction", () => {
    expect(hasTripPlanner({ attractions: [{ uid: "x" }] })).toBe(true);
    expect(hasTripPlanner({ attractions: [] })).toBe(false);
    expect(hasTripPlanner({})).toBe(false);
    expect(hasTripPlanner(undefined)).toBe(false);
  });
});

describe("livePreviewParams", () => {
  it("returns an empty object when there is no live_preview or hash key", () => {
    expect(livePreviewParams(undefined)).toEqual({});
    expect(livePreviewParams({})).toEqual({});
    expect(livePreviewParams({ foo: "1" })).toEqual({});
  });

  it("returns the params object itself when live_preview or hash is truthy", () => {
    const withLivePreview = { live_preview: "abc", content_type_uid: "blog_article" };
    expect(livePreviewParams(withLivePreview)).toBe(withLivePreview);

    const withHash = { hash: "abc" };
    expect(livePreviewParams(withHash)).toBe(withHash);
  });
});

describe("bylineParts", () => {
  it("returns all four parts in order for a full article", () => {
    const article = {
      author_name: "Sanne de Vries",
      author_role: "Red Panda rider since 2011",
      publish_date: "2026-09-20",
      body: doc(p({ text: words(200) })),
    };
    expect(bylineParts(article)).toEqual([
      { key: "author_name", text: "Sanne de Vries" },
      { key: "author_role", text: "Red Panda rider since 2011" },
      { key: "publish_date", text: "20 Sep 2026" },
      { key: "reading_time", text: "1 min read" },
    ]);
  });

  it("omits author name and role when missing", () => {
    const article = { publish_date: "2026-09-20", body: doc(p({ text: words(200) })) };
    expect(bylineParts(article)).toEqual([
      { key: "publish_date", text: "20 Sep 2026" },
      { key: "reading_time", text: "1 min read" },
    ]);
  });

  it("omits the date when missing", () => {
    const article = { author_name: "Sanne de Vries", body: doc(p({ text: words(200) })) };
    expect(bylineParts(article)).toEqual([
      { key: "author_name", text: "Sanne de Vries" },
      { key: "reading_time", text: "1 min read" },
    ]);
  });
});

describe("articleCards", () => {
  const article = {
    uid: "blt1",
    url: "/blog/a-rainy-tuesday",
    title: "A Rainy Tuesday on the Amstel",
    excerpt: "A wet ride home.",
    category: "diaries",
    cover_image: { url: "https://example.test/cover.avif" },
    publish_date: "2026-09-20",
    body: doc(p({ text: words(400) })),
    trip_planner: { attractions: [{ title: "A'DAM Lookout" }] },
  };

  it("replaces the body with a reading time", () => {
    const [card] = articleCards([article]);
    expect(card.reading_minutes).toBe(2);
    expect(card.body).toBeUndefined();
  });

  it("drops content the card never renders, like the article's trip planner", () => {
    const [card] = articleCards([article]);
    expect(card.trip_planner).toBeUndefined();
    expect(JSON.stringify(card)).not.toContain("A'DAM Lookout");
  });

  it("keeps every field the card does render", () => {
    const [card] = articleCards([article]);
    expect(card).toMatchObject({
      uid: "blt1",
      url: "/blog/a-rainy-tuesday",
      title: "A Rainy Tuesday on the Amstel",
      excerpt: "A wet ride home.",
      category: "diaries",
      cover_image: { url: "https://example.test/cover.avif" },
      publish_date: "2026-09-20",
    });
  });

  it("handles a missing list and articles without a body", () => {
    expect(articleCards(undefined)).toEqual([]);
    expect(articleCards([{ title: "No body" }])[0].reading_minutes).toBe(1);
  });
});
