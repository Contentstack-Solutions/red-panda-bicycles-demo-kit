import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { KitError } from "./env.mjs";
import { loadSnapshot } from "./importPlan.mjs";
import { runImport } from "./importRun.mjs";
import { fakeCma } from "./fakeCma.mjs";

const SEED = fileURLToPath(new URL("../../../seed/contentstack", import.meta.url));
let cached;
const snap = () => (cached ??= loadSnapshot(SEED));
const readFile = async () => Buffer.from("img");
const isEntryPost = (r) => r.method === "POST" && /^\/content_types\/[^/]+\/entries$/.test(r.path);
const entriesIn = (store, locale = "en") => [...store.keys()].filter((k) => /^\/content_types\/[^/]+\/entries\//.test(k) && k.endsWith(`@${locale}`));

async function run(fake, opts = {}) {
  const saves = [];
  const lines = [];
  const state = opts.state ?? { version: 1, uidMap: {}, assets: {}, created: {}, phases: {} };
  const result = await runImport({
    cma: fake.cma,
    snapshot: snap(),
    state,
    envNames: opts.envNames ?? ["preview"],
    siteUrl: "https://site.example",
    dryRun: opts.dryRun ?? false,
    save: (s) => saves.push(structuredClone(s)),
    log: (l) => lines.push(l),
    readFile,
  });
  return { ...result, saves, lines };
}

const catchRun = (fake, opts) => run(fake, opts).then(() => { throw new Error("expected runImport to throw"); }, (e) => e);

// ---------------------------------------------------------------- tests

describe("runImport", () => {
  it("imports the snapshot into an empty stack", async () => {
    const fake = fakeCma();
    const s = snap();
    const { state, summary } = await run(fake);
    const en = s.entries.filter((e) => e.locale === "en");
    const nl = s.entries.filter((e) => e.locale === "nl");

    expect(summary.locales).toEqual({ created: 1, skipped: 1, updated: 0 }); // nl created, master en skipped
    expect(summary.environments.created).toBe(s.environments.length);
    expect(summary.taxonomies.created).toBe(s.taxonomies.length);
    expect(summary["globalFields:base"].created).toBe(s.globalFields.length);
    expect(summary["contentTypes:base"].created).toBe(s.contentTypes.length);
    expect(summary["globalFields:full"].updated).toBe(s.globalFields.length);
    expect(summary["contentTypes:full"].updated).toBe(s.contentTypes.length);
    expect(summary.folders.created).toBe(s.folders.length);
    expect(summary.assets.created).toBe(s.assets.length);
    expect(summary["entries:base"]).toEqual({ created: en.length, skipped: 0, updated: nl.length });
    expect(summary["entries:full"].updated).toBe(s.entries.length);
    expect(summary["publish:assets"].updated).toBe(s.assets.length);

    expect(entriesIn(fake.store)).toHaveLength(en.length);
    expect(entriesIn(fake.store, "nl")).toHaveLength(nl.length);
    expect(fake.log.filter(isEntryPost)).toHaveLength(en.length);

    // homepage.hero points at the new hero_banner uid
    const home = en.find((e) => e.ct === "homepage");
    const srcHero = home.entry.hero[0].uid;
    expect(state.ids.homepage).toBe(state.uidMap[home.uid]);
    expect(state.ids.heroBanner).toBe(state.uidMap[srcHero]);
    expect(state.ids.heroBanner).not.toBe(srcHero);
    const stored = fake.store.get(`/content_types/homepage/entries/${state.ids.homepage}@en`);
    expect(stored.hero).toEqual([{ uid: state.ids.heroBanner, _content_type_uid: "hero_banner" }]);
    expect(fake.store.has(`/content_types/hero_banner/entries/${state.ids.heroBanner}@en`)).toBe(true);

    // extensions remapped by title; schemas created base-first, then full
    const pdp = JSON.stringify(fake.store.get("/content_types/pdp"));
    expect(pdp).toContain("tgt_products");
    expect(pdp).not.toContain(s.extensions[0].uid);

    // state: created lists for teardown, maps for resume
    expect(state.created.contentTypes).toHaveLength(s.contentTypes.length);
    expect(state.created.entries).toHaveLength(en.length);
    expect(state.created.entries[0]).toEqual({ ct: expect.any(String), uid: expect.stringMatching(/^te/) });
    expect(state.created.locales).toEqual(["nl"]);
    expect(Object.keys(state.assets)).toHaveLength(s.assets.length);
    expect(state.assets[s.assets[0].uid]).toEqual({ uid: expect.stringMatching(/^ta/), url: expect.stringContaining("https://") });

    // environments created with SITE_URL; assets published before entries, homepage in en and nl
    expect(fake.store.get("/environments/preview").urls).toEqual([{ locale: "en", url: "https://site.example" }]);
    const writes = fake.writes();
    const lastAssetPublish = writes.findLastIndex((r) => /^\/assets\/[^/]+\/publish$/.test(r.path));
    const firstEntryPublish = writes.findIndex((r) => /\/entries\/[^/]+\/publish$/.test(r.path));
    expect(lastAssetPublish).toBeGreaterThan(-1);
    expect(firstEntryPublish).toBeGreaterThan(lastAssetPublish);
    const homePublish = writes.find((r) => r.path === `/content_types/homepage/entries/${state.ids.homepage}/publish`);
    expect(homePublish.body).toEqual({ entry: { environments: ["preview"], locales: ["en", "nl"] } });
  });

  it("resumes from state without re-creating", async () => {
    const store = new Map();
    let posts = 0;
    const killAfter10 = (r) => {
      if (isEntryPost(r) && ++posts > 10) throw new KitError("POST failed: 429", { code: 1, details: { status: 429 } });
    };
    const first = fakeCma({ store, hook: killAfter10 });
    const saves = [];
    const err = await runImport({
      cma: first.cma, snapshot: snap(), state: { version: 1, uidMap: {}, assets: {}, created: {}, phases: {} },
      envNames: ["preview"], siteUrl: "https://site.example", save: (s) => saves.push(structuredClone(s)), readFile,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(entriesIn(store)).toHaveLength(10);

    // Re-run from the last saved state (what .kit/state.json holds after the crash).
    const second = fakeCma({ store });
    const { state, summary } = await run(second, { state: saves.at(-1) });
    const en = snap().entries.filter((e) => e.locale === "en");
    expect(summary["entries:base"].skipped).toBe(10);
    expect(summary["contentTypes:base"]).toEqual({ created: 0, skipped: snap().contentTypes.length, updated: 0 });
    expect(entriesIn(store)).toHaveLength(en.length);

    // Each entry POSTed exactly once across both runs (the killed 11th never reached the stack).
    const succeeded = [...first.log.filter(isEntryPost).slice(0, 10), ...second.log.filter(isEntryPost)];
    expect(succeeded).toHaveLength(en.length);
    const titles = succeeded.map((r) => `${r.path} ${r.body.entry.title}`);
    expect(new Set(titles).size).toBe(en.length);
    expect(Object.keys(state.uidMap).filter((k) => en.some((e) => e.uid === k))).toHaveLength(en.length);
    // No schema object was POSTed twice either.
    expect(second.log.filter((r) => r.method === "POST" && ["/content_types", "/global_fields", "/taxonomies", "/environments", "/locales", "/assets", "/assets/folders"].includes(r.path))).toEqual([]);
  });

  it("saves state after every write, so a crash loses at most one", async () => {
    const events = [];
    const fake = fakeCma({ hook: (r) => { if (r.method !== "GET") events.push("write"); } });
    await runImport({
      cma: fake.cma, snapshot: snap(), state: { version: 1, uidMap: {}, assets: {}, created: {}, phases: {} },
      envNames: ["preview"], siteUrl: "https://site.example", save: () => events.push("save"), readFile,
    });
    const writes = events.filter((e) => e === "write").length;
    expect(writes).toBeGreaterThan(100);
    // Every write is followed by a save before the next write.
    events.forEach((e, i) => {
      if (e === "write") expect(events.slice(i + 1).find((x) => x === "save" || x === "write")).toBe("save");
    });
  });

  it("a second run is all skipped and writes nothing", async () => {
    const store = new Map();
    const { state } = await run(fakeCma({ store }));
    const again = fakeCma({ store });
    const { summary } = await run(again, { state: structuredClone(state) });
    for (const [phase, c] of Object.entries(summary)) {
      expect({ phase, created: c.created, updated: c.updated }).toEqual({ phase, created: 0, updated: 0 });
    }
    expect(again.writes()).toEqual([]);
  });

  it("recovers a create whose response was lost instead of duplicating it", async () => {
    const store = new Map();
    let n = 0;
    // The hero_banner content type POST and the 5th entry POST reach the stack, but the response is a 500.
    const lost = (r, { route }) => {
      const hit = (r.method === "POST" && r.path === "/content_types" && r.body.content_type.uid === "hero_banner") || (isEntryPost(r) && ++n === 5);
      if (!hit) return undefined;
      route();
      throw new KitError("POST failed: 500", { code: 1, details: { status: 500 } });
    };
    // Re-run from the last saved state until the import finishes (each lost response costs one run).
    let state = { version: 1, uidMap: {}, assets: {}, created: {}, phases: {} };
    let failures = 0;
    for (let i = 0; i < 4; i++) {
      const saves = [];
      const out = await runImport({
        cma: fakeCma({ store, hook: lost }).cma, snapshot: snap(), state: structuredClone(state),
        envNames: ["preview"], siteUrl: "https://site.example", save: (s) => saves.push(structuredClone(s)), readFile,
      }).catch((e) => e);
      if (!(out instanceof Error)) { state = out.state; break; }
      expect(out.details.status).toBe(500);
      failures++;
      state = saves.at(-1);
    }
    expect(failures).toBe(2);
    const en = snap().entries.filter((e) => e.locale === "en");
    expect(entriesIn(store)).toHaveLength(en.length);
    expect(state.created.contentTypes.filter((u) => u === "hero_banner")).toHaveLength(1);
    expect(state.created.entries).toHaveLength(en.length);
  });

  it("refuses a non-empty stack it did not create", async () => {
    const store = new Map([
      ["/content_types/page", { uid: "page", title: "Page", schema: [] }],
      ["/taxonomies/article", { uid: "article", name: "Article topics" }],
    ]);
    const fake = fakeCma({ store });
    const e = await catchRun(fake);
    expect(e).toBeInstanceOf(KitError);
    expect(e.code).toBe(3);
    expect(e.details.conflicts).toEqual(expect.arrayContaining(["content_type:page", "taxonomy:article"]));
    expect(e.message).toContain("content_type:page");
    expect(fake.log.filter((r) => r.method === "POST" || r.method === "PUT")).toEqual([]);
  });

  it("adopts an environment the SE created and does not treat it as a conflict", async () => {
    const store = new Map([["/environments/preview", { name: "preview", urls: [] }]]);
    const fake = fakeCma({ store });
    const { state, summary, lines } = await run(fake, { envNames: ["preview", "staging"] });
    expect(lines.filter((l) => l.includes('"staging"'))).toHaveLength(1);
    expect(state.adopted.environments).toEqual(["preview"]);
    expect(state.created.environments).not.toContain("preview");
    expect(summary.environments).toEqual({ created: snap().environments.length - 1, skipped: 1, updated: 0 });
    expect(fake.writes().filter((r) => r.path === "/environments").map((r) => r.body.environment.name)).not.toContain("preview");
    // staging does not exist in the stack, so publishes go to preview only.
    const pubs = fake.writes().filter((r) => r.path.endsWith("/publish"));
    expect(pubs.length).toBeGreaterThan(0);
    for (const r of pubs) expect((r.body.entry ?? r.body.asset).environments).toEqual(["preview"]);
  });

  // Ruling R13: a non-master locale already in the stack is adopted, like an environment.
  it("adopts a pre-existing nl locale and still localizes the nl entry", async () => {
    const store = new Map([["/locales/nl", { code: "nl", name: "Dutch", fallback_locale: "en" }]]);
    const fake = fakeCma({ store });
    const { state, summary } = await run(fake);
    expect(state.adopted.locales).toEqual(["nl"]);
    expect(state.created.locales).toEqual([]);
    expect(summary.locales).toEqual({ created: 0, skipped: 2, updated: 0 });
    expect(fake.writes().filter((r) => r.path === "/locales")).toEqual([]);
    const nlPuts = fake.writes().filter((r) => r.method === "PUT" && r.query.locale === "nl");
    expect(nlPuts.map((r) => r.path)).toContain(`/content_types/homepage/entries/${state.ids.homepage}`);
    expect(fake.store.has(`/content_types/homepage/entries/${state.ids.homepage}@nl`)).toBe(true);
  });

  it("stops before schema writes when commerce extensions are missing", async () => {
    const fake = fakeCma({ extensions: [{ uid: "tgt_products", title: "RP Commerce Products" }] });
    const e = await catchRun(fake);
    expect(e).toBeInstanceOf(KitError);
    expect(e.code).toBe(2);
    expect(e.details.missing).toEqual(["RP Commerce Category"]);
    expect(fake.writes()).toEqual([]);
  });

  it("stops when the stack's master language is not en", async () => {
    const fake = fakeCma({ masterLocale: "en-us" });
    const e = await catchRun(fake);
    expect(e).toBeInstanceOf(KitError);
    expect(e.code).toBe(2);
    expect(e.message).toBe(
      "This stack's master language is en-us. Create a new stack with master language English (en), because the master language can't be changed.",
    );
    expect(fake.writes()).toEqual([]);
  });

  it("warns about and prunes dangling references instead of throwing", async () => {
    const fake = fakeCma();
    const { state, lines } = await run(fake);
    const warnings = lines.filter((l) => /dangling/i.test(l));
    expect(warnings).toHaveLength(3);
    expect(warnings.join("\n")).toContain("blta1345c14d3fa0a97");
    const home = fake.store.get(`/content_types/homepage/entries/${state.ids.homepage}@en`);
    expect(JSON.stringify(home)).not.toContain("blta1345c14d3fa0a97");
    const homeNl = fake.store.get(`/content_types/homepage/entries/${state.ids.homepage}@nl`);
    expect(JSON.stringify(homeNl)).not.toContain("bltd24688284ac70c2f");
  });

  it("dry run makes no writes", async () => {
    const fake = fakeCma();
    const state = { version: 1, uidMap: {}, assets: {}, created: {}, phases: {} };
    const { summary, saves } = await run(fake, { dryRun: true, state });
    expect(fake.writes()).toEqual([]);
    expect(saves).toEqual([]);
    expect(state).toEqual({ version: 1, uidMap: {}, assets: {}, created: {}, phases: {} });
    expect(summary["contentTypes:base"].created).toBe(snap().contentTypes.length);
    expect(summary["entries:base"].created).toBe(snap().entries.filter((e) => e.locale === "en").length);
  });
});
