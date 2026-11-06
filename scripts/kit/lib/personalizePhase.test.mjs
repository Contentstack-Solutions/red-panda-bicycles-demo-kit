import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../setup-personalize.mjs";
import { PERSONALIZE_STEPS, loadPersonalizeSeed, planPersonalize, runPersonalizePhase } from "./personalizePhase.mjs";
import { KitError } from "./env.mjs";
import { RpError, createCredentials } from "../../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

const EXPERIENCE = "Homepage – Reliability and range";
const VARIANT = "Volt Owners × Commuting";
const HERO = "blt00000000000000aa";
const FIELDS = {
  eyebrow_text: "For riders who've put in the miles",
  headline: "Reliability\nand Range\nAbove All.",
  description: "The new RP Roam goes further on a charge, and it's built to keep going year after year.",
  button_text: "Meet the Roam",
};
const EVENT_KEYS = ["bike_recommendation_clicked", "add_to_cart", "checkout_started", "preorder_completed"];

const seed = loadPersonalizeSeed();
const baseState = () => ({ ids: { heroBanner: HERO }, phases: { lytics: { done: true } } });

// Fake rp.mjs runCommand: answers each command like the real helper would.
function harness({ state = baseState(), fail, audiences } = {}) {
  const calls = [];
  const saves = [];
  let t = 0;
  const runCommand = vi.fn(async (name, { input = {} } = {}) => {
    calls.push([name, input]);
    if (fail) { const e = fail(name, input, calls); if (e) throw e; }
    switch (name) {
      case "lytics-update-audience":
        return { status: "updated", id: "seg1", slug: input.audience, name: "Volt Owners × Commuting", is_public: true };
      case "personalize-audiences":
        return audiences ? audiences(calls) : [{ uid: "aud1", name: "Volt Owners × Commuting", slug: "volt_owners_commuting", source: "LYTICS" }];
      case "personalize-create-experience":
        return {
          status: "created", uid: "exp1", name: input.name, state: "ACTIVE", variant_group: "vg1",
          variants: [{ name: VARIANT, short_uid: "0", cms_variant_uid: "cs_v1", targets: [{ lytics_audience: "aud1" }] }],
          content_types: ["hero_banner"],
        };
      case "cms-create-variant":
        return { status: "saved", entry: input.entry, variant_uid: "cs_v1", variant: VARIANT, version: 1, changed: Object.keys(input.fields) };
      case "cms-publish-variant":
        return { status: "published", entry: input.entry, variant_uid: "cs_v1", version: 1, environments: ["env_uid_1"] };
      case "personalize-create-events":
        return input.events.map((e, i) => ({ key: e.key, status: "created", uid: `ev${i}` }));
      default:
        throw new Error(`unexpected command ${name}`);
    }
  });
  return {
    calls, saves, runCommand, state,
    deps: {
      runCommand, seed, state,
      save: (s) => saves.push(JSON.parse(JSON.stringify(s))),
      sleep: async (ms) => { t += ms; },
      clock: () => t,
      log: () => {},
    },
  };
}

describe("personalize phase", () => {
  it("marks an experience that already existed before the kit as adopted (R23)", async () => {
    const h = harness();
    const real = h.runCommand.getMockImplementation();
    h.runCommand.mockImplementation(async (name, args) => {
      const r = await real(name, args);
      return name === "personalize-create-experience" ? { ...r, status: "exists" } : r;
    });
    await runPersonalizePhase(h.deps);
    expect(h.state.personalize.experiences[EXPERIENCE]).toMatchObject({ uid: "exp1", adopted: true });

    // "exists" for an experience the kit already recorded (a resumed run) is not adoption.
    const h2 = harness();
    h2.state.personalize = { experiences: { [EXPERIENCE]: { uid: "exp1", variants: {} } } };
    const real2 = h2.runCommand.getMockImplementation();
    h2.runCommand.mockImplementation(async (name, args) => {
      const r = await real2(name, args);
      return name === "personalize-create-experience" ? { ...r, status: "exists" } : r;
    });
    await runPersonalizePhase(h2.deps);
    expect(h2.state.personalize.experiences[EXPERIENCE].adopted).toBeUndefined();
  });

  it("plans the hero variant against state.ids.heroBanner", async () => {
    // The seed file holds the exact names, copy and change set.
    const raw = JSON.parse(readFileSync("seed/personalize/experiences.json", "utf8"));
    expect(raw.experiences[0].name).toBe(EXPERIENCE);
    expect(raw.experiences[0].content_types).toEqual(["hero_banner"]);
    expect(raw.experiences[0].variants[0]).toMatchObject({ name: VARIANT, audience: "volt_owners_commuting" });
    expect(raw.experiences[0].variants[0].entry).toEqual({
      ref: "heroBanner", content_type: "hero_banner", fields: FIELDS,
      _change_set: ["eyebrow_text", "headline", "description", "button_text"],
    });
    expect(raw.events.map((e) => e.key)).toEqual(EVENT_KEYS);

    const plan = planPersonalize(seed, baseState());
    expect(plan.variants).toEqual([{ experience: EXPERIENCE, variant: VARIANT, content_type: "hero_banner", entry: HERO, fields: FIELDS }]);
    expect(Object.keys(plan.variants[0].fields)).toEqual(["eyebrow_text", "headline", "description", "button_text"]);

    const h = harness();
    await runPersonalizePhase(h.deps);
    expect(h.calls.map(([n]) => n)).toEqual([
      "lytics-update-audience", "personalize-audiences", "personalize-create-experience",
      "cms-create-variant", "cms-publish-variant", "personalize-create-events",
    ]);
    const input = (name) => h.calls.find(([n]) => n === name)[1];
    expect(input("lytics-update-audience")).toEqual({ audience: "volt_owners_commuting", is_public: true });
    expect(input("personalize-create-experience")).toEqual({
      name: EXPERIENCE, variants: [{ name: VARIANT, audience: "aud1" }], content_type: "hero_banner", activate: true,
    });
    expect(input("cms-create-variant")).toEqual({ content_type: "hero_banner", entry: HERO, experience: EXPERIENCE, variant: VARIANT, fields: FIELDS });
    expect(input("cms-publish-variant")).toEqual({ content_type: "hero_banner", entry: HERO, experience: EXPERIENCE, variant: VARIANT });
    expect(input("cms-publish-variant")).not.toHaveProperty("allow_base_draft");
    expect(input("personalize-create-events").events.map((e) => e.key)).toEqual(EVENT_KEYS);

    expect(h.state.personalize.experiences).toEqual({ [EXPERIENCE]: { uid: "exp1", variants: { [VARIANT]: "cs_v1" } } });
    expect(h.state.personalize.events).toEqual(EVENT_KEYS);
    expect(Object.keys(h.state.personalize.steps)).toEqual(PERSONALIZE_STEPS);
    expect(h.state.phases.personalize.done).toBe(true);
    expect(h.saves.length).toBeGreaterThanOrEqual(PERSONALIZE_STEPS.length);

    // Without the imported hero entry nothing runs.
    const missing = harness({ state: { ids: {}, phases: { lytics: { done: true } } } });
    const err = await runPersonalizePhase(missing.deps).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(2);
    expect(`${err.message} ${err.hint ?? ""}`).toMatch(/run npm run kit:import first/);
    expect(missing.runCommand).not.toHaveBeenCalled();
  });

  it("skips steps already in state", async () => {
    const state = baseState();
    state.personalize = {
      steps: {
        makePublic: { done: true, at: "x" },
        audienceSync: { done: true, at: "x", result: { audiences: { volt_owners_commuting: { uid: "aud1", name: "Volt Owners × Commuting", slug: "volt_owners_commuting" } } } },
        experience: { done: true, at: "x" },
      },
      experiences: { [EXPERIENCE]: { uid: "exp1", variants: { [VARIANT]: "cs_v1" } } },
      events: [],
    };
    const h = harness({ state });
    await runPersonalizePhase(h.deps);
    expect(h.calls.map(([n]) => n)).toEqual(["cms-create-variant", "cms-publish-variant", "personalize-create-events"]);

    // A second run with everything done makes no calls at all.
    const again = harness({ state: h.state });
    await runPersonalizePhase(again.deps);
    expect(again.runCommand).not.toHaveBeenCalled();
  });

  it("stops cleanly on expired authtoken", async () => {
    const h = harness({
      fail: (name) => name === "personalize-create-experience"
        ? new RpError('POST personalize-api.contentstack.com/experiences → 401: {"message":"Unauthorized"}', { details: { status: 401, host: "personalize-api.contentstack.com" } })
        : null,
    });
    const err = await runPersonalizePhase(h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(2);
    expect(err.hint).toBe("Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it stores a fresh token for the kit), then re-run npm run kit:personalize.");
    const saved = h.saves.at(-1);
    expect(saved.personalize.steps.makePublic.done).toBe(true);
    expect(saved.personalize.steps.audienceSync.done).toBe(true);
    expect(saved.personalize.steps.experience?.done).not.toBe(true);
    expect(saved.phases.personalize?.done).not.toBe(true);
    expect(h.calls.map(([n]) => n)).not.toContain("cms-create-variant");

    // Contentstack error codes 105 and 294 mean the same thing, from any step.
    for (const error_code of [105, 294]) {
      const c = harness({
        fail: (name) => name === "cms-create-variant"
          ? new RpError(`PUT api.contentstack.io/v3/... → 422: {"error_code":${error_code}}`, { details: { status: 422, host: "api.contentstack.io", error_code } })
          : null,
      });
      const e = await runPersonalizePhase(c.deps).catch((x) => x);
      expect(e.code).toBe(2);
      expect(e.hint).toMatch(/rp\.mjs login/);
      expect(c.saves.at(-1).personalize.steps.experience.done).toBe(true);
    }
  });

  it("stops with exit 3 and the details when the base hero entry has unpublished changes", async () => {
    const details = { base_version: 3, has_draft: true, behind: [{ environment: "env_uid_1", published_version: 2 }] };
    const h = harness({
      fail: (name) => name === "cms-publish-variant"
        ? new RpError("The base entry has unpublished changes; publishing the variant would publish them too.", { code: 3, details, hint: "Ask the user." })
        : null,
    });
    const err = await runPersonalizePhase(h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe(3);
    expect(err.details).toEqual(details);
    expect(h.calls.filter(([n]) => n === "cms-publish-variant")).toHaveLength(1);
    expect(h.calls.map(([n]) => n)).not.toContain("personalize-create-events");
    expect(h.saves.at(-1).personalize.steps.variant.done).toBe(true);
    expect(h.saves.at(-1).personalize.steps.publish?.done).not.toBe(true);
  });

  it("polls every 15 s for the audience and times out after 5 minutes", async () => {
    let n = 0;
    const h = harness({ audiences: () => (++n < 3 ? [] : [{ uid: "aud9", name: "Volt Owners × Commuting", slug: "volt_owners_commuting", source: "LYTICS" }]) });
    const sleeps = [];
    const sleep = h.deps.sleep;
    h.deps.sleep = async (ms) => { sleeps.push(ms); await sleep(ms); };
    await runPersonalizePhase(h.deps);
    expect(sleeps).toEqual([15_000, 15_000]);
    expect(h.calls.find(([name]) => name === "personalize-create-experience")[1].variants[0].audience).toBe("aud9");

    const never = harness({ audiences: () => [{ uid: "x", name: "Other", slug: "other", source: "LYTICS" }] });
    const err = await runPersonalizePhase(never.deps).catch((e) => e);
    expect(err.code).toBe(1);
    expect(err.hint).toMatch(/Lytics.*Personalize/);
    expect(never.calls.filter(([name]) => name === "personalize-audiences").length).toBe(21);
    expect(never.saves.at(-1).personalize.steps.makePublic.done).toBe(true);
  });
});

describe("setup-personalize CLI", () => {
  // A credential store holding only what's given (no real keychain or files).
  const storeCreds = (stored = {}) => createCredentials({
    env: process.env,
    keychain: (service, account) => (service === "red-panda" ? stored[account] ?? null : null),
    files: [],
  });
  const stubRequired = () => {
    vi.stubEnv("CONTENTSTACK_API_KEY", "api_key_1");
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "proj_1");
    vi.stubEnv("LYTICS_ACCESS_TOKEN", "lytics_token_1");
  };
  const withState = (state) => {
    const path = join(mkdtempSync(join(tmpdir(), "kit-pz-")), "state.json");
    writeFileSync(path, JSON.stringify(state));
    return path;
  };

  it("--dry-run prints the plan and makes no calls", async () => {
    const runCommand = vi.fn();
    const lines = [];
    const code = await main(["--dry-run"], { runCommand, statePath: withState(baseState()), out: (s) => lines.push(s), err: (s) => lines.push(s) });
    expect(code).toBe(0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/Homepage – Reliability and range/);
    expect(lines.join("\n")).toMatch(new RegExp(HERO));
  });

  it("exits with the KitError code, saves progress and never prints the token", async () => {
    stubRequired();
    vi.stubEnv("CONTENTSTACK_AUTHTOKEN", "secret-session-token-123");
    try {
      const h = harness({
        fail: (name) => name === "personalize-create-experience"
          ? new RpError("401 for authtoken secret-session-token-123", { details: { status: 401 } })
          : null,
      });
      const statePath = withState(baseState());
      const errs = [];
      const code = await main([], { creds: storeCreds(), runCommand: h.runCommand, statePath, sleep: async () => {}, clock: () => 0, out: () => {}, err: (s) => errs.push(s) });
      expect(code).toBe(2);
      expect(errs.join("\n")).toMatch(/rp\.mjs login/);
      expect(errs.join("\n")).not.toMatch(/secret-session-token-123/);
      const saved = JSON.parse(readFileSync(statePath, "utf8"));
      expect(saved.personalize.steps.audienceSync.done).toBe(true);
      expect(saved.personalize.steps.experience).toBeUndefined();

      expect(await main([], { statePath: withState({ ids: {}, phases: { lytics: { done: true } } }), out: () => {}, err: () => {} })).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses a stored authtoken when CONTENTSTACK_AUTHTOKEN isn't in env, and asks for login when there is none", async () => {
    stubRequired();
    vi.stubEnv("CONTENTSTACK_AUTHTOKEN", "");
    try {
      const h = harness();
      const statePath = withState(baseState());
      const code = await main([], { creds: storeCreds({ CONTENTSTACK_AUTHTOKEN: "stored-token-1" }), runCommand: h.runCommand, statePath, sleep: async () => {}, clock: () => 0, out: () => {}, err: () => {} });
      expect(code).toBe(0);
      expect(h.runCommand).toHaveBeenCalled();
      expect(JSON.parse(readFileSync(statePath, "utf8")).phases.personalize.done).toBe(true);

      const none = harness();
      const errs = [];
      expect(await main([], { creds: storeCreds(), runCommand: none.runCommand, statePath: withState(baseState()), out: () => {}, err: (s) => errs.push(s) })).toBe(2);
      expect(none.runCommand).not.toHaveBeenCalled();
      expect(errs.join("\n")).toContain("(it stores a fresh token for the kit), then re-run npm run kit:personalize.");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
