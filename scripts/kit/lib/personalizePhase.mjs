// Personalize phase: makes the persona's Lytics audience public, waits for it to sync into
// Personalize, creates and activates the homepage experience, writes and publishes the hero
// entry variant, and creates the event keys. Every step goes through rp.mjs's runCommand
// (idempotent commands), is skipped when state already records it, and is saved as it lands.
import { readFileSync } from "node:fs";
import { KitError } from "./env.mjs";
import { slugify } from "../../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

export const PERSONALIZE_STEPS = ["makePublic", "audienceSync", "experience", "variant", "publish", "events"];

export const LOGIN_HINT = "Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it stores a fresh token for the kit), then re-run npm run kit:personalize.";
const RERUN_HINT = "Fix the error above and re-run npm run kit:personalize; completed steps are skipped.";
const SYNC_POLL_MS = 15_000;
const SYNC_TIMEOUT_MS = 5 * 60_000;

export function loadPersonalizeSeed(path = "seed/personalize/experiences.json") {
  return JSON.parse(readFileSync(path, "utf8"));
}

// What the phase will do, resolved against state. Throws before any call when the import or
// the Lytics phase hasn't run, or when the seed's change set doesn't match its fields.
export function planPersonalize(seed, state) {
  if (!state.phases?.lytics?.done) {
    throw new KitError("The Lytics phase hasn't finished, so the audiences may not exist yet.", { code: 2, hint: "run npm run kit:lytics first" });
  }
  const experiences = seed.experiences ?? [];
  const audiences = [...new Set(experiences.flatMap((e) => e.variants.map((v) => v.audience)))];
  const variants = experiences.flatMap((exp) => exp.variants.map((v) => {
    const { ref, content_type, fields, _change_set: changeSet } = v.entry;
    const entry = state.ids?.[ref];
    if (!entry) {
      throw new KitError(`No ${content_type} entry recorded in .kit/state.json (ids.${ref}).`, { code: 2, hint: "run npm run kit:import first" });
    }
    if (changeSet && JSON.stringify(changeSet) !== JSON.stringify(Object.keys(fields))) {
      throw new KitError(`seed/personalize/experiences.json: "${v.name}" _change_set doesn't match its fields.`);
    }
    return { experience: exp.name, variant: v.name, content_type, entry, fields };
  }));
  return {
    audiences,
    experiences: experiences.map((exp) => ({
      name: exp.name,
      content_types: exp.content_types,
      variants: exp.variants.map((v) => ({ name: v.name, audience: v.audience })),
    })),
    variants,
    events: seed.events ?? [],
  };
}

const isLyticsHost = (host) => /(^|\.)lytics\.io$/i.test(String(host ?? ""));

// rp.mjs errors (RpError: code 1/2/3, details.status, details.error_code) → KitError.
export function toKitError(err, step) {
  if (err instanceof KitError) return err;
  const status = err?.details?.status;
  const errorCode = Number(err?.details?.error_code ?? String(err?.message ?? "").match(/"error_code":\s*(\d+)/)?.[1]);
  const where = `Personalize setup stopped at "${step}"`;
  if (status === 401 && isLyticsHost(err?.details?.host)) {
    return new KitError(`${where}: Lytics rejected the access token. ${err.message}`, {
      code: 2, hint: "Check LYTICS_ACCESS_TOKEN in .env.local (npm run kit:doctor), then re-run npm run kit:personalize",
    });
  }
  if (status === 401 || errorCode === 105 || errorCode === 294) {
    return new KitError(`${where}: the Contentstack authtoken has expired or was logged out. ${err.message}`, { code: 2, hint: LOGIN_HINT });
  }
  if (err?.code === 2) {
    const missing = String(err.message).match(/^Missing (?:credential )?([A-Z][A-Z0-9_]+)/)?.[1];
    return new KitError(`${where}: ${err.message}`, {
      code: 2,
      hint: missing ? `Add ${missing} to .env.local (see .env.example), then re-run npm run kit:personalize` : err.hint ?? RERUN_HINT,
      details: err.details,
    });
  }
  if (err?.code === 3) {
    const hint = step === "publish"
      ? "The base hero_banner entry has unpublished changes, and publishing the variant would publish them too. Publish or discard them in Contentstack, then re-run npm run kit:personalize. Nothing was changed."
      : `${err.hint ?? "Decide in Contentstack, then re-run npm run kit:personalize."} Nothing was changed.`;
    return new KitError(`${where}: ${err.message}`, { code: 3, hint, details: err.details });
  }
  return new KitError(`${where}: ${err?.message ?? err}`, { code: 1, hint: err?.hint ?? RERUN_HINT });
}

const matchesAudience = (a, ref) => {
  if (String(a.source ?? "").toUpperCase() !== "LYTICS") return false;
  const needle = String(ref).toLowerCase();
  return [a.slug, a.name].some((v) => v !== undefined && v !== null && String(v).toLowerCase() === needle) || slugify(a.name ?? "") === needle;
};

/**
 * @param {object} d
 * @param {(name: string, args?: {input?: object}) => Promise<any>} d.runCommand  rp.mjs runCommand (fake in tests)
 */
export async function runPersonalizePhase(d) {
  const { runCommand, seed, state, save = () => {}, sleep, clock, log = () => {}, warn = log } = d;
  const plan = planPersonalize(seed, state);
  const p = (state.personalize ??= {});
  p.steps ??= {};
  p.experiences ??= {};
  p.events ??= [];
  state.phases ??= {};
  const persist = () => save(state);
  const call = async (step, name, input) => {
    try {
      return await runCommand(name, { input });
    } catch (e) {
      throw toKitError(e, step);
    }
  };
  const step = async (name, label, fn) => {
    if (p.steps[name]?.done) { log(`skip ${label} (done)`); return; }
    log(label);
    const result = await fn();
    p.steps[name] = { done: true, at: new Date().toISOString(), ...(result === undefined ? {} : { result }) };
    persist();
  };

  await step("makePublic", `Making Lytics audience(s) public: ${plan.audiences.join(", ")}`, async () => {
    const out = [];
    for (const audience of plan.audiences) {
      const r = await call("makePublic", "lytics-update-audience", { audience, is_public: true });
      out.push({ slug: r?.slug ?? audience, is_public: r?.is_public ?? true });
    }
    return out;
  });

  await step("audienceSync", "Waiting for the audience to sync into Personalize (up to 5 min)", async () => {
    const deadline = clock() + SYNC_TIMEOUT_MS;
    for (;;) {
      const list = (await call("audienceSync", "personalize-audiences", {})) ?? [];
      const found = Object.fromEntries(plan.audiences.map((ref) => [ref, list.find((a) => matchesAudience(a, ref)) ?? null]));
      const missing = plan.audiences.filter((ref) => !found[ref]);
      if (!missing.length) {
        return { audiences: Object.fromEntries(Object.entries(found).map(([ref, a]) => [ref, { uid: a.uid, name: a.name, slug: a.slug ?? null }])) };
      }
      if (clock() >= deadline) {
        throw new KitError(`Audience not in Personalize after 5 minutes: ${missing.join(", ")}`, {
          code: 1,
          hint: "Check the Lytics ↔ Personalize connection in the Personalize UI (your project → Settings → Integrations / Lytics), then re-run npm run kit:personalize.",
        });
      }
      await sleep(SYNC_POLL_MS);
    }
  });
  const synced = p.steps.audienceSync.result?.audiences ?? {};

  await step("experience", "Creating and activating the experience", async () => {
    const out = [];
    for (const exp of plan.experiences) {
      // Ruling R23: "exists" for an experience the kit hadn't recorded means it was already there.
      const known = Boolean(p.experiences[exp.name]?.uid);
      const wasAdopted = Boolean(p.experiences[exp.name]?.adopted);
      const r = await call("experience", "personalize-create-experience", {
        name: exp.name,
        variants: exp.variants.map((v) => ({ name: v.name, audience: synced[v.audience]?.uid ?? v.audience })),
        content_type: exp.content_types.length === 1 ? exp.content_types[0] : exp.content_types,
        activate: true,
      });
      const variants = Object.fromEntries((r?.variants ?? []).map((v) => [v.name, v.cms_variant_uid ?? null]));
      p.experiences[exp.name] = { uid: r?.uid ?? null, variants, ...(wasAdopted || (r?.status === "exists" && !known) ? { adopted: true } : {}) };
      out.push({ name: exp.name, status: r?.status, uid: r?.uid ?? null, state: r?.state, variant_group: r?.variant_group ?? null });
    }
    return out;
  });

  await step("variant", "Writing the hero entry variant", async () => {
    const out = [];
    for (const v of plan.variants) {
      const r = await call("variant", "cms-create-variant", {
        content_type: v.content_type, entry: v.entry, experience: v.experience, variant: v.variant, fields: v.fields,
      });
      const exp = (p.experiences[v.experience] ??= { uid: null, variants: {} });
      exp.variants[v.variant] = r?.variant_uid ?? exp.variants[v.variant] ?? null;
      out.push({ entry: v.entry, variant_uid: r?.variant_uid ?? null, version: r?.version ?? null });
    }
    return out;
  });

  await step("publish", "Publishing the hero entry variant", async () => {
    const out = [];
    for (const v of plan.variants) {
      const r = await call("publish", "cms-publish-variant", {
        content_type: v.content_type, entry: v.entry, experience: v.experience, variant: v.variant,
      });
      if (r?.status && r.status !== "published") warn(`The variant publish is ${r.status}; it should go live within a minute.`);
      out.push({ entry: v.entry, status: r?.status ?? null, version: r?.version ?? null, environments: r?.environments ?? [] });
    }
    return out;
  });

  await step("events", `Creating event keys: ${plan.events.map((e) => e.key).join(", ")}`, async () => {
    const r = await call("events", "personalize-create-events", { events: plan.events });
    p.events = plan.events.map((e) => e.key);
    return (r ?? []).map(({ key, status }) => ({ key, status }));
  });

  state.phases.personalize = { done: true, at: new Date().toISOString() };
  persist();
  return state;
}
