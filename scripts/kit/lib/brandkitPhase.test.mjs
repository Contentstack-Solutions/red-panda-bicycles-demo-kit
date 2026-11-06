import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { main } from "../setup-brandkit.mjs";
import { CMS_ARTICLE_TITLES, brandkitAuth, buildCmsItems, loadBrandkitSeed, parseProfileFile, parseVaultFile, rteToText, runBrandkitPhase } from "./brandkitPhase.mjs";
import { loadSnapshot } from "./importPlan.mjs";
import { KitError } from "./env.mjs";

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

const rte = (...blocks) => ({ type: "doc", children: blocks });
const block = (type, ...kids) => ({ type, children: kids.map((k) => (typeof k === "string" ? { text: k } : k)) });

describe("parseVaultFile", () => {
  it("takes the first heading as title", () => {
    expect(parseVaultFile("# Red Panda brand story\n\nFounded in 2011.\n\n## Later\nmore")).toEqual({
      title: "Red Panda brand story",
      content: "Founded in 2011.\n\n## Later\nmore",
    });
  });
  it("throws without a heading", () => {
    expect(() => parseVaultFile("no heading here")).toThrow(KitError);
  });
});

describe("parseProfileFile", () => {
  it("strips the Voice: prefix from the name", () => {
    expect(parseProfileFile("# Voice: The Long Ride\n\nBody text").name).toBe("The Long Ride");
    expect(parseProfileFile("# Voice: Red Panda Social\n\nBody").content).toBe("Body");
  });
});

describe("rteToText", () => {
  it("joins text nodes and separates blocks with a blank line", () => {
    const body = rte(block("h2", "Begin"), block("p", "One ", { type: "a", children: [{ text: "link" }] }, " two."), block("blockquote", block("p", "Quoted")));
    expect(rteToText(body)).toBe("Begin\n\nOne link two.\n\nQuoted");
  });
  it("accepts a string and nothing", () => {
    expect(rteToText("plain")).toBe("plain");
    expect(rteToText(undefined)).toBe("");
  });
});

describe("buildCmsItems", () => {
  it("yields 4 items with the article titles", () => {
    const items = buildCmsItems(loadSnapshot("seed/contentstack"));
    expect(items).toHaveLength(4);
    expect(items.slice(0, 3).map((i) => i.title)).toEqual(CMS_ARTICLE_TITLES);
    expect(items[3].title).toMatch(/Trip Planner/);
    for (const i of items) expect(i.content.length).toBeGreaterThan(100);
    expect(items[0].content).toContain("tram");
    expect(items[3].content).toContain("Zandvoort Beach");
    expect(items[3].content.match(/^- /gm)).toHaveLength(12);
  });
  it("throws when an article is missing from the snapshot", () => {
    expect(() => buildCmsItems({ entries: [] })).toThrow(KitError);
  });
});

describe("seed files", () => {
  it("has 11 syn items and 2 profiles on disk, no cms files", () => {
    const seed = loadBrandkitSeed("seed/brandkit");
    expect(seed.vault).toHaveLength(11);
    expect(seed.profiles.map((p) => p.name).sort()).toEqual(["Red Panda Social", "The Long Ride"]);
    expect(readdirSync("seed/brandkit/knowledge-vault").some((f) => f.startsWith("cms-"))).toBe(false);
    expect(existsSync("seed-brandkit-src")).toBe(false);
  });
});

// Fake Brand Kit API: async writes (visible after `lag` polls), records every call.
function fakeApi({ existingVault = [], existingProfiles = [], templates = [{ uid: "tpl_voice", name: "Brand Voice" }, { uid: "tpl_x", name: "Persona" }], denyStatus, lag = 1, noUid = false, failPutOnce = false, strayOnPost = false } = {}) {
  let putFailed = false;
  const vault = existingVault.map((v) => ({ ...v }));
  const profiles = existingProfiles.map((p) => ({ ...p }));
  const calls = [];
  const pending = [];
  const hidden = new Map();
  let n = 0;
  const tick = () => {
    for (const p of pending.splice(0)) {
      if (--p.wait > 0) pending.push(p); else p.apply();
    }
  };
  const fetch = vi.fn(async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, headers: init.headers, body });
    if (denyStatus) return json(denyStatus, { error: "forbidden" });
    if (url.includes("/knowledge-vault/get-context")) { tick(); return json(200, { items: vault.filter((v) => { const h = hidden.get(v.uid); if (h === undefined) return true; hidden.set(v.uid, h - 1); return h <= 0; }).map((v) => ({ uid: v.uid, content: v.content ?? "x", _metadata: { title: v.title } })) }); }
    if (url.endsWith("/knowledge-vault/") && method === "POST") {
      const uid = `kv${++n}`;
      pending.push({ wait: lag, apply: () => vault.push({ uid, title: undefined, content: body.content }) });
      if (strayOnPost) pending.push({ wait: lag, apply: () => vault.push({ uid: `stray${++n}`, title: undefined, content: "other" }) });
      return json(201, noUid ? {} : { uid });
    }
    const put = url.match(/\/knowledge-vault\/([^/?]+)$/);
    if (put && method === "PUT") {
      if (failPutOnce && !putFailed) { putFailed = true; return json(500, { error: "boom" }); }
      pending.push({ wait: lag, apply: () => { const v = vault.find((x) => x.uid === put[1]); v.title = body._metadata.title; v.content = body.content; } });
      return json(200, { uid: put[1] });
    }
    if (url.endsWith("/v2/profile-templates")) return json(200, { templates });
    if (url.endsWith("/profiles") && method === "GET") return json(200, { profiles });
    if (url.endsWith("/profiles") && method === "POST") {
      const uid = `pf${++n}`;
      profiles.push({ uid, name: body.profile.name });
      return json(201, { profile: { uid, name: body.profile.name } });
    }
    return json(404, {});
  });
  return { fetch, calls, vault, profiles, hideUntilPolls: (uid, n) => hidden.set(uid, n) };
}

const mkSeed = () => ({
  vault: [{ title: "Brand story", content: "story" }, { title: "Product line", content: "line" }],
  profiles: [{ name: "Red Panda Social", content: "social" }],
});

const deps = (api, extra = {}) => {
  let t = 0;
  return {
    fetch: api.fetch,
    headers: { authtoken: "tok-secret-1", organization_uid: "org1", brand_kit_uid: "bk1" },
    brandKitUid: "bk1",
    seed: mkSeed(),
    cmsItems: [{ title: "Article A", content: "aaa" }],
    state: { phases: {} },
    save: vi.fn(),
    sleep: async (ms) => { t += ms; },
    clock: () => t,
    ...extra,
  };
};

describe("runBrandkitPhase", () => {
  it("creates only missing vault items and sets titles", async () => {
    const api = fakeApi({ existingVault: [{ uid: "kv0", title: "Brand story", content: "story" }] });
    const d = deps(api);
    await runBrandkitPhase(d);
    const posts = api.calls.filter((c) => c.method === "POST" && c.url.endsWith("/knowledge-vault/"));
    expect(posts.map((p) => p.body.content).sort()).toEqual(["aaa", "line"]);
    const puts = api.calls.filter((c) => c.method === "PUT");
    expect(puts.map((p) => p.body._metadata.title).sort()).toEqual(["Article A", "Product line"]);
    expect(api.vault.map((v) => v.title).sort()).toEqual(["Article A", "Brand story", "Product line"]);
    expect(d.state.brandkit.vault["Product line"]).toMatch(/^kv/);
    // R22: an item that was there before the kit is adopted, never recorded as created.
    expect(d.state.brandkit.vault["Brand story"]).toBeUndefined();
    expect(d.state.brandkit.adopted.vault["Brand story"]).toBe("kv0");
    expect(d.state.phases.brandkit.done).toBe(true);
    for (const c of api.calls) {
      expect(c.headers.authtoken).toBe("tok-secret-1");
      expect(c.headers.organization_uid).toBe("org1");
      expect(c.headers.brand_kit_uid).toBe("bk1");
    }
    expect(d.save).toHaveBeenCalled();
  });

  it("re-running creates nothing", async () => {
    const api = fakeApi();
    const d = deps(api);
    await runBrandkitPhase(d);
    const before = api.calls.filter((c) => c.method !== "GET").length;
    await runBrandkitPhase(d);
    expect(api.calls.filter((c) => c.method !== "GET").length).toBe(before);
    expect(api.vault).toHaveLength(3);
    expect(api.profiles).toHaveLength(1);
  });

  it("uses CONTENTSTACK_BRANDKIT_API_HOST and CONTENTSTACK_AI_HOST when set (R34)", async () => {
    vi.stubEnv("CONTENTSTACK_BRANDKIT_API_HOST", "bk.example.test");
    vi.stubEnv("CONTENTSTACK_AI_HOST", "https://ai.example.test/");
    try {
      const api = fakeApi();
      await runBrandkitPhase(deps(api));
      const urls = api.calls.map((c) => c.url);
      expect(urls.some((u) => u.startsWith("https://ai.example.test/brand-kits/v1/knowledge-vault/"))).toBe(true);
      expect(urls.some((u) => u.startsWith("https://bk.example.test/v2/brand-kits/bk1/profiles"))).toBe(true);
      expect(urls.some((u) => u.includes(".contentstack.com"))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("creates the voice profile with the voice template and v2 header, skipping existing ones", async () => {
    const api = fakeApi();
    const d = deps(api, { seed: { vault: [], profiles: [{ name: "Red Panda Social", content: "social" }, { name: "The Long Ride", content: "ride" }] } });
    api.profiles.push({ uid: "pf0", name: "The Long Ride" });
    await runBrandkitPhase(d);
    const posts = api.calls.filter((c) => c.method === "POST" && c.url.endsWith("/profiles"));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://brand-kits-api.contentstack.com/v2/brand-kits/bk1/profiles");
    expect(posts[0].headers.version).toBe("v2");
    expect(posts[0].body).toEqual({ profile: { name: "Red Panda Social", content: "social", template_uid: "tpl_voice" } });
    expect(d.state.brandkit.profiles["The Long Ride"]).toBeUndefined();
    expect(d.state.brandkit.adopted.profiles["The Long Ride"]).toBe("pf0");
    expect(d.state.brandkit.profiles["Red Panda Social"]).toMatch(/^pf/);
  });

  it("an item or profile an earlier kit run recorded stays recorded as created when found on a re-run (R22)", async () => {
    const api = fakeApi({ existingVault: [{ uid: "kv7", title: "Brand story", content: "story" }] });
    api.profiles.push({ uid: "pf7", name: "Red Panda Social" });
    const d = deps(api, { state: { phases: {}, brandkit: { vault: { "Brand story": "kv7" }, profiles: { "Red Panda Social": "pf7" } } } });
    await runBrandkitPhase(d);
    expect(d.state.brandkit.vault["Brand story"]).toBe("kv7");
    expect(d.state.brandkit.profiles["Red Panda Social"]).toBe("pf7");
    expect(d.state.brandkit.adopted.vault).toEqual({});
    expect(d.state.brandkit.adopted.profiles).toEqual({});
  });

  it("exits 1 listing template names when there is no voice template", async () => {
    const api = fakeApi({ templates: [{ uid: "a", name: "Persona" }, { uid: "b", name: "Audience" }] });
    await expect(runBrandkitPhase(deps(api, { seed: { vault: [], profiles: mkSeed().profiles } }))).rejects.toMatchObject({ code: 1, message: expect.stringContaining("Persona, Audience") });
  });

  it("times out after 60 s when a write never becomes visible", async () => {
    const api = fakeApi({ lag: 10_000 });
    await expect(runBrandkitPhase(deps(api, { seed: { vault: [{ title: "A", content: "a" }], profiles: [] }, cmsItems: [] }))).rejects.toMatchObject({ code: 1, message: expect.stringContaining("60 s") });
  });

  it("stops with exit 2 on 403 and names the OAuth fallback", async () => {
    const api = fakeApi({ denyStatus: 403 });
    const err = await runBrandkitPhase(deps(api)).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(2);
    expect(`${err.message} ${err.hint}`).toMatch(/OAuth/);
    expect(`${err.message} ${err.hint}`).toMatch(/docs\/manual-steps\.md step 11/);
    expect(`${err.message} ${err.hint}`).not.toContain("tok-secret-1");
  });
});

describe("resuming after a failed title PUT", () => {
  const one = { vault: [{ title: "Only", content: "only" }], profiles: [] };
  for (const [label, noUid] of [["main path (POST returns a uid)", false], ["fallback path (POST returns no uid)", true]]) {
    it(`PUT failed, then re-run: no second POST, PUT retried; ${label}`, async () => {
      const api = fakeApi({ noUid, failPutOnce: true });
      const d = deps(api, { seed: one, cmsItems: [] });
      await expect(runBrandkitPhase(d)).rejects.toMatchObject({ code: 1 });
      expect(d.state.brandkit.vault.Only).toMatch(/^kv/);
      expect(d.save).toHaveBeenCalled();
      await runBrandkitPhase(d);
      const posts = api.calls.filter((c) => c.method === "POST" && c.url.endsWith("/knowledge-vault/"));
      expect(posts).toHaveLength(1);
      expect(api.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
      expect(api.vault).toHaveLength(1);
      expect(api.vault[0].title).toBe("Only");
    });
  }
  it("stored uid not listed on the first poll but listed later: no POST, PUT done", async () => {
    const api = fakeApi({ lag: 3 });
    api.hideUntilPolls("kv9", 2);
    api.vault.push({ uid: "kv9", title: undefined, content: "only" });
    const d = deps(api, { seed: one, cmsItems: [], state: { phases: {}, brandkit: { vault: { Only: "kv9" }, profiles: {} } } });
    await runBrandkitPhase(d);
    expect(api.calls.some((c) => c.method === "POST" && c.url.endsWith("/knowledge-vault/"))).toBe(false);
    expect(api.calls.filter((c) => c.method === "PUT").map((c) => c.url)).toEqual([expect.stringMatching(/\/kv9$/)]);
    expect(api.vault.find((v) => v.uid === "kv9").title).toBe("Only");
  });
  it("stored uid never listed: exit 3, no POST, no PUT", async () => {
    const api = fakeApi();
    const d = deps(api, { seed: one, cmsItems: [], state: { phases: {}, brandkit: { vault: { Only: "kvGone" }, profiles: {} } } });
    const err = await runBrandkitPhase(d).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(3);
    expect(err.message).toContain("Only");
    expect(err.message).toContain("kvGone");
    expect(api.calls.some((c) => c.method === "POST" || c.method === "PUT")).toBe(false);
  });
  it("fallback with several new items stops with exit 3 naming the title", async () => {
    const api = fakeApi({ noUid: true, strayOnPost: true });
    const err = await runBrandkitPhase(deps(api, { seed: one, cmsItems: [] })).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(3);
    expect(err.message).toContain("Only");
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  });
  it("fallback with no new item within 60 s stops with exit 3", async () => {
    const api = fakeApi({ noUid: true, lag: 10_000 });
    const err = await runBrandkitPhase(deps(api, { seed: one, cmsItems: [] })).catch((e) => e);
    expect(err.code).toBe(3);
    expect(err.message).toContain("Only");
  });
});

describe("setup-brandkit CLI", () => {
  const env = { BRAND_KIT_UID: "bk1", CONTENTSTACK_ORGANIZATION_UID: "org1" };
  const run = async (argv, extra = {}) => {
    const out = [];
    const err = [];
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), statePath: `${process.env.TMPDIR ?? "/tmp"}/kit-bk-${Math.random()}.json`, ...extra });
      return { code, out: out.join("\n"), err: err.join("\n") };
    } finally {
      for (const k of Object.keys(env)) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  };
  it("--dry-run plans without touching the network", async () => {
    const fetch = vi.fn();
    const r = await run(["--dry-run"], { fetch, creds: { has: () => false, get: () => { throw new Error("no"); }, secrets: () => [] } });
    expect(r.code).toBe(0);
    expect(r.out).toContain("15 Knowledge Vault items");
    expect(r.out).toContain("The Long Ride");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("exits 2 with the login hint when no authtoken is stored", async () => {
    const r = await run([], { creds: { has: () => false, get: () => { throw new Error("no"); }, secrets: () => [] } });
    expect(r.code).toBe(2);
    expect(r.err).toContain("rp.mjs login");
  });
  // R32: an OAuth token goes in Authorization: Bearer (and no authtoken); else the session authtoken.
  const credsWith = (vals) => ({ has: (k) => k in vals, get: (k) => { if (!(k in vals)) throw new Error("no"); return vals[k]; }, secrets: () => Object.values(vals) });
  it("sends Authorization: Bearer when an OAuth token is stored, and no authtoken", async () => {
    const api = fakeApi({ denyStatus: 403 });
    const r = await run([], { fetch: api.fetch, creds: credsWith({ CONTENTSTACK_OAUTH_TOKEN: "oauth-secret-123", CONTENTSTACK_AUTHTOKEN: "auth-secret-456" }) });
    expect(r.code).toBe(2);
    const h = api.calls[0].headers;
    expect(h.Authorization).toBe("Bearer oauth-secret-123");
    expect(h).not.toHaveProperty("authtoken");
    expect(h.organization_uid).toBe("org1");
    expect(h.brand_kit_uid).toBe("bk1");
    expect(`${r.out}\n${r.err}`).not.toContain("oauth-secret-123");
    expect(`${r.out}\n${r.err}`).not.toContain("auth-secret-456");
    expect(r.err).toContain("docs/manual-steps.md step 11");
  });
  it("sends the session authtoken when no OAuth token is stored", async () => {
    const api = fakeApi({ denyStatus: 401 });
    const r = await run([], { fetch: api.fetch, creds: credsWith({ CONTENTSTACK_AUTHTOKEN: "auth-secret-456" }) });
    expect(r.code).toBe(2);
    const h = api.calls[0].headers;
    expect(h.authtoken).toBe("auth-secret-456");
    expect(h).not.toHaveProperty("Authorization");
    expect(`${r.out}\n${r.err}`).not.toContain("auth-secret-456");
  });
  it("brandkitAuth returns null when neither token is stored", () => {
    expect(brandkitAuth(credsWith({}), { organizationUid: "o", brandKitUid: "b" })).toBeNull();
  });
  it("exits 2 when BRAND_KIT_UID is missing", async () => {
    delete process.env.BRAND_KIT_UID;
    const out = [];
    const err = [];
    const code = await main([], { out: (s) => out.push(s), err: (s) => err.push(s), creds: { has: () => true, get: () => "t", secrets: () => [] }, statePath: "/tmp/x.json" });
    expect(code).toBe(2);
    expect(err.join("")).toContain("BRAND_KIT_UID");
  });
});
