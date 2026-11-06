import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KitError } from "./env.mjs";
import {
  splitReferences,
  remapExtensions,
  entryRefs,
  rewriteEntry,
  importOrder,
  loadSnapshot,
  danglingRefs,
  pruneRefs,
} from "./importPlan.mjs";

const SEED = fileURLToPath(new URL("../../../seed/contentstack", import.meta.url));
const readSeed = (rel) => JSON.parse(readFileSync(path.join(SEED, rel), "utf8"));
const ctSchema = (uid) => readSeed(`content_types/${uid}.json`).content_type.schema;
const gfSchema = (uid) => readSeed(`global_fields/${uid}.json`).global_field.schema;

// Every field uid in a schema, at any depth, with its data_type.
function fieldsOf(schema, prefix = "") {
  const out = [];
  for (const f of schema ?? []) {
    const p = prefix ? `${prefix}.${f.uid}` : f.uid;
    out.push({ path: p, data_type: f.data_type });
    if (Array.isArray(f.schema)) out.push(...fieldsOf(f.schema, p));
    for (const b of f.blocks ?? []) out.push(...fieldsOf(b.schema, `${p}.${b.uid}`));
  }
  return out;
}

let cached;
const snap = () => (cached ??= loadSnapshot(SEED));
// The homepage is the only content type with one entry in two locales; read its uid from the snapshot.
const homepage = (locale = "en") => snap().entries.find((e) => e.ct === "homepage" && e.locale === locale);
const ASSETS = { a_cover: { uid: "tA1", url: "https://t.example/tA1/cover.webp" }, a_body: { uid: "tA2", url: "https://t.example/tA2/inline.png" }, a_bike: { uid: "tA3", url: "https://t.example/tA3/bike.png" }, a_img1: { uid: "tA4", url: "u4" }, a_img2: { uid: "tA5", url: "u5" } };

describe("splitReferences", () => {
  it("strips nested refs and keeps global_field blocks", () => {
    const page = ctSchema("page");
    const { base, full } = splitReferences(page);
    expect(full).toEqual(page);
    expect(base.map((f) => f.uid)).toEqual(["title", "url", "modular_blocks"]);
    const blocks = base.find((f) => f.uid === "modular_blocks").blocks;
    expect(blocks.map((b) => b.reference_to)).toEqual(["product_banner", "trust_strip", "text_and_image", "newsletter_signup", "trip_planner", "category_banner"]);

    const trip = gfSchema("trip_planner");
    const split = splitReferences(trip);
    expect(split.full).toEqual(trip);
    const paths = fieldsOf(split.base);
    expect(paths.filter((f) => f.data_type === "reference")).toEqual([]);
    expect(paths.map((f) => f.path)).not.toContain("attractions");
    expect(paths.map((f) => f.path)).not.toContain("bikes.link_page");
    expect(paths.map((f) => f.path)).toEqual(expect.arrayContaining(["bikes", "bikes.title", "bikes.image", "threshold_km"]));
  });

  it("strips refs inside nested groups, inline blocks and inline global_field schemas, and does not mutate the input", () => {
    const footer = ctSchema("footer");
    const before = JSON.stringify(footer);
    const { base } = splitReferences(footer);
    expect(JSON.stringify(footer)).toBe(before);
    expect(fieldsOf(base).map((f) => f.path)).toEqual(["title", "name", "tagline", "link_columns", "link_columns.column", "link_columns.column.text", "social_label"]);

    const synthetic = [
      { uid: "mb", data_type: "blocks", blocks: [
        { uid: "inline", schema: [{ uid: "t", data_type: "text" }, { uid: "r", data_type: "reference", reference_to: ["page"] }] },
        { uid: "only_ref", schema: [{ uid: "r", data_type: "reference", reference_to: ["page"] }] },
        { uid: "gf_block", reference_to: "trust_strip" },
      ] },
      { uid: "gf", data_type: "global_field", reference_to: "x", schema: [{ uid: "t", data_type: "text" }, { uid: "r", data_type: "reference", reference_to: ["page"] }] },
      { uid: "grp", data_type: "group", schema: [{ uid: "r", data_type: "reference", reference_to: ["page"] }] },
      { uid: "rte", data_type: "json", field_metadata: { allow_json_rte: true, embed_entry: true }, reference_to: ["sys_assets", "page"] },
    ];
    const out = splitReferences(synthetic);
    expect(fieldsOf(out.base).map((f) => f.path)).toEqual(["mb", "mb.inline.t", "gf", "gf.t", "rte"]);
    expect(out.base[0].blocks.map((b) => b.uid)).toEqual(["inline", "gf_block"]);
    // An RTE may only embed assets until the content types it embeds exist.
    expect(out.base.find((f) => f.uid === "rte").reference_to).toEqual(["sys_assets"]);
    expect(out.full).toEqual(synthetic);
  });
});

describe("remapExtensions", () => {
  const uidToTitle = Object.fromEntries(readSeed("extensions.json").map((e) => [e.uid, e.title]));

  it("rewrites extension_uid by title at any depth", () => {
    const out = remapExtensions(ctSchema("pdp"), { "RP Commerce Products": "tgtProducts" }, uidToTitle);
    expect(out.find((f) => f.uid === "product").extension_uid).toBe("tgtProducts");
    const acc = out.find((f) => f.uid === "recommended_accessories");
    expect(acc.schema.find((f) => f.uid === "product_item").extension_uid).toBe("tgtProducts");
    expect(ctSchema("pdp").find((f) => f.uid === "product").extension_uid).toBe("blt178c6b69dcb0752a");
  });

  it("throws listing missing titles", () => {
    const schema = [...ctSchema("pdp"), ...gfSchema("category_banner")];
    let err;
    try {
      remapExtensions(schema, { "RP Commerce Products": "tgtProducts" }, uidToTitle);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(2);
    expect(err.details.missing).toEqual(["RP Commerce Category"]);
    expect(err.message).toContain("RP Commerce Category");
  });
});

describe("rewriteEntry", () => {
  const blogSchema = ctSchema("blog_article");
  const blogFixture = () => ({
    uid: "srcBlog",
    title: "Fixture",
    locale: "en",
    tags: ["x"],
    cover_image: { uid: "a_cover", filename: "cover.webp", title: "cover.webp" },
    body: {
      type: "doc", uid: "d1", attrs: {},
      children: [
        { type: "p", uid: "p1", attrs: {}, children: [{ text: "Hi" }] },
        { type: "reference", uid: "r1", attrs: { type: "asset", "asset-uid": "a_body", "content-type-uid": "sys_assets", "asset-link": "https://source.example/a_body/inline.png", "display-type": "display" }, children: [{ text: "" }] },
        { type: "p", uid: "p2", attrs: {}, children: [{ text: "See " }, { type: "reference", uid: "r2", attrs: { type: "entry", "entry-uid": "srcAttr1", "content-type-uid": "attraction", locale: "en", "display-type": "inline" }, children: [{ text: "" }] }] },
      ],
    },
    trip_planner: {
      title: "Where to next",
      attractions: [{ uid: "srcAttr1", _content_type_uid: "attraction" }, { uid: "srcAttr2", _content_type_uid: "attraction" }],
      bikes: [{ title: "Volt", image: { uid: "a_bike", filename: "bike.png" }, link_page: [{ uid: "srcPdp", _content_type_uid: "pdp" }] }],
    },
    taxonomies: [{ taxonomy_uid: "article", term_uid: "stories" }],
  });
  const uidMap = { srcAttr1: "tE1", srcAttr2: "tE2", srcPdp: "tE3" };

  it("maps refs, files and RTE embeds", () => {
    const src = blogFixture();
    const out = rewriteEntry(src, blogSchema, uidMap, ASSETS, { withReferences: true, globalFields: snap().globalFields });
    expect(out.uid).toBeUndefined();
    expect(out.title).toBe("Fixture");
    expect(out.cover_image).toBe("tA1");
    expect(out.body.children[1].attrs).toEqual({ type: "asset", "asset-uid": "tA2", "content-type-uid": "sys_assets", "asset-link": "https://t.example/tA2/inline.png", "display-type": "display" });
    expect(out.body.children[2].children[1].attrs).toEqual({ type: "entry", "entry-uid": "tE1", "content-type-uid": "attraction", locale: "en", "display-type": "inline" });
    expect(out.trip_planner.attractions).toEqual([{ uid: "tE1", _content_type_uid: "attraction" }, { uid: "tE2", _content_type_uid: "attraction" }]);
    expect(out.trip_planner.bikes[0]).toEqual({ title: "Volt", image: "tA3", link_page: [{ uid: "tE3", _content_type_uid: "pdp" }] });
    expect(out.taxonomies).toEqual([{ taxonomy_uid: "article", term_uid: "stories" }]);
    expect(src).toEqual(blogFixture());
  });

  it("maps multiple file fields to arrays of target asset uids and leaves extension JSON alone", () => {
    const product = { selectedIds: ["p1"], items: [{ id: "p1", name: "Pannier" }] };
    const entry = { title: "P", images: [{ uid: "a_img1", filename: "1.png" }, { uid: "a_img2", filename: "2.png" }], product, recommended_accessories: [{ product_item: product }] };
    const out = rewriteEntry(entry, ctSchema("pdp"), {}, ASSETS, { withReferences: true });
    expect(out.images).toEqual(["tA4", "tA5"]);
    expect(out.product).toEqual(product);
    expect(out.recommended_accessories).toEqual([{ product_item: product }]);
  });

  it("throws naming the path and uid when a reference is missing from uidMap", () => {
    const entry = blogFixture();
    let err;
    try {
      rewriteEntry(entry, blogSchema, { srcAttr1: "tE1", srcAttr2: "tE2" }, ASSETS, { withReferences: true, globalFields: snap().globalFields });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(1);
    expect(err.message).toContain("trip_planner.bikes[0].link_page[0]");
    expect(err.message).toContain("srcPdp");
  });

  it("throws when a file field's asset is missing from assetMap", () => {
    expect(() => rewriteEntry({ cover_image: { uid: "nope" } }, blogSchema, {}, ASSETS, { withReferences: true })).toThrow(/nope at cover_image/);
  });

  it("refuses to pass a global field through unread when its schema is unknown", () => {
    expect(() => rewriteEntry(blogFixture(), blogSchema, uidMap, ASSETS, { withReferences: true })).toThrow(/trip_planner/);
  });

  it("withReferences:false empties homepage.hero", () => {
    const { entry } = homepage();
    expect(entry.hero.length).toBe(1);
    const assetMap = Object.fromEntries(snap().assets.map((a) => [a.uid, { uid: `t_${a.uid}`, url: `https://t.example/${a.uid}` }]));
    const out = rewriteEntry(entry, ctSchema("homepage"), {}, assetMap, { withReferences: false, globalFields: snap().globalFields });
    expect(out.hero).toEqual([]);
    // Nested references inside global-field blocks are emptied too; there is nothing to map yet.
    const cat = out.modular_blocks.find((b) => b.category_banner).category_banner;
    expect(cat.link_page).toEqual([]);
    expect(cat.category.every((c) => Array.isArray(c.link) && c.link.length === 0)).toBe(true);
    expect(entryRefs(out, ctSchema("homepage"), { globalFields: snap().globalFields })).toEqual([]);
  });

  it("withReferences:false drops RTE entry embeds but keeps asset embeds", () => {
    const out = rewriteEntry(blogFixture(), blogSchema, {}, ASSETS, { withReferences: false, globalFields: snap().globalFields });
    expect(out.body.children[1].attrs["asset-uid"]).toBe("tA2");
    expect(out.body.children[2].children).toEqual([{ text: "See " }]);
    expect(out.trip_planner.attractions).toEqual([]);
    expect(out.trip_planner.bikes[0].link_page).toEqual([]);
    expect(out.trip_planner.bikes[0].image).toBe("tA3");
  });
});

describe("entryRefs", () => {
  it("lists every referenced entry with its path, including nested blocks", () => {
    const { entry } = homepage();
    const refs = entryRefs(entry, ctSchema("homepage"), { globalFields: snap().globalFields });
    expect(refs[0]).toEqual({ path: "hero[0]", ct: "hero_banner", uid: entry.hero[0].uid });
    expect(snap().entries.some((e) => e.ct === "hero_banner" && e.uid === refs[0].uid)).toBe(true);
    expect(refs).toContainEqual({ path: "modular_blocks[0].category_banner.link_page[0]", ct: "e_bikes", uid: "bltde7b62f4aefc327a" });
    expect(refs).toContainEqual({ path: "modular_blocks[4].text_and_image.page[0]", ct: "page", uid: "blta1345c14d3fa0a97" });
  });
});

describe("danglingRefs and pruneRefs", () => {
  it("finds references to entries that are not in the snapshot", () => {
    expect(danglingRefs(snap())).toEqual([
      { entry: `homepage/${homepage().uid}.en`, path: "modular_blocks[4].text_and_image.page[0]", ct: "page", uid: "blta1345c14d3fa0a97" },
      { entry: `homepage/${homepage().uid}.nl`, path: "modular_blocks[3].article_previews.articles[0]", ct: "blog_article", uid: "bltd24688284ac70c2f" },
      { entry: `homepage/${homepage().uid}.nl`, path: "modular_blocks[4].text_and_image.page[0]", ct: "page", uid: "blta1345c14d3fa0a97" },
    ]);
  });

  it("removes only the named references, so rewriteEntry then maps every remaining one", () => {
    const snapshot = snap();
    const { entry } = snapshot.entries.find((e) => e.ct === "homepage" && e.locale === "nl");
    const opts = { globalFields: snapshot.globalFields };
    const pruned = pruneRefs(entry, ctSchema("homepage"), new Set(["blta1345c14d3fa0a97", "bltd24688284ac70c2f"]), opts);
    expect(pruned.modular_blocks[4].text_and_image.page).toEqual([]);
    expect(pruned.modular_blocks[3].article_previews.articles.map((r) => r.uid)).toEqual(["blt331c96e80897b49e", "bltb9cd165941b883ad"]);
    expect(entryRefs(pruned, ctSchema("homepage"), opts).length).toBe(entryRefs(entry, ctSchema("homepage"), opts).length - 2);
    const uidMap = Object.fromEntries(snapshot.entries.map((e) => [e.uid, `t_${e.uid}`]));
    const assetMap = Object.fromEntries(snapshot.assets.map((a) => [a.uid, { uid: `t_${a.uid}`, url: "u" }]));
    expect(() => rewriteEntry(entry, ctSchema("homepage"), uidMap, assetMap, { withReferences: true, ...opts })).toThrow(/blta1345c14d3fa0a97|bltd24688284ac70c2f/);
    expect(() => rewriteEntry(pruned, ctSchema("homepage"), uidMap, assetMap, { withReferences: true, ...opts })).not.toThrow();
  });

  it("rewrites every snapshot entry in both passes once dangling references are pruned", () => {
    const snapshot = snap();
    const schemas = Object.fromEntries(snapshot.contentTypes.map((c) => [c.uid, c.schema]));
    const missing = new Set(danglingRefs(snapshot).map((d) => d.uid));
    const uidMap = Object.fromEntries(snapshot.entries.map((e) => [e.uid, `t_${e.uid}`]));
    const assetMap = Object.fromEntries(snapshot.assets.map((a) => [a.uid, { uid: `t_${a.uid}`, url: "u" }]));
    const opts = { globalFields: snapshot.globalFields };
    for (const e of snapshot.entries) {
      const pruned = pruneRefs(e.entry, schemas[e.ct], missing, opts);
      const base = rewriteEntry(pruned, schemas[e.ct], {}, assetMap, { withReferences: false, ...opts });
      expect(entryRefs(base, schemas[e.ct], opts)).toEqual([]);
      const full = rewriteEntry(pruned, schemas[e.ct], uidMap, assetMap, { withReferences: true, ...opts });
      for (const r of entryRefs(full, schemas[e.ct], opts)) expect(r.uid).toMatch(/^t_/);
      expect(JSON.stringify(full)).not.toMatch(/"filename"/);
    }
  });
});

describe("importOrder", () => {
  const PHASES = ["locales", "environments", "taxonomies", "globalFields:base", "contentTypes:base", "globalFields:full", "contentTypes:full", "folders", "assets", "entries:base", "entries:full", "publish:assets", "publish:entries"];

  it("lists base passes before full passes", () => {
    const steps = importOrder(snap());
    const phases = steps.map((s) => s.phase);
    const seen = [...new Set(phases)];
    expect(seen).toEqual(PHASES);
    // phases are contiguous: no phase reappears after a later one started
    for (let i = 1; i < phases.length; i++) expect(PHASES.indexOf(phases[i])).toBeGreaterThanOrEqual(PHASES.indexOf(phases[i - 1]));
    const count = (p) => steps.filter((s) => s.phase === p).length;
    expect(count("globalFields:base")).toBe(7);
    expect(count("globalFields:full")).toBe(7);
    expect(count("contentTypes:base")).toBe(10);
    expect(count("contentTypes:full")).toBe(10);
    expect(count("entries:base")).toBe(32);
    expect(count("entries:full")).toBe(32);
    expect(count("assets")).toBe(35);
    expect(count("publish:assets")).toBe(35);
    expect(steps.filter((s) => s.phase === "contentTypes:base").map((s) => s.key)).toEqual(snap().order.content_types);
    const base = steps.filter((s) => s.phase === "entries:base").map((s) => s.key);
    expect(base.indexOf(`homepage/${homepage().uid}.en`)).toBeLessThan(base.indexOf(`homepage/${homepage().uid}.nl`));
    expect(steps.find((s) => s.phase === "entries:base")).toEqual({ phase: "entries:base", kind: "entry", key: "page/bltd721b60dbddc0406.en" });
    // Only entries published somewhere are published.
    const unpublished = snap().entries.filter((e) => !e.publish_environments.length).map((e) => `${e.ct}/${e.uid}.${e.locale}`);
    const published = steps.filter((s) => s.phase === "publish:entries").map((s) => s.key);
    for (const k of unpublished) expect(published).not.toContain(k);
    expect(published.length).toBe(snap().entries.length - unpublished.length);
  });

  it("emits folders parents before children and locales after their fallback", () => {
    const synthetic = {
      ...snap(),
      locales: [{ code: "nl", fallback_locale: "en" }, { code: "en", fallback_locale: null }],
      folders: [
        { uid: "grandchild", name: "g", parent_uid: "child" },
        { uid: "child", name: "c", parent_uid: "root" },
        { uid: "orphanParent", name: "o", parent_uid: "notInSnapshot" },
        { uid: "root", name: "r", parent_uid: null },
      ],
    };
    const out = importOrder(synthetic);
    const folderKeys = out.filter((s) => s.phase === "folders").map((s) => s.key);
    expect([...folderKeys].sort()).toEqual(["child", "grandchild", "orphanParent", "root"]);
    for (const f of synthetic.folders) {
      if (folderKeys.includes(f.parent_uid)) expect(folderKeys.indexOf(f.parent_uid)).toBeLessThan(folderKeys.indexOf(f.uid));
    }
    expect(out.filter((s) => s.phase === "locales").map((s) => s.key)).toEqual(["en", "nl"]);
  });
});

describe("loadSnapshot", () => {
  it("reads the committed snapshot", () => {
    expect(snap().contentTypes.map((c) => c.uid)).toEqual(snap().order.content_types);
    expect(snap().globalFields.length).toBe(7);
    expect(snap().entries.length).toBe(32);
    expect(snap().entries.filter((e) => e.locale === "nl").length).toBe(1);
    expect(snap().assets.length).toBe(35);
    expect(snap().folders.length).toBe(6);
    expect(snap().extensions.map((e) => e.title)).toEqual(["RP Commerce Products", "RP Commerce Category"]);
    expect(snap().taxonomies.map((t) => t.taxonomy.uid).sort()).toEqual(["article", "locations"]);
    expect(snap().locales.length).toBe(2);
    expect(snap().environments.map((e) => e.name)).toContain("preview");
    expect(snap().variants).toEqual([]);
    const e = homepage();
    expect(e).toMatchObject({ uid: expect.stringMatching(/^blt/), publish_environments: expect.any(Array) });
    expect(homepage("nl").uid).toBe(e.uid);
    expect(e.entry.title).toBe("Homepage");
  });

  it("names a missing snapshot directory with exit code 2", () => {
    let err;
    try {
      loadSnapshot(path.join(SEED, "does-not-exist"));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(2);
    expect(err.message).toContain("does-not-exist");
  });
});
