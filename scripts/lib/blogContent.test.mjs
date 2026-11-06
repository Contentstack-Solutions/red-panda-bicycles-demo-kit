import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countWords } from "../../src/lib/blog.js";

const DIR = join(process.cwd(), "content/blog");
const ALLOWED = new Set(["doc", "h2", "h3", "p", "ol", "ul", "li", "blockquote", "a"]);
const textOf = (n) => (typeof n?.text === "string" ? n.text : (n?.children ?? []).map(textOf).join(" "));
const load = (file) => {
  const data = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  return { file, data, body: textOf(data.body), words: countWords(data.body) };
};
const articles = readdirSync(DIR).filter((f) => f.endsWith(".json")).map(load);
const byUrl = Object.fromEntries(articles.map((a) => [a.data.url, a]));
const DAY_TRIPS = "/blog/best-biking-day-trips-around-amsterdam";

describe("blog content", () => {
  it("has exactly the three seed articles", () => {
    expect(Object.keys(byUrl).sort()).toEqual([
      "/blog/5-things-nobody-tells-you-about-riding-in-amsterdam",
      "/blog/a-rainy-tuesday-on-the-amstel",
      DAY_TRIPS,
    ]);
  });

  it.each(articles.map((a) => [a.file, a]))("%s has complete metadata and a valid JSON RTE body", (_file, a) => {
    for (const key of ["title", "url", "category", "excerpt", "author_name", "author_role", "publish_date", "cover"]) {
      expect(a.data[key], key).toBeTruthy();
    }
    expect(["guides", "diaries", "tips"]).toContain(a.data.category);
    expect(a.data.publish_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.data.cover).toMatch(/\.webp$/);
    expect(typeof a.data.trip_planner).toBe("boolean");
    expect(a.data.body.type).toBe("doc");
    const walk = (n) => { if (n.type) expect(ALLOWED.has(n.type), n.type).toBe(true); (n.children ?? []).forEach(walk); };
    walk(a.data.body);
  });

  it("day-trips article is the ~1,200-word guide covering all six far attractions, with a Trip Planner", () => {
    const a = byUrl[DAY_TRIPS];
    expect(a.data.title).toBe("Best Biking Day Trips Around Amsterdam");
    expect(a.data.category).toBe("guides");
    expect(a.data.trip_planner).toBe(true);
    expect(a.words).toBeGreaterThanOrEqual(1000);
    expect(a.words).toBeLessThanOrEqual(1500);
    for (const name of ["Amstelpark", "Durgerdam", "Amsterdamse Bos", "Zaanse Schans", "Marken", "Zandvoort"]) {
      expect(a.body, name).toContain(name);
    }
  });

  it("the other two are ~700-word pieces without a Trip Planner", () => {
    for (const a of articles.filter((x) => x.data.url !== DAY_TRIPS)) {
      expect(a.data.trip_planner, a.file).toBe(false);
      expect(a.words, a.file).toBeGreaterThanOrEqual(550);
      expect(a.words, a.file).toBeLessThanOrEqual(950);
    }
  });

  it("day-trips is the newest article", () => {
    const newest = [...articles].sort((x, y) => y.data.publish_date.localeCompare(x.data.publish_date))[0];
    expect(newest.data.url).toBe(DAY_TRIPS);
  });
});
