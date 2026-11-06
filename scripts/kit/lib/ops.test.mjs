import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KitError } from "./env.mjs";
import { RpError } from "../../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";
import {
  kitAudienceSlugs,
  variantMarker,
  planReset,
  planTeardown,
  runTeardown,
  teardownNeeds,
  verifyCounts,
  verifySam,
  verifySite,
} from "./ops.mjs";
import { loadPersonalizeSeed } from "./personalizePhase.mjs";
import { main as teardownMain } from "../teardown.mjs";
import { main as verifyMain } from "../verify.mjs";
import { main as resetMain } from "../reset-demo.mjs";

const EXPERIENCE = "Homepage – Reliability and range";
const HERO = "blt_hero";

// A state as the setup phases leave it.
function fullState() {
  return {
    version: 1,
    uidMap: { src_hero: HERO, src_home: "blt_home" },
    assets: {},
    ids: { homepage: "blt_home", heroBanner: HERO },
    // The hero entry exists only in en; the homepage also has an nl version.
    progress: { "entries:base": { "hero_banner/src_hero.en": true, "homepage/src_home.en": true, "homepage/src_home.nl": true } },
    created: {
      locales: ["nl"],
      environments: ["preview"],
      taxonomies: ["bike_types"],
      globalFields: ["seo", "cta"],
      contentTypes: ["hero_banner", "homepage"],
      folders: ["fold_parent", "fold_child"],
      assets: ["asset1", "asset2"],
      entries: [{ ct: "hero_banner", uid: HERO }, { ct: "homepage", uid: "blt_home" }],
      lyticsAudiences: ["volt_owners_commuting", "roam_preorder", "near_amsterdam"],
    },
    adopted: { environments: ["production"], locales: ["fr"], lyticsAudiences: ["roam_intent"] },
    phases: { contentstack: { done: true }, lytics: { done: true, steps: { audiences: { done: true }, model: { done: true } } } },
    expected: { q1: 1000, q2: 500, q3: 200, volt_owners_commuting: 3800, roam_preorder: 63, roam_intent: 3600 },
    personalize: {
      steps: {
        experience: { done: true, result: [{ name: EXPERIENCE, uid: "exp1", variant_group: "vg1" }, { name: "Existing experience", uid: "exp9", variant_group: "vg9" }] },
        variant: { done: true, result: [{ entry: HERO, variant_uid: "cs_v1" }, { entry: HERO, variant_uid: "cs_v9" }] },
        events: { done: true, result: [{ key: "add_to_cart", status: "created" }, { key: "checkout_started", status: "exists" }, { key: "preorder_completed" }] },
      },
      experiences: {
        [EXPERIENCE]: { uid: "exp1", variants: { "Volt Owners × Commuting": "cs_v1" } },
        "Existing experience": { uid: "exp9", adopted: true, variants: { "Old variant": "cs_v9" } },
      },
      events: ["add_to_cart", "checkout_started"],
    },
    brandkit: {
      vault: { "Brand voice": "kv1" },
      profiles: { "The Long Ride": "prof1" },
      adopted: { vault: { "Old doc": "kv9" }, profiles: { "Old voice": "prof9" } },
    },
  };
}

const tmpState = (state) => {
  const dir = mkdtempSync(join(tmpdir(), "kit-ops-"));
  const path = join(dir, "state.json");
  writeFileSync(path, JSON.stringify(state));
  return path;
};

describe("verifySite", () => {
  it("verifySite true/false from fixture HTML", async () => {
    const headline = variantMarker(loadPersonalizeSeed());
    expect(headline).toBe("For riders who've put in the miles"); // the variant's eyebrow_text, from the seed
    const base = "<html><p>Reliability you can trust</p><h1>Ride further</h1></html>";
    // React escapes the apostrophe; the check decodes entities.
    const personalized = "<html><p>For riders who&#x27;ve put in the miles</p><h1>Reliability<br/>and Range</h1></html>";
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push([url, init]);
      const member = String(init.headers?.Cookie ?? "").includes("volt_owners_commuting");
      return { ok: true, status: 200, text: async () => (member ? personalized : base) };
    };
    expect(await verifySite({ siteUrl: "http://localhost:3000/", headline, fetchImpl })).toEqual({ anonymous: true, member: true });
    expect(calls[0][0]).toBe("http://localhost:3000/en");
    expect(calls.every(([, init]) => init.cache === "no-store")).toBe(true);
    expect(calls[0][1].headers?.Cookie).toBeUndefined();

    // Personalization broken: everyone gets the default hero, or everyone gets the variant.
    const always = (html) => async () => ({ ok: true, status: 200, text: async () => html });
    expect(await verifySite({ siteUrl: "http://x", headline, fetchImpl: always(base) })).toEqual({ anonymous: true, member: false });
    expect(await verifySite({ siteUrl: "http://x", headline, fetchImpl: always(personalized) })).toEqual({ anonymous: false, member: true });
  });

  it("verifySam reads the persona's segments from the personalize endpoint", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ data: { segments: ["all", "volt_owners_commuting"] } }) };
    };
    expect(await verifySam({ lyticsCid: "cid9", fetchImpl })).toBe(true);
    expect(urls[0]).toBe("https://c.lytics.io/api/personalize/cid9/user/_uid/seed-sam?fields=");
    const none = async () => ({ ok: true, status: 200, json: async () => ({ data: { segments: ["all"] } }) });
    expect(await verifySam({ lyticsCid: "cid9", fetchImpl: none })).toBe(false);
  });
});

describe("verify --counts (R2)", () => {
  it("prints each expected key with its current size and ✓/✗ at ±5%, and exits 1 on a miss", async () => {
    const rows = await verifyCounts(async (slug) => ({ near_amsterdam: 1040, near_amsterdam_volt_owners: 500, near_amsterdam_volt_commuters: 260, volt_owners_commuting: 3800, roam_preorder: 63, roam_intent: null })[slug], fullState().expected);
    expect(rows.map((r) => [r.name, r.ok])).toEqual([
      ["q1", true], ["q2", true], ["q3", false], ["volt_owners_commuting", true], ["roam_preorder", true], ["roam_intent", false],
    ]);

    const out = [];
    const fetchImpl = vi.fn();
    const code = await verifyMain(["--counts"], {
      statePath: tmpState(fullState()),
      env: { LYTICS_ACCESS_TOKEN: "tok_secret_123" },
      sizeFn: async (slug) => (slug === "near_amsterdam_volt_commuters" ? 260 : { near_amsterdam: 1000, near_amsterdam_volt_owners: 500, volt_owners_commuting: 3800, roam_preorder: 63, roam_intent: 3600 }[slug]),
      fetchImpl,
      out: (s) => out.push(s),
      err: (s) => out.push(s),
    });
    const text = out.join("\n");
    expect(code).toBe(1);
    expect(text).toMatch(/q1\s+1000\s+1000\s+✓/);
    expect(text).toMatch(/q3\s+260\s+200\s+✗/);
    expect(fetchImpl).not.toHaveBeenCalled(); // --counts skips the site and persona checks
    expect(text).not.toContain("tok_secret_123");
  });

  it("verify without --counts needs LYTICS_TAG (exit 2)", async () => {
    const err = [];
    const code = await verifyMain([], {
      statePath: tmpState(fullState()),
      env: { LYTICS_ACCESS_TOKEN: "t", SITE_URL: "http://localhost:3000" },
      fetchImpl: vi.fn(),
      sizeFn: vi.fn(),
      out: () => {},
      err: (s) => err.push(s),
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("LYTICS_TAG");
  });
});

describe("kitAudienceSlugs (R28)", () => {
  it("lists the funnel audiences under their new slugs, so reset never deletes them", () => {
    const slugs = kitAudienceSlugs();
    for (const s of ["near_amsterdam", "near_amsterdam_volt_owners", "near_amsterdam_volt_commuters", "rp_check_seeded", "rp_check_scored", "volt_owners_commuting"]) expect(slugs).toContain(s);
    expect(slugs.filter((s) => /^rp_check_q/.test(s))).toEqual([]);
  });
});

describe("planReset", () => {
  const since = "2026-11-05T09:00:00.000Z";
  it("planReset excludes kit-created audiences and includes roam_commuter_campaign created after since", () => {
    const audiences = [
      { slug_name: "volt_owners_commuting", created: "2026-11-05T10:00:00Z" }, // kit audience, even if touched after since
      { slug_name: "near_amsterdam", created: "2026-11-05T10:00:00Z" },
      { slug_name: "roam_commuter_campaign", created: "2026-11-05T09:30:00Z" },
      { slug_name: "old_one", created: "2026-10-01T00:00:00Z" },
      { slug_name: "mystery", name: "Mystery" }, // no timestamp
    ];
    const experiences = [
      { uid: "exp1", name: EXPERIENCE, createdAt: "2026-11-05T10:00:00Z" },
      { uid: "exp2", name: "Roam commuters hero", createdAt: "2026-11-05T09:45:00Z" },
      { uid: "exp3", name: "Old experience", createdAt: "2026-09-01T00:00:00Z" },
      { uid: "exp4", name: "Undated experience" },
    ];
    const plan = planReset({ since, audiences, experiences, state: fullState() });
    expect(plan.audiences).toEqual(["roam_commuter_campaign"]);
    expect(plan.experiences).toEqual(["Roam commuters hero"]);
    expect(plan.unconfirmed).toEqual({ audiences: ["mystery"], experiences: ["Undated experience"] });
  });

  it("reset --yes deletes Personalize first, then Lytics, and never the undated objects", async () => {
    const calls = [];
    const runCommand = vi.fn(async (name, { input = {}, positional = [] } = {}) => {
      calls.push([name, positional[0] ?? input.variant_uid ?? null]);
      if (name === "personalize-experience") return { uid: "exp2", name: "Roam commuters hero", variant_group: "vg2", variants: [{ name: "V", cms_variant_uid: "cs_v9" }] };
      if (name === "cms-unpublish-variant" && input.entry !== HERO) throw new RpError("GET → 404", { details: { status: 404 } });
      return { status: "ok" };
    });
    const cma = { get: vi.fn(async () => ({ variant_groups: [{ uid: "vg2", content_types: [{ uid: "hero_banner" }] }] })), del: vi.fn() };
    const out = [];
    const code = await resetMain(["--since", since, "--yes"], {
      statePath: tmpState(fullState()),
      env: { CONTENTSTACK_PUBLISH_ENVIRONMENTS: "preview" },
      listAudiences: async () => [{ slug_name: "roam_commuter_campaign", created: "2026-11-05T09:30:00Z" }, { slug_name: "mystery" }],
      listExperiences: async () => [{ uid: "exp2", name: "Roam commuters hero", createdAt: "2026-11-05T09:45:00Z" }],
      runCommand,
      cma,
      out: (s) => out.push(s),
      err: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(calls).toEqual([
      ["personalize-experience", "exp2"],
      ["cms-unpublish-variant", "cs_v9"],
      ["cms-delete-variant", "cs_v9"],
      ["personalize-delete-experience", "exp2"],
      ["lytics-delete-audience", "roam_commuter_campaign"],
    ]);
    expect(out.join("\n")).toMatch(/mystery.*no timestamp — check by hand/);
  });

  it("reset without --yes only lists", async () => {
    const runCommand = vi.fn();
    const code = await resetMain(["--since", since], {
      statePath: tmpState(fullState()),
      env: {},
      listAudiences: async () => [{ slug_name: "roam_commuter_campaign", created: "2026-11-05T09:30:00Z" }],
      listExperiences: async () => [],
      runCommand,
      cma: { get: vi.fn(), del: vi.fn() },
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(0);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("reset --mark records lastMark", async () => {
    const path = tmpState(fullState());
    const code = await resetMain(["--mark"], { statePath: path, env: {}, now: () => new Date("2026-11-05T08:00:00Z"), out: () => {}, err: () => {} });
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(path, "utf8")).lastMark).toBe("2026-11-05T08:00:00.000Z");
  });
});

describe("planTeardown", () => {
  const plan = () => planTeardown(fullState(), { envNames: ["preview", "production"] });
  const idx = (steps, kind, pred = () => true) => steps.findIndex((s) => s.kind === kind && pred(s));
  const lastIdx = (steps, kind) => steps.map((s) => s.kind).lastIndexOf(kind);

  it("planTeardown orders Personalize before Lytics and variants before experiences", () => {
    const steps = plan();
    const kinds = steps.map((s) => s.kind);
    // 1. Brand Kit first
    expect(kinds.slice(0, 2).sort()).toEqual(["brandkit-profile", "brandkit-vault"]);
    // 2. variants: unpublish, then delete, before the experience
    expect(idx(steps, "variant-unpublish")).toBeLessThan(idx(steps, "variant-delete"));
    expect(idx(steps, "variant-delete")).toBeLessThan(idx(steps, "experience-delete"));
    // 3. experience then its leftover variant group
    expect(idx(steps, "experience-delete")).toBeLessThan(idx(steps, "variant-group-delete"));
    // 4. events, only those the kit recorded creating (no status = keep)
    expect(steps.filter((s) => s.kind === "event-delete").map((s) => s.key)).toEqual(["add_to_cart"]);
    expect(steps.filter((s) => s.kind === "manual").map((s) => s.label).join("\n")).toMatch(/preorder_completed/);
    // every Personalize step comes before every Lytics step
    const lastPersonalize = Math.max(...["variant-unpublish", "variant-delete", "experience-delete", "variant-group-delete", "event-delete"].map((k) => lastIdx(steps, k)));
    expect(lastPersonalize).toBeLessThan(idx(steps, "audience-delete"));
    const work = steps.filter((s) => s.kind !== "manual");
    expect(work.at(-1).kind).toBe("audience-delete"); // Lytics is the last thing teardown deletes
    // 5–8: entries unpublished before deleted; then assets, folders, schema, environments
    expect(lastIdx(steps, "entry-unpublish")).toBeLessThan(idx(steps, "entry-delete"));
    const order = ["event-delete", "entry-delete", "asset-delete", "folder-delete", "content-type-delete", "global-field-delete", "taxonomy-delete", "environment-delete", "audience-delete"];
    for (let i = 1; i < order.length; i++) expect(lastIdx(steps, order[i - 1])).toBeLessThan(idx(steps, order[i]));
    // nested folders: the child (created second) goes first
    expect(steps.filter((s) => s.kind === "folder-delete").map((s) => s.uid)).toEqual(["fold_child", "fold_parent"]);
    // only the Lytics audiences the kit recorded creating; models are a manual step (no confirmed DELETE endpoint)
    const slugs = steps.filter((s) => s.kind === "audience-delete").map((s) => s.slug);
    expect(slugs).toEqual(["volt_owners_commuting", "roam_preorder", "near_amsterdam"]);
    // the container check runs after entries and assets, before any container is deleted
    expect(idx(steps, "check-containers")).toBeGreaterThan(lastIdx(steps, "asset-delete"));
    expect(idx(steps, "check-containers")).toBeLessThan(idx(steps, "folder-delete"));
    const manual = steps.filter((s) => s.kind === "manual").map((s) => s.label).join("\n");
    expect(manual).toContain("Roam Pre-order Lookalike");
    expect(manual).toMatch(/Brand Kit itself/);
  });

  it("never lists adopted environments or locales", () => {
    const steps = plan();
    expect(steps.filter((s) => s.kind === "environment-delete").map((s) => s.name)).toEqual(["preview"]);
    expect(steps.filter((s) => s.kind === "locale-delete").map((s) => s.code)).toEqual(["nl"]);
    const text = JSON.stringify(steps.filter((s) => !s.kind.endsWith("-unpublish")));
    expect(text).not.toContain("production");
    expect(text).not.toContain('"fr"');
    // even when an adopted name also shows up in created
    const s = fullState();
    s.created.environments.push("production");
    s.created.locales.push("fr");
    const again = planTeardown(s, { envNames: ["preview"] });
    expect(again.some((x) => x.kind === "environment-delete" && x.name === "production")).toBe(false);
    expect(again.some((x) => x.kind === "locale-delete" && x.code === "fr")).toBe(false);
  });

  it("a pre-existing Lytics audience, Brand Kit item, voice profile and experience are never delete steps, only manual ones (R21–R23)", () => {
    const steps = planTeardown(fullState(), { envNames: ["preview"] });
    const work = steps.filter((s) => s.kind !== "manual");
    const manual = steps.filter((s) => s.kind === "manual").map((s) => s.label).join("\n");
    const workText = JSON.stringify(work);
    // Lytics audience roam_intent existed before setup
    expect(work.some((s) => s.slug === "roam_intent")).toBe(false);
    expect(manual).toMatch(/roam_intent.*existed before setup/);
    // Brand Kit item and voice profile that were already there
    for (const t of ["kv9", "prof9", "Old doc", "Old voice"]) expect(workText).not.toContain(t);
    expect(manual).toMatch(/"Old doc".*existed before setup/);
    expect(manual).toMatch(/"Old voice".*existed before setup/);
    // Adopted experience: not deleted, nor its variant or variant group
    for (const t of ["exp9", "cs_v9", "vg9"]) expect(workText).not.toContain(t);
    expect(manual).toMatch(/"Existing experience".*existed before setup/);
    expect(manual).toMatch(/cs_v9/);
    expect(manual).toMatch(/vg9/);
    // the kit's own are still deleted
    expect(work.some((s) => s.kind === "experience-delete" && s.ref === "exp1")).toBe(true);
    expect(work.some((s) => s.kind === "brandkit-vault" && s.uid === "kv1")).toBe(true);
  });

  it("with no record of which Lytics audiences the kit created, every one is a manual step", () => {
    const s = fullState();
    delete s.created.lyticsAudiences;
    delete s.adopted.lyticsAudiences;
    const steps = planTeardown(s);
    expect(steps.some((x) => x.kind === "audience-delete")).toBe(false);
    const manual = steps.filter((x) => x.kind === "manual").map((x) => x.label).join("\n");
    for (const slug of ["volt_owners_commuting", "roam_intent", "near_amsterdam"]) expect(manual).toContain(slug);
  });

  it("unpublishes each entry only in the locales it has (R24)", () => {
    const steps = planTeardown(fullState(), { envNames: ["preview"] });
    const un = Object.fromEntries(steps.filter((s) => s.kind === "entry-unpublish").map((s) => [s.uid, s.locales]));
    expect(un).toEqual({ [HERO]: ["en"], blt_home: ["en", "nl"] });
  });

  it("lists no Lytics audiences when the kit's audiences step never ran", () => {
    const s = fullState();
    s.phases.lytics = { steps: {} };
    delete s.created.lyticsAudiences;
    expect(planTeardown(s).some((x) => x.kind === "audience-delete" || /Lytics audience/.test(x.label))).toBe(false);
  });
});

describe("teardown", () => {
  const deps = () => ({
    cma: { get: vi.fn(async () => null), post: vi.fn(async () => ({})), del: vi.fn(async () => ({})) },
    runCommand: vi.fn(async () => ({ status: "deleted" })),
    personalize: vi.fn(async () => []),
    brandkitApi: vi.fn(async () => ({ items: [] })),
  });

  it("teardown without --yes makes no calls", async () => {
    const d = deps();
    const out = [];
    const path = tmpState(fullState());
    const before = readFileSync(path, "utf8");
    const code = await teardownMain([], { ...d, statePath: path, env: { CONTENTSTACK_PUBLISH_ENVIRONMENTS: "preview" }, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(0);
    // Only CMA GETs (the container check); no write and no other client.
    for (const fn of [d.cma.post, d.cma.del, d.runCommand, d.personalize, d.brandkitApi]) expect(fn).not.toHaveBeenCalled();
    expect(readFileSync(path, "utf8")).toBe(before);
    const text = out.join("\n");
    expect(text).toMatch(/Dry run/);
    expect(text).toMatch(/entry-delete\s+2/);
    expect(text).toMatch(/Lytics profiles and events can't be deleted through the API/);
    expect(text).toMatch(/sandbox/);
  });

  it("--yes records each deletion, treats 404 as deleted, stops on another error and resumes", async () => {
    const state = fullState();
    const steps = planTeardown(state, { envNames: ["preview"] });
    const d = deps();
    d.brandkitApi = vi.fn(async (method, url) => {
      if (method === "GET" && url.includes("knowledge-vault")) return { items: [{ uid: "kv1", title: "Brand voice" }] };
      if (method === "GET") return { profiles: [{ uid: "prof1", name: "The Long Ride" }] };
      return {};
    });
    d.personalize = vi.fn(async (method) => (method === "GET" ? [{ uid: "ev1", key: "add_to_cart" }] : {}));
    d.cma.get = vi.fn(async () => ({ variant_groups: [] }));
    let failAsset = true;
    // Assets go last-created first: asset2 is already gone (404), asset1 fails once (500).
    d.cma.del = vi.fn(async (path) => {
      if (path.startsWith("/assets/asset2")) throw new KitError("DELETE failed: 404", { details: { status: 404 } });
      if (path.startsWith("/assets/asset1") && failAsset) throw new KitError("DELETE failed: 500", { details: { status: 500 } });
      return {};
    });
    const saves = [];
    const save = (s) => saves.push(JSON.parse(JSON.stringify(s.tornDown)));
    await expect(runTeardown({ steps, state, deps: { ...d, brandKitUid: "bk1" }, save, log: () => {} })).rejects.toMatchObject({ code: 1, details: { remaining: expect.any(Array) } });
    expect(state.tornDown["asset:asset2"].outcome).toBe("already deleted");
    expect(state.tornDown["asset:asset1"]).toBeUndefined();
    expect(state.tornDown["content-type:homepage"]).toBeUndefined(); // nothing after the failure ran
    expect(saves.length).toBe(Object.keys(state.tornDown).length); // saved after each one
    // entries were unpublished before they were deleted
    const posts = d.cma.post.mock.calls.map(([p]) => p);
    expect(posts).toContain(`/content_types/hero_banner/entries/${HERO}/unpublish`);
    expect(d.cma.post.mock.calls[0]).toEqual(["/content_types/homepage/entries/blt_home/unpublish", { entry: { environments: ["preview"], locales: ["en", "nl"] } }]);

    // Re-run: finished steps are skipped.
    failAsset = false;
    const doneBefore = Object.keys(state.tornDown);
    d.runCommand.mockClear();
    d.brandkitApi.mockClear();
    await runTeardown({ steps, state, deps: { ...d, brandKitUid: "bk1" }, save, log: () => {} });
    // Personalize steps were all done; only the Lytics audiences (after the failure) run now.
    expect(d.runCommand.mock.calls.every(([name]) => name === "lytics-delete-audience")).toBe(true);
    expect(d.brandkitApi).not.toHaveBeenCalled();
    for (const id of doneBefore) expect(state.tornDown[id]).toBeDefined();
    // every work step is recorded; the container check isn't (it re-runs every time)
    expect(steps.filter((s) => s.kind !== "manual" && s.kind !== "check-containers").every((s) => state.tornDown[s.id])).toBe(true);
    expect(state.tornDown["check:containers"]).toBeUndefined();
  });

  it("a Brand Kit item that is still listed after a 404 DELETE is an error, not 'already deleted'", async () => {
    const state = fullState();
    const steps = planTeardown(state).filter((s) => s.kind === "brandkit-vault");
    const api = vi.fn(async (method) => {
      if (method === "GET") return { items: [{ uid: "kv1" }] };
      throw new KitError("Brand Kit API DELETE returned 404", { code: 1 });
    });
    await expect(runTeardown({ steps, state, deps: { brandkitApi: api }, save: () => {}, log: () => {} })).rejects.toBeInstanceOf(KitError);
    expect(state.tornDown?.["brandkit:vault:kv1"]).toBeUndefined();
  });
});

// A stack after the kit's own entries and assets are gone; `extra` adds the SE's content.
function fakeStack({ foreignEntries = {}, foreignInFolder = {}, otherContentTypes = [] } = {}) {
  const calls = [];
  const get = vi.fn(async (path, query = {}) => {
    calls.push(["GET", path, query]);
    if (path === "/locales") return { locales: [{ code: "en" }, { code: "nl", fallback_locale: "en" }] };
    if (path === "/content_types") return { content_types: otherContentTypes.map((uid) => ({ uid })) };
    if (path === "/variant_groups") return { variant_groups: [] };
    const m = /^\/content_types\/([^/]+)\/entries$/.exec(path);
    if (m) {
      const list = (foreignEntries[m[1]] ?? []).filter((e) => e.locale === query.locale).map((e) => ({ uid: e.uid }));
      return { entries: list, count: list.length };
    }
    if (path === "/assets") {
      const parent = JSON.parse(query.query ?? "{}").parent_uid;
      const list = (foreignInFolder[parent] ?? []).map((uid) => ({ uid }));
      return { assets: list, count: list.length };
    }
    return null;
  });
  return { calls, get, post: vi.fn(async () => ({})), del: vi.fn(async (p) => { calls.push(["DELETE", p]); return {}; }) };
}

const cmaOnly = (state) => {
  const s = structuredClone(state);
  s.personalize = {};
  s.brandkit = {};
  s.phases.lytics = { steps: {} };
  delete s.created.lyticsAudiences;
  return s;
};

describe("teardown restores the Lytics whitelist (R35)", () => {
  const withPrevious = () => ({ ...fullState(), lytics: { previousWhitelist: ["email", "_id"] } });

  it("plans the restore after the audience deletes, as the last Lytics step", () => {
    const steps = planTeardown(withPrevious(), { envNames: ["preview"] });
    const work = steps.filter((s) => s.kind !== "manual");
    expect(work.at(-1)).toMatchObject({ kind: "lytics-whitelist-restore", value: ["email", "_id"] });
    expect(steps.map((s) => s.kind).lastIndexOf("audience-delete")).toBeLessThan(steps.findIndex((s) => s.kind === "lytics-whitelist-restore"));
    expect(teardownNeeds(steps).lytics).toBe(true);
    // nothing recorded, nothing to restore
    expect(planTeardown(fullState()).some((s) => s.kind === "lytics-whitelist-restore")).toBe(false);
  });

  it("PUTs the recorded value back and records it", async () => {
    const state = withPrevious();
    const steps = planTeardown(state).filter((s) => s.kind === "lytics-whitelist-restore");
    const lyticsSetting = vi.fn(async () => {});
    await runTeardown({ steps, state, deps: { lyticsSetting }, save: () => {}, log: () => {} });
    expect(lyticsSetting).toHaveBeenCalledWith("api_whitelist_fields", ["email", "_id"]);
    expect(state.tornDown["lytics:whitelist"].outcome).toBe("restored");
  });

  it("kit:teardown --yes needs LYTICS_ACCESS_TOKEN for the restore, and stops before any call without it", async () => {
    const path = tmpState({ version: 1, created: {}, adopted: {}, phases: {}, lytics: { previousWhitelist: ["email"] } });
    const out = [];
    const code = await teardownMain(["--yes"], { statePath: path, env: {}, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(2);
    expect(out.join("\n")).toContain("LYTICS_ACCESS_TOKEN");
  });
});

describe("teardown container checks (R24)", () => {
  it("stops with exit 3 before deleting any container when a kit content type or folder holds the SE's content", async () => {
    const state = cmaOnly(fullState());
    const steps = planTeardown(state, { envNames: ["preview"] });
    const cma = fakeStack({ foreignEntries: { homepage: [{ uid: "se_entry", locale: "nl" }] }, foreignInFolder: { fold_parent: ["se_asset", "fold_child"] } });
    const err = await runTeardown({ steps, state, deps: { cma }, save: () => {}, log: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(3);
    expect(err.message).toMatch(/content type homepage: 1/);
    expect(err.message).toMatch(/folder fold_parent: 1/); // the kit's own child folder doesn't count
    const deletes = cma.calls.filter((c) => c[0] === "DELETE").map((c) => c[1]);
    expect(deletes.some((p) => /^\/(content_types\/[^/]+$|global_fields|taxonomies|assets\/folders|environments|locales)/.test(p.split("?")[0]))).toBe(false);
    expect(deletes.some((p) => p.startsWith("/content_types/homepage/entries/blt_home"))).toBe(true); // kit entries went first
  });

  it("keeps the nl language (manual step) when the stack still has other content types", async () => {
    const state = cmaOnly(fullState());
    const steps = planTeardown(state, { envNames: ["preview"] });
    const cma = fakeStack({ otherContentTypes: ["se_page"] });
    const logs = [];
    await runTeardown({ steps, state, deps: { cma }, save: () => {}, log: (l) => logs.push(l) });
    expect(cma.calls.some((c) => c[0] === "DELETE" && c[1] === "/locales/nl")).toBe(false);
    expect(state.tornDown["locale:nl"].outcome).toMatch(/kept/);
    expect(logs.join("\n")).toMatch(/se_page/);

    const state2 = cmaOnly(fullState());
    const cma2 = fakeStack();
    await runTeardown({ steps: planTeardown(state2), state: state2, deps: { cma: cma2 }, save: () => {}, log: () => {} });
    expect(cma2.calls.some((c) => c[0] === "DELETE" && c[1] === "/locales/nl")).toBe(true);
  });

  it("the dry run shows leftover content as a warning, with GETs only", async () => {
    const out = [];
    const cma = fakeStack({ foreignEntries: { hero_banner: [{ uid: "se_hero", locale: "en" }] }, otherContentTypes: ["se_page"] });
    const code = await teardownMain([], { cma, statePath: tmpState(cmaOnly(fullState())), env: {}, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(cma.post).not.toHaveBeenCalled();
    expect(cma.del).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toMatch(/Warning:.*content type hero_banner: 1/s);
    expect(text).toMatch(/nl.*kept|kept.*nl/);
  });
});

describe("finished teardown (R25)", () => {
  it("archives .kit/state.json when every step is done, and setup phases refuse a torn-down state", async () => {
    const path = tmpState(cmaOnly(fullState()));
    const out = [];
    const code = await teardownMain(["--yes"], { cma: fakeStack(), statePath: path, env: { CONTENTSTACK_PUBLISH_ENVIRONMENTS: "preview" }, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(existsSync(path)).toBe(false);
    const dir = join(path, "..");
    const archived = readdirSync(dir).filter((f) => /^state\.torn-down-.+\.json$/.test(f));
    expect(archived).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, archived[0]), "utf8")).tornDown["content-type:homepage"]).toBeDefined();
  });

  it("each setup phase refuses with exit 3 when the state has tornDown entries", async () => {
    const torn = { ...fullState(), tornDown: { "asset:asset1": { at: "x", outcome: "deleted" } } };
    const quiet = { out: () => {}, err: () => {} };
    const { main: importMain } = await import("../import-contentstack.mjs");
    const { main: lyticsMain } = await import("../configure-lytics.mjs");
    const { main: personalizeMain } = await import("../setup-personalize.mjs");
    const { main: brandkitMain } = await import("../setup-brandkit.mjs");
    for (const [name, main] of [["import", importMain], ["lytics", lyticsMain], ["personalize", personalizeMain], ["brandkit", brandkitMain]]) {
      const errs = [];
      const code = await main(["--dry-run"], { ...quiet, err: (s) => errs.push(s), statePath: tmpState(torn), cma: { get: vi.fn() }, runStep: vi.fn(), runCommand: vi.fn(), fetch: vi.fn() });
      expect([name, code]).toEqual([name, 3]);
      expect(errs.join("\n")).toMatch(/torn-down setup/);
    }
  });
});

describe("teardown partial stop (fix 7)", () => {
  it("prints what's left, the manual steps, and 'delete the lookalike models first' when an audience delete fails", async () => {
    const state = fullState();
    state.tornDown = Object.fromEntries(planTeardown(state, { envNames: ["preview"] }).filter((s) => s.kind !== "manual" && s.kind !== "audience-delete" && s.kind !== "check-containers").map((s) => [s.id, { at: "x", outcome: "deleted" }]));
    const out = [];
    const runCommand = vi.fn(async () => { throw new RpError("DELETE api.lytics.io/api/segment/1 → 400: segment is used by a model", { details: { status: 400 } }); });
    const code = await teardownMain(["--yes"], { cma: fakeStack(), runCommand, statePath: tmpState(state), env: { CONTENTSTACK_PUBLISH_ENVIRONMENTS: "preview", LYTICS_ACCESS_TOKEN: "t" }, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(1);
    const text = out.join("\n");
    expect(text).toMatch(/Still to do \(3\)/);
    expect(text).toMatch(/By hand:[\s\S]*Roam Pre-order Lookalike/);
    expect(text).toMatch(/Delete the lookalike models first/);
  });
});

describe("reset --dry-run (fix 8)", () => {
  it("lists only, like running without --yes, and rejects --dry-run with --yes", async () => {
    const runCommand = vi.fn();
    const out = [];
    const deps = {
      statePath: tmpState(fullState()),
      env: {},
      listAudiences: async () => [{ slug_name: "roam_commuter_campaign", created: "2026-11-05T09:30:00Z" }],
      listExperiences: async () => [],
      runCommand,
      cma: { get: vi.fn(), del: vi.fn() },
      out: (s) => out.push(s),
      err: (s) => out.push(s),
    };
    expect(await resetMain(["--since", "2026-11-05T09:00:00Z", "--dry-run"], deps)).toBe(0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(out.join("\n")).toMatch(/roam_commuter_campaign/);
    expect(await resetMain(["--dry-run", "--yes"], deps)).toBe(2);
  });
});
