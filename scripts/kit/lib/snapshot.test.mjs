import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { slimAssetRefs, stripEntry, dependencyOrder, toVariantRecord, publishEnvironments } from "./snapshot.mjs";
import { exportStack } from "./export-stack.mjs";
import { parseEnvFile } from "../export-contentstack.mjs";
import { createCma } from "./cma.mjs";

describe("stripEntry", () => {
  it("removes system fields and keeps uid, title, locale and field values", () => {
    const out = stripEntry({
      uid: "e1", title: "T", locale: "en", headline: "Hi", hero: [{ uid: "h", _content_type_uid: "hero_banner" }],
      created_at: "x", created_by: "u", updated_at: "x", updated_by: "u", _version: 3, ACL: {},
      _in_progress: false, publish_details: [{}], _metadata: {},
    });
    expect(out).toEqual({ uid: "e1", title: "T", locale: "en", headline: "Hi", hero: [{ uid: "h", _content_type_uid: "hero_banner" }] });
  });
});

describe("slimAssetRefs", () => {
  const asset = { uid: "am1", title: "Bike", filename: "b.png", content_type: "image/png", url: "https://images.contentstack.io/v3/assets/bltKEY/am1/x/b.png", created_by: "cs1" };
  it("reduces embedded asset objects (single, list, nested) to uid refs and leaves other objects alone", () => {
    expect(slimAssetRefs({ image: asset, gallery: [asset], grp: { pic: asset, n: 1 }, ref: [{ uid: "h", _content_type_uid: "hero_banner" }] })).toEqual({
      image: { uid: "am1", filename: "b.png", title: "Bike" },
      gallery: [{ uid: "am1", filename: "b.png", title: "Bike" }],
      grp: { pic: { uid: "am1", filename: "b.png", title: "Bike" }, n: 1 },
      ref: [{ uid: "h", _content_type_uid: "hero_banner" }],
    });
  });
  it("is applied by stripEntry", () => {
    expect(stripEntry({ uid: "e", image: asset }).image).toEqual({ uid: "am1", filename: "b.png", title: "Bike" });
  });
});

describe("dependencyOrder", () => {
  const gfRef = (u) => ({ uid: "f_" + u, data_type: "global_field", reference_to: u });
  const ref = (to) => ({ uid: "r", data_type: "reference", reference_to: [to] });
  it("puts global-field users after their global fields and tolerates the page<->hero_banner reference cycle", () => {
    const gfs = [{ uid: "seo", schema: [] }, { uid: "wrap", schema: [gfRef("seo")] }];
    const cts = [
      { uid: "page", schema: [ref("hero_banner"), gfRef("wrap")] },
      { uid: "hero_banner", schema: [ref("page")] },
      { uid: "blog", schema: [{ uid: "g", data_type: "group", schema: [gfRef("seo")] }] },
    ];
    const order = dependencyOrder(cts, gfs);
    expect(order.sort()).toEqual(["blog", "hero_banner", "page"]);
    expect(dependencyOrder(cts, gfs)).toHaveLength(3);
  });
  it("orders a global-field-only chain deterministically", () => {
    const gfs = [{ uid: "a", schema: [] }];
    expect(dependencyOrder([{ uid: "x", schema: [gfRef("a")] }, { uid: "y", schema: [] }], gfs)).toEqual(["x", "y"]);
  });
});

describe("variants and publish helpers", () => {
  it("skips empty change sets and keeps only changed fields", () => {
    expect(toVariantRecord({ title: "t", _variant: { _uid: "v", _change_set: [] } })).toBeNull();
    const r = toVariantRecord({ title: "t", headline: "H", other: 1, _variant: { _uid: "v", _change_set: ["headline"] } },
      new Map([["v", { experience: "Exp", variant: "Var" }]]));
    expect(r).toEqual({ experience: "Exp", variant: "Var", variant_uid: "v", fields: { headline: "H" }, change_set: ["headline"] });
  });
  it("maps publish_details to env names for the locale", () => {
    const m = new Map([["e1", "preview"], ["e2", "prod"]]);
    expect(publishEnvironments({ publish_details: [{ environment: "e1", locale: "en" }, { environment: "e2", locale: "nl" }] }, m, "en")).toEqual(["preview"]);
  });
});

describe("parseEnvFile", () => {
  it("parses quotes, comments and export", () => {
    expect(parseEnvFile('# c\nexport A=1\nB="two words"\nC=x # tail\n')).toEqual({ A: "1", B: "two words", C: "x" });
  });
});

// Fake CMA: two content types (page, hero_banner with a circular reference), two locales.
function fakeFetch() {
  const json = (body, status = 200) => ({ status, ok: status < 300, json: async () => body, arrayBuffer: async () => new TextEncoder().encode("FILE").buffer });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const p = u.pathname.replace(/^\/v3/, "");
    const q = u.searchParams;
    if (u.hostname === "cdn.example") return json({});
    const skip = Number(q.get("skip") ?? 0);
    const only = (arr) => (skip === 0 ? arr : []);
    if (p === "/locales") return json({ locales: [{ code: "en", name: "English", fallback_locale: null }, { code: "nl", name: "Dutch", fallback_locale: "en" }] });
    if (p === "/environments") return json({ environments: [{ uid: "env1", name: "preview", urls: [] }] });
    if (p === "/global_fields") return json({ global_fields: only([{ uid: "seo", title: "SEO", schema: [] }]) });
    if (p === "/content_types") return json({ content_types: only([
      { uid: "page", title: "Page", options: {}, schema: [{ uid: "hero", data_type: "reference", reference_to: ["hero_banner"] }, { uid: "seo", data_type: "global_field", reference_to: "seo" }] },
      { uid: "hero_banner", title: "Hero", options: {}, schema: [{ uid: "page", data_type: "reference", reference_to: ["page"] }, { uid: "p", data_type: "json", extension_uid: "ext1" }] },
    ]) });
    if (p === "/extensions") return json({ extensions: [{ uid: "ext1", title: "RP Commerce Products" }, { uid: "ext2", title: "Unused" }] });
    if (p === "/taxonomies") return json({ taxonomies: only([{ uid: "locations", name: "Locations", description: "d" }]) });
    if (p === "/taxonomies/locations/terms") return json({ terms: only([{ uid: "eu", name: "EU", parent_uid: null, order: 1, extra: "x" }]) });
    if (p === "/assets") {
      if (q.get("include_folders")) return json({ assets: only([{ uid: "f1", name: "Blog", parent_uid: null, is_dir: true }]) });
      return json({ assets: only([{ uid: "a1", filename: "bike.png", title: "Bike", description: "", content_type: "image/png", parent_uid: "f1", url: "https://cdn.example/bike.png" }]) });
    }
    if (p === "/variant_groups") return json({ variant_groups: [] });
    let m = p.match(/^\/content_types\/(\w+)\/entries$/);
    if (m) {
      const loc = q.get("locale");
      const mk = (uid, locale) => ({ uid, title: uid, locale, _version: 2, created_at: "x", publish_details: [{ environment: "env1", locale }] });
      const en = m[1] === "page" ? [mk("p1", "en")] : [mk("h1", "en")];
      // nl returns an inherited en fallback plus one real nl entry for page
      const nl = m[1] === "page" ? [mk("p1", "en"), mk("p1", "nl")] : [];
      return json({ entries: only(loc === "nl" ? nl : en) });
    }
    m = p.match(/^\/content_types\/(\w+)\/entries\/(\w+)\/variants$/);
    if (m) return json({ entries: m[2] === "h1" && q.get("locale") === "en"
      ? [{ uid: "h1", _variant: { _uid: "var1", _change_set: ["headline"] }, headline: "Changed", title: "h1" }, { uid: "h1", _variant: { _uid: "var2", _change_set: [] } }]
      : [] });
    return json({}, 404);
  };
  return { fetchImpl, calls };
}

describe("exportStack against a fake CMA", () => {
  it("writes the snapshot layout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "snap-"));
    const out = path.join(root, "seed", "contentstack");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "stale.json"), "{}");
    const { fetchImpl } = fakeFetch();
    const cma = createCma({ apiKey: "k", managementToken: "t", fetchImpl, sleep: async () => {} });
    const counts = await exportStack({ cma, outDir: out, root, fetchImpl });
    const rd = async (f) => JSON.parse(await readFile(path.join(out, f), "utf8"));

    expect(await readdir(out)).not.toContain("stale.json");
    expect(await rd("locales.json")).toEqual([{ code: "en", name: "English", fallback_locale: null }, { code: "nl", name: "Dutch", fallback_locale: "en" }]);
    expect(await rd("environments.json")).toEqual([{ name: "preview" }]);
    expect(await rd("extensions.json")).toEqual([{ uid: "ext1", title: "RP Commerce Products" }]);
    expect(await rd("taxonomies/locations.json")).toEqual({
      taxonomy: { uid: "locations", name: "Locations", description: "d" },
      terms: [{ uid: "eu", name: "EU", parent_uid: null, order: 1 }],
    });
    expect((await rd("global_fields/seo.json")).global_field.uid).toBe("seo");
    expect((await rd("content_types/page.json")).content_type.title).toBe("Page");
    expect(await rd("folders.json")).toEqual([{ uid: "f1", name: "Blog", parent_uid: null }]);
    expect(await rd("assets/manifest.json")).toEqual([{ uid: "a1", filename: "bike.png", title: "Bike", description: "", content_type: "image/png", parent_uid: "f1", file: "assets/files/a1-bike.png" }]);
    expect(await readFile(path.join(out, "assets/files/a1-bike.png"), "utf8")).toBe("FILE");

    const en = await rd("entries/page/p1.en.json");
    expect(en).toEqual({ entry: { uid: "p1", title: "p1", locale: "en" }, publish_environments: ["preview"] });
    expect((await rd("entries/page/p1.nl.json")).entry.locale).toBe("nl");
    expect((await readdir(path.join(out, "entries/page"))).sort()).toEqual(["p1.en.json", "p1.nl.json"]);

    expect(await rd("variants/hero_banner/h1.en.json")).toEqual([
      { experience: null, variant: null, variant_uid: "var1", fields: { headline: "Changed" }, change_set: ["headline"] },
    ]);
    const order = await rd("order.json");
    expect(order.content_types.sort()).toEqual(["hero_banner", "page"]);
    expect(order.entries).toEqual(expect.arrayContaining([{ ct: "page", uid: "p1" }, { ct: "hero_banner", uid: "h1" }]));
    expect(order.entries).toHaveLength(2);
    expect(counts).toMatchObject({ content_types: 2, entries: 3, assets: 1, variants: 1, extensions: 1 });
  });

  it("keeps the old snapshot when the export fails, and warns on null list calls", async () => {
    const base = fakeFetch().fetchImpl;
    const root = await mkdtemp(path.join(tmpdir(), "snap-"));
    const out = path.join(root, "seed", "contentstack");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "keep.json"), "{}");
    const warnings = [];
    const fetchImpl = async (url, init) => url.includes("/variant_groups") ? { status: 404, ok: false, json: async () => ({}) }
      : /\/content_types\/hero_banner\/entries\?/.test(url) ? { status: 400, ok: false, json: async () => ({}) } : base(url, init);
    const cma = createCma({ apiKey: "k", managementToken: "t", fetchImpl, sleep: async () => {} });
    await expect(exportStack({ cma, outDir: out, root, fetchImpl, warn: (m) => warnings.push(m) })).rejects.toThrow();
    expect(await readdir(out)).toEqual(["keep.json"]);
    expect((await readdir(path.dirname(out))).filter((n) => n.includes(".tmp-"))).toEqual([]);
    expect(warnings.some((w) => w.includes("/variant_groups"))).toBe(true);
  });

  it("ignores non-folder rows in the folder query and adds variants/.gitkeep when there are no variants", async () => {
    const base = fakeFetch().fetchImpl;
    const fetchImpl = async (url, init) => {
      const r = await base(url, init);
      if (url.includes("include_folders")) { const b = await r.json(); b.assets.push({ uid: "a1", name: "bike.png" }); return { ...r, json: async () => b }; }
      if (/\/variants/.test(url)) return { status: 200, ok: true, json: async () => ({ entries: [] }) };
      return r;
    };
    const cma = createCma({ apiKey: "k", managementToken: "t", fetchImpl, sleep: async () => {} });
    const out = path.join(await mkdtemp(path.join(tmpdir(), "snap-")), "c");
    await exportStack({ cma, outDir: out, fetchImpl, warn: () => {} });
    expect(JSON.parse(await readFile(path.join(out, "folders.json"), "utf8"))).toHaveLength(1);
    expect(await readdir(path.join(out, "variants"))).toEqual([".gitkeep"]);
  });

  it("fails clearly when a schema references an unknown extension", async () => {
    const base = fakeFetch().fetchImpl;
    const fetchImpl = async (url, init) => url.includes("/extensions") ? { status: 200, ok: true, json: async () => ({ extensions: [] }) } : base(url, init);
    const cma = createCma({ apiKey: "k", managementToken: "t", fetchImpl, sleep: async () => {} });
    const out = path.join(await mkdtemp(path.join(tmpdir(), "snap-")), "c");
    await expect(exportStack({ cma, outDir: out, fetchImpl })).rejects.toThrow(/ext1/);
  });
});
