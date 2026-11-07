import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatTable, runChecks, PHASE_CHECKS, PHASE_ENV, COMMERCE_EXTENSION_TITLES } from "./doctor.mjs";
import { createCredentials } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

// Hermetic credential store: the environment only, no keychain or credentials file.
const testCreds = (store = {}) => createCredentials({
  env: process.env,
  keychain: (service, account) => (service === "red-panda" ? store[account] ?? null : null),
  files: [],
});

const ENV = {
  CONTENTSTACK_API_KEY: "blt-api-SECRET",
  CONTENTSTACK_MANAGEMENT_TOKEN: "cs-mgmt-SECRET",
  CONTENTSTACK_DELIVERY_TOKEN: "cs-deliv-SECRET",
  CONTENTSTACK_ENVIRONMENT: "launch",
  SITE_URL: "https://my-red-panda.contentstackapps.com",
  DEMO_PERSONA_EMAIL: "sam@example.com",
  RED_PANDA_COMMERCE_API_URL: "https://commerce.example.com",
  RED_PANDA_COMMERCE_STPRE_ID: "store1",
  RED_PANDA_COMMERCE_STPRE_TOKEN: "store-SECRET",
  LYTICS_ACCESS_TOKEN: "lytics-SECRET",
  LYTICS_TAG: "tag1",
  CONTENTSTACK_PERSONALIZE_PROJECT_UID: "proj1",
  CONTENTSTACK_PERSONALIZATION: "proj1",
  CONTENTSTACK_AUTHTOKEN: "auth-SECRET",
  BRAND_KIT_UID: "bk1",
  CONTENTSTACK_ORGANIZATION_UID: "org1",
};

const res = (status, body = {}) => ({ status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) });

function fakeFetch({ extensions = COMMERCE_EXTENSION_TITLES, overrides = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    for (const [frag, r] of Object.entries(overrides)) if (u.includes(frag)) return r;
    if (u.includes("/v3/extensions")) return res(200, { extensions: extensions.map((title) => ({ title })) });
    if (u.includes("/v3/content_types") && u.startsWith("https://cdn.")) return res(200, { content_types: [] });
    if (u.includes("/v3/content_types")) return res(200, { content_types: [] });
    if (u.includes("/v3/stacks")) return res(200, { stack: {} });
    if (u.includes("/api/public/store/")) return res(200, {});
    if (u.includes("api.lytics.io/api/account")) return res(200, {});
    if (u.includes("personalize-api.contentstack.com/projects/")) return res(200, {});
    return res(404);
  };
  return { fetchImpl, calls };
}

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => vi.unstubAllEnvs());

const byName = (results, name) => results.find((r) => r.name === name);

describe("doctor", () => {
  it("passes every check with a full fixture", async () => {
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "20.11.0" });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["node", "env", "cma", "delivery-token", "commerce-app", "commerce-store", "lytics", "personalize", "persona"]),
    );
  });

  it("fails commerce-app naming the missing extension and the Marketplace path", async () => {
    const { fetchImpl } = fakeFetch({ extensions: ["RP Commerce Products"] });
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    const r = byName(results, "commerce-app");
    expect(r.ok).toBe(false);
    expect(r.fix).toContain("RP Commerce Category");
    expect(r.fix).toContain("Contentstack → Marketplace → Apps → install RP Commerce in this stack (ask the app owner for access)");
  });

  it("warns, without failing, when no store settings are set: the site uses the CMS snapshots", async () => {
    for (const k of ["RED_PANDA_COMMERCE_API_URL", "RED_PANDA_COMMERCE_STPRE_ID", "RED_PANDA_COMMERCE_STPRE_TOKEN"]) vi.stubEnv(k, "");
    const { fetchImpl, calls } = fakeFetch();
    const results = await runChecks({ phase: "commerce", creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    const r = byName(results, "commerce-store");
    expect(r.warn).toBe(true);
    expect(r.detail).toContain("CMS");
    expect(calls.some((c) => c.url.includes("/api/public/store/"))).toBe(false);
  });

  it("fails commerce-store when only some store settings are set", async () => {
    vi.stubEnv("RED_PANDA_COMMERCE_STPRE_TOKEN", "");
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ phase: "commerce", creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    const r = byName(results, "commerce-store");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("RED_PANDA_COMMERCE_STPRE_TOKEN");
  });

  it("fails node below 20.6", async () => {
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "20.5.1" });
    expect(byName(results, "node").ok).toBe(false);
    const ok = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "20.6.0" });
    expect(byName(ok, "node").ok).toBe(true);
  });

  it("lists missing env var names, never values", async () => {
    vi.stubEnv("CONTENTSTACK_DELIVERY_TOKEN", "");
    vi.stubEnv("LYTICS_ACCESS_TOKEN", "");
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    const env = byName(results, "env");
    expect(env.ok).toBe(false);
    expect(env.detail).toContain("CONTENTSTACK_DELIVERY_TOKEN");
    expect(env.detail).toContain("LYTICS_ACCESS_TOKEN");
    expect(byName(results, "lytics").ok).toBe(false);
  });

  it("sends management calls to the management host, not CONTENTSTACK_HOST", async () => {
    vi.stubEnv("CONTENTSTACK_HOST", "cdn.contentstack.io");
    const { fetchImpl, calls } = fakeFetch();
    await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0", phase: "contentstack" });
    const mgmt = calls.filter((c) => c.url.includes("/v3/stacks") || c.url.includes("/v3/extensions"));
    expect(mgmt.length).toBe(2);
    expect(mgmt.every((c) => c.url.startsWith("https://api.contentstack.io/"))).toBe(true);
    vi.stubEnv("CONTENTSTACK_MANAGEMENT_HOST", "eu-api.contentstack.com");
    const eu = fakeFetch();
    await runChecks({ creds: testCreds(), fetchImpl: eu.fetchImpl, nodeVersion: "22.0.0", phase: "contentstack" });
    expect(eu.calls.some((c) => c.url.startsWith("https://eu-api.contentstack.com/v3/stacks"))).toBe(true);
  });

  it("never leaks secret values in any result", async () => {
    const { fetchImpl } = fakeFetch({ overrides: { "api.lytics.io": res(401), "personalize-api": res(401) } });
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    expect(JSON.stringify(results)).not.toMatch(/SECRET/);
  });

  it("reports a failing token with the status code", async () => {
    const { fetchImpl } = fakeFetch({ overrides: { "api.lytics.io": res(401), "personalize-api": res(401), "cdn.contentstack.io": res(412) } });
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    expect(byName(results, "lytics")).toMatchObject({ ok: false });
    expect(byName(results, "lytics").detail).toContain("401");
    expect(byName(results, "personalize").fix).toContain("rp.mjs login");
    expect(byName(results, "delivery-token").ok).toBe(false);
  });

  it("management token without write scope fails cma", async () => {
    const { fetchImpl } = fakeFetch({ overrides: { "/v3/stacks": res(401, { error_message: "no" }) } });
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    expect(byName(results, "cma").ok).toBe(false);
  });

  it("delivery token check sends api_key, access_token and environment", async () => {
    const { fetchImpl, calls } = fakeFetch();
    await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0", phase: "keys" });
    const c = calls.find((x) => x.url.startsWith("https://cdn.contentstack.io/v3/content_types"));
    expect(c.url).toContain("limit=1");
    expect(c.url).toContain("environment=launch");
    expect(c.init.headers).toMatchObject({ api_key: "blt-api-SECRET", access_token: "cs-deliv-SECRET" });
  });

  it("rejects a persona email with +", async () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", "sam+demo@example.com");
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    expect(byName(results, "persona").ok).toBe(false);
  });

  it("--phase runs only that phase's checks and makes no other calls", async () => {
    const { fetchImpl, calls } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0", phase: "lytics" });
    expect(results.map((r) => r.name)).toEqual(PHASE_CHECKS.lytics);
    expect(calls.every((c) => c.url.includes("lytics"))).toBe(true);
  });

  it("phase env: personalize needs only its own vars", async () => {
    vi.stubEnv("LYTICS_ACCESS_TOKEN", "");
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0", phase: "personalize" });
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it("unknown phase throws exit-2 error", async () => {
    await expect(runChecks({ creds: testCreds(), fetchImpl: fakeFetch().fetchImpl, phase: "nope" })).rejects.toMatchObject({ code: 2 });
  });

  it("PHASE_CHECKS covers every phase", () => {
    expect(Object.keys(PHASE_CHECKS).sort()).toEqual(["brandkit", "commerce", "contentstack", "keys", "lytics", "personalize", "site"]);
  });

  it("personalize reads the authtoken from rp.mjs's credential store, not CONTENTSTACK_AUTHTOKEN in env", async () => {
    expect(PHASE_ENV.personalize).not.toContain("CONTENTSTACK_AUTHTOKEN");
    expect(PHASE_ENV.brandkit).not.toContain("CONTENTSTACK_AUTHTOKEN");
    vi.stubEnv("CONTENTSTACK_AUTHTOKEN", "stale-env-SECRET");
    const { fetchImpl, calls } = fakeFetch();
    const results = await runChecks({ creds: testCreds({ CONTENTSTACK_AUTHTOKEN: "fresh-stored-SECRET" }), fetchImpl, nodeVersion: "22.0.0", phase: "personalize" });
    expect(results.every((r) => r.ok)).toBe(true);
    expect(calls.find((c) => c.url.includes("personalize-api")).init.headers.authtoken).toBe("fresh-stored-SECRET");
  });

  it("personalize fails with the login fix when no authtoken is stored", async () => {
    vi.stubEnv("CONTENTSTACK_AUTHTOKEN", "");
    const { fetchImpl, calls } = fakeFetch();
    const results = await runChecks({ creds: testCreds(), fetchImpl, nodeVersion: "22.0.0", phase: "personalize" });
    expect(byName(results, "env").ok).toBe(true);
    const r = byName(results, "personalize");
    expect(r.ok).toBe(false);
    expect(r.fix).toBe("Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it stores a fresh token for the kit), then re-run.");
    expect(calls.some((c) => c.url.includes("personalize-api"))).toBe(false);
  });

  it("site: passes when CONTENTSTACK_PERSONALIZATION equals the project UID (R37)", async () => {
    const results = await runChecks({ phase: "site", creds: testCreds(), fetchImpl: fakeFetch().fetchImpl, nodeVersion: "22.0.0" });
    expect(byName(results, "personalize-uid").ok).toBe(true);
  });

  it.each([["", /not set/], ["true", /"true"/]])("site: fails when CONTENTSTACK_PERSONALIZATION is %j", async (value, detail) => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZATION", value);
    const results = await runChecks({ phase: "site", creds: testCreds(), fetchImpl: fakeFetch().fetchImpl, nodeVersion: "22.0.0" });
    const r = byName(results, "personalize-uid");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(detail);
    expect(r.fix).toContain("CONTENTSTACK_PERSONALIZE_PROJECT_UID");
  });

  it("site: fails when CONTENTSTACK_PERSONALIZATION differs from CONTENTSTACK_PERSONALIZE_PROJECT_UID", async () => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZATION", "proj2");
    const r = byName(await runChecks({ phase: "site", creds: testCreds(), fetchImpl: fakeFetch().fetchImpl, nodeVersion: "22.0.0" }), "personalize-uid");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("differs");
  });

  it("personalize uses CONTENTSTACK_PERSONALIZE_API_HOST when set (R34)", async () => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_API_HOST", "personalize.example.test");
    const { fetchImpl, calls } = fakeFetch({ overrides: { "personalize.example.test/projects/": res(200, {}) } });
    const results = await runChecks({ phase: "personalize", creds: testCreds({ CONTENTSTACK_AUTHTOKEN: "a" }), fetchImpl, nodeVersion: "22.0.0" });
    expect(byName(results, "personalize").ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["https://personalize.example.test/projects/proj1"]);
  });

  it("warns, without failing, when a non-US region has no Personalize/Brand Kit hosts set (R34)", async () => {
    vi.stubEnv("CONTENTSTACK_REGION", "eu");
    const { fetchImpl } = fakeFetch();
    const results = await runChecks({ phase: "brandkit", creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" });
    const r = byName(results, "region-hosts");
    expect(r.ok).toBe(true);
    expect(r.warn).toBe(true);
    expect(r.detail).toContain("Non-US regions: set the Personalize/Brand Kit hosts for your region (untested)");
    expect(formatTable(results)).toMatch(/^! region-hosts/m);
    vi.stubEnv("CONTENTSTACK_REGION", "us");
    const us = byName(await runChecks({ phase: "brandkit", creds: testCreds(), fetchImpl, nodeVersion: "22.0.0" }), "region-hosts");
    expect(us.ok).toBe(true);
    expect(us.warn).toBeFalsy();
  });
});
