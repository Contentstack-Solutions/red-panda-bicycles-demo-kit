import { describe, it, expect, vi } from "vitest";
import { EXPECTED_SLUGS, LYTICS_STEPS, audienceSize, measureExpected, withinTolerance, runLyticsPhase, applyAccountSettings, putAccountSetting } from "./lyticsPhase.mjs";
import { KitError } from "./env.mjs";

const SITE = "https://demo.contentstackapps.com";
const modelsOut = JSON.stringify({ id: "m1", state: "complete", model_health: "good" }) + "\n" + JSON.stringify({ id: "m2", state: "complete", model_health: "fair" });

function harness(over = {}) {
  const calls = [];
  const runStep = vi.fn(async (step, args) => {
    calls.push([step, args]);
    if (over.runStep) { const r = over.runStep(step, args); if (r) return r; }
    if (step === "status") return { code: 0, stdout: JSON.stringify({ now: "2026-11-01T00:00:00.000Z" }), stderr: "" };
    if (step === "models") return { code: 0, stdout: modelsOut, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  });
  let t = 0;
  const saves = [];
  return {
    calls, runStep, saves,
    deps: {
      runStep,
      sizeFn: over.sizeFn ?? (async () => 100),
      applySettings: over.applySettings ?? (async () => {}),
      sleep: async (ms) => { t += ms; },
      clock: () => t,
      siteUrl: "siteUrl" in over ? over.siteUrl : SITE,
      state: over.state ?? { phases: {} },
      save: (s) => saves.push(JSON.parse(JSON.stringify(s))),
      log: () => {},
      warn: over.warn ?? (() => {}),
      nowIso: over.nowIso,
    },
  };
}

describe("lytics phase", () => {
  it("runs steps in order and skips completed ones", async () => {
    const h = harness({ state: { phases: { lytics: { steps: { schema: { done: true, at: "x" }, topics: { done: true, at: "x" } } } } } });
    const state = await runLyticsPhase(h.deps);
    const ran = h.calls.map((c) => c[0]).filter((s) => s !== "status" && s !== "models");
    expect(ran).toEqual(["load", "refresh", "audiences", "model"]);
    expect(LYTICS_STEPS).toEqual(["schema", "topics", "load", "refresh", "audiences", "model"]);
    expect(Object.keys(state.phases.lytics.steps)).toEqual(["schema", "topics", "load", "refresh", "audiences", "model"]);
    expect(state.phases.lytics.done).toBe(true);
    expect(state.phases.lytics.now).toBe("2026-11-01T00:00:00.000Z");
    expect(state.expected.q1).toBe(100);
    expect(h.saves.length).toBeGreaterThan(3);
  });

  it("records the audiences the seeder created vs ones that already existed (R21), even when the step fails", async () => {
    const line = (audience, action) => JSON.stringify({ audience, action });
    const h = harness({ runStep: (step) => step === "audiences"
      ? { code: 0, stdout: ["+ volt_owners_commuting: FILTER ...", line("volt_owners_commuting", "created"), line("roam_intent", "updated"), line("near_amsterdam", "unchanged")].join("\n"), stderr: "" }
      : null });
    const state = await runLyticsPhase(h.deps);
    expect(state.created.lyticsAudiences).toEqual(["volt_owners_commuting"]);
    expect(state.adopted.lyticsAudiences).toEqual(["roam_intent", "near_amsterdam"]);

    // Fails partway: what was created is still recorded; a re-run reporting it unchanged keeps it as created.
    const h2 = harness({ runStep: (step) => step === "audiences" ? { code: 1, stdout: line("roam_preorder", "created"), stderr: "boom" } : null });
    await expect(runLyticsPhase(h2.deps)).rejects.toBeInstanceOf(KitError);
    expect(h2.saves.at(-1).created.lyticsAudiences).toEqual(["roam_preorder"]);
    const s2 = h2.deps.state;
    const h3 = harness({ state: s2, runStep: (step) => step === "audiences" ? { code: 0, stdout: line("roam_preorder", "unchanged"), stderr: "" } : null });
    await runLyticsPhase(h3.deps);
    expect(s2.created.lyticsAudiences).toEqual(["roam_preorder"]);
    expect(s2.adopted.lyticsAudiences).toEqual([]);
  });

  it("passes --now to load only, and never --repin or --resend", async () => {
    const h = harness({ nowIso: "2026-10-01T00:00:00Z" });
    await runLyticsPhase(h.deps);
    const load = h.calls.find((c) => c[0] === "load");
    expect(load[1]).toEqual(["--now", "2026-10-01T00:00:00Z"]);
    for (const [, args] of h.calls) expect(args.join(" ")).not.toMatch(/--repin|--resend/);
  });

  it("stops with exit 3 when load refuses an already-seeded account", async () => {
    const h = harness({ runStep: (step) => step === "load" ? { code: 3, stdout: "", stderr: "already has seeded profiles; pass --repin" } : null });
    const err = await runLyticsPhase(h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(3);
    expect(err.message + (err.hint ?? "")).toMatch(/--repin/);
    expect(h.calls.map((c) => c[0])).toEqual(["schema", "topics", "load"]);
    expect(h.calls.filter((c) => c[0] === "load")).toHaveLength(1);
  });

  it("exits 2 before any step when SITE_URL is unset or local", async () => {
    for (const siteUrl of [undefined, "", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      const h = harness({ siteUrl });
      const err = await runLyticsPhase(h.deps).catch((e) => e);
      expect(err.code).toBe(2);
      expect(err.message).toMatch(/Set SITE_URL to your Launch site URL/);
      expect(h.runStep).not.toHaveBeenCalled();
    }
  });

  it("fails a step with a nonzero exit code", async () => {
    const h = harness({ runStep: (step) => step === "topics" ? { code: 1, stdout: "", stderr: "boom" } : null });
    const err = await runLyticsPhase(h.deps).catch((e) => e);
    expect(err.code).toBe(1);
    expect(err.message).toMatch(/topics/);
  });

  it("polls sizes until non-zero, then records expected", async () => {
    let n = 0;
    const h = harness({ sizeFn: async () => (++n <= 6 * 2 ? 0 : 50) });
    const state = await runLyticsPhase(h.deps);
    expect(state.expected.roam_preorder).toBe(50);
  });

  it("errors when audiences never populate", async () => {
    const h = harness({ sizeFn: async () => null });
    const err = await runLyticsPhase(h.deps).catch((e) => e);
    expect(err.code).toBe(1);
    expect(err.message).toMatch(/15 min/);
  });

  it("warns, but still finishes, when models never report health", async () => {
    const warn = vi.fn();
    const h = harness({ warn, runStep: (step) => step === "models" ? { code: 0, stdout: JSON.stringify({ id: "m1", state: "training" }), stderr: "" } : null });
    const state = await runLyticsPhase(h.deps);
    expect(warn).toHaveBeenCalled();
    expect(state.phases.lytics.done).toBe(true);
  });
});

describe("tolerance and expected", () => {
  it("withinTolerance 5% boundaries", () => {
    expect(withinTolerance(95, 100)).toBe(true);
    expect(withinTolerance(94, 100)).toBe(false);
    expect(withinTolerance(105, 100)).toBe(true);
    expect(withinTolerance(106, 100)).toBe(false);
    expect(withinTolerance(0, 0)).toBe(true);
  });

  it("measureExpected maps check audiences to q1..q3", async () => {
    const sizes = { near_amsterdam: 1000, near_amsterdam_volt_owners: 400, near_amsterdam_volt_commuters: 120, volt_owners_commuting: 120, roam_preorder: 300, roam_intent: 900 };
    const out = await measureExpected(async (slug) => sizes[slug]);
    expect(out).toEqual({ q1: 1000, q2: 400, q3: 120, volt_owners_commuting: 120, roam_preorder: 300, roam_intent: 900 });
  });

  it("q1..q3 are the named funnel audiences (R28), not rp_check_*", async () => {
    expect(EXPECTED_SLUGS.q1).toBe("near_amsterdam");
    expect(EXPECTED_SLUGS.q2).toBe("near_amsterdam_volt_owners");
    expect(EXPECTED_SLUGS.q3).toBe("near_amsterdam_volt_commuters");
    const asked = [];
    await measureExpected(async (slug) => { asked.push(slug); return 1; });
    expect(asked.filter((s) => s.startsWith("rp_check_"))).toEqual([]);
  });
});

describe("rest helpers", () => {
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

  it("audienceSize does GET only and returns total, or null on 404", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("/v2/segment")) return json(200, { data: [{ id: "abc", slug_name: "roam_preorder" }] });
      if (url.includes("/api/segment/abc/scan?limit=1")) return json(200, { total: 63 });
      return json(404, {});
    });
    expect(await audienceSize("roam_preorder", { token: "t", fetchImpl })).toBe(63);
    expect(await audienceSize("nope", { token: "t", fetchImpl })).toBeNull();
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.method ?? "GET").toBe("GET");
      expect(init.headers.Authorization).toBe("t");
    }
    const f404 = vi.fn(async (url) => url.endsWith("/v2/segment") ? json(200, { data: [{ id: "x", slug_name: "s" }] }) : json(404, {}));
    expect(await audienceSize("s", { token: "t", fetchImpl: f404 })).toBeNull();
  });

  it("applyAccountSettings GETs the current value, then PUTs the union as a bare array (R35)", async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => (init.method === "PUT" ? json(200, {}) : json(200, { data: ["email", "_id"] })));
    const previous = [];
    await applyAccountSettings({ token: "t", fetchImpl, settings: { api_whitelist_fields: ["_id", "products_owned"] }, onPrevious: (name, value) => previous.push([name, value]) });
    const [getUrl, getInit] = fetchImpl.mock.calls[0];
    expect(getUrl).toBe("https://api.lytics.io/api/account/setting/api_whitelist_fields");
    expect(getInit.method).toBe("GET");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.lytics.io/api/account/setting/api_whitelist_fields");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(["email", "_id", "products_owned"]);
    expect(previous).toEqual([["api_whitelist_fields", ["email", "_id"]]]);
  });

  it.each([
    ["a bare array", 200, ["a"], ["a"]],
    ["data.value", 200, { data: { value: ["a"] } }, ["a"]],
    ["value", 200, { value: ["a"] }, ["a"]],
    ["a null data (never set)", 200, { data: null }, []],
    ["a 404 (never set)", 404, {}, []],
  ])("applyAccountSettings reads the current value from %s", async (_, status, body, expected) => {
    const fetchImpl = vi.fn(async (url, init = {}) => (init.method === "PUT" ? json(200, {}) : json(status, body)));
    let prev;
    await applyAccountSettings({ token: "t", fetchImpl, settings: { api_whitelist_fields: ["b"] }, onPrevious: (_n, v) => { prev = v; } });
    expect(prev).toEqual(expected);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual([...expected, "b"]);
  });

  it("applyAccountSettings never PUTs when it can't read the current value", async () => {
    for (const fetchImpl of [vi.fn(async () => json(500, {})), vi.fn(async () => json(200, { data: { surprise: 1 } }))]) {
      await expect(applyAccountSettings({ token: "t", fetchImpl, settings: { api_whitelist_fields: ["b"] } })).rejects.toBeInstanceOf(KitError);
      expect(fetchImpl.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    }
  });

  it("putAccountSetting PUTs a bare array", async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    await putAccountSetting("api_whitelist_fields", ["_id"], { token: "t", fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.lytics.io/api/account/setting/api_whitelist_fields");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(["_id"]);
  });

  it("records the account's previous whitelist only on the first apply (R35)", async () => {
    let calls = 0;
    const applySettings = vi.fn(async ({ onPrevious }) => {
      calls++;
      onPrevious("api_whitelist_fields", calls === 1 ? ["email"] : ["email", "_id"]);
      if (calls === 1) throw new KitError("PUT failed (500)");
    });
    const h = harness({ applySettings });
    await expect(runLyticsPhase(h.deps)).rejects.toBeInstanceOf(KitError);
    expect(h.deps.state.lytics.previousWhitelist).toEqual(["email"]);
    expect(h.saves.at(-1).lytics.previousWhitelist).toEqual(["email"]); // saved before the PUT
    const h2 = harness({ applySettings, state: h.deps.state });
    await runLyticsPhase(h2.deps);
    expect(h2.deps.state.lytics.previousWhitelist).toEqual(["email"]);
    expect(h2.deps.state.phases.lytics.settingsApplied).toBe(true);
  });

  it("tells the seeder which audiences the kit created, so it never overwrites anyone else's (R35)", async () => {
    const h = harness({ state: { phases: {}, created: { lyticsAudiences: ["roam_preorder", "near_amsterdam"] } } });
    await runLyticsPhase(h.deps);
    expect(h.calls.find((c) => c[0] === "audiences")[1]).toEqual(["--created", "roam_preorder,near_amsterdam"]);
    const fresh = harness();
    await runLyticsPhase(fresh.deps);
    expect(fresh.calls.find((c) => c[0] === "audiences")[1]).toEqual(["--created", ""]);
  });

  it("stops with exit 3 when an audience the kit didn't create has the same slug and another definition", async () => {
    const h = harness({ runStep: (step) => step === "audiences" ? { code: 3, stdout: "", stderr: "roam_intent: an audience with this slug already exists" } : null });
    await expect(runLyticsPhase(h.deps)).rejects.toMatchObject({ code: 3, hint: expect.stringMatching(/Nothing was changed/) });
    expect(h.deps.state.phases.lytics.steps.audiences).toBeUndefined();
  });
});
