// Between-demos reset: finds the Lytics audiences and Personalize experiences created during a
// demo run (after `since`) that aren't the kit's own, and deletes them: Personalize first
// (entry variants unpublished and deleted, then the experience and its variant group), then
// Lytics. Objects without a creation time are listed for a person to check, never deleted.
import { audiences as kitAudienceDefs, FUNNEL_CHECKS } from "../../lytics/lib/audienceDef.mjs";
import { KitError } from "./env.mjs";
import { toKitError } from "./personalizePhase.mjs";

/** Every Lytics audience slug the kit's seeder defines (story audiences, the funnel audiences and rp_check_*). */
export function kitAudienceSlugs() {
  return [...kitAudienceDefs({ commutingThreshold: 0 }).map((a) => a.slug_name), ...FUNNEL_CHECKS.map((a) => a.slug_name)];
}

const audienceSlug = (a) => a?.slug_name ?? a?.slug;
const timeOf = (...values) => {
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    const t = typeof v === "number" ? v : Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return null;
};

/**
 * @param {{since: string, audiences: object[], experiences: object[], state: object}} p
 *   audiences: Lytics segments (slug_name, created); experiences: Personalize experiences
 *   (uid, name, createdAt).
 * @returns {{audiences: string[], experiences: string[], experienceUids: Record<string,string>,
 *   unconfirmed: {audiences: string[], experiences: string[]}}}
 */
export function planReset({ since, audiences = [], experiences = [], state = {} }) {
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) throw new KitError(`--since "${since}" is not an ISO date`, { code: 2 });

  const ownSlugs = new Set(kitAudienceSlugs());
  const steps = state.personalize?.steps ?? {};
  for (const a of steps.makePublic?.result ?? []) if (a?.slug) ownSlugs.add(a.slug);
  const ownExp = state.personalize?.experiences ?? {};
  const ownNames = new Set(Object.keys(ownExp));
  const ownUids = new Set(Object.values(ownExp).map((e) => e?.uid).filter(Boolean));
  for (const e of steps.experience?.result ?? []) if (e?.uid) ownUids.add(e.uid);

  const out = { audiences: [], experiences: [], experienceUids: {}, unconfirmed: { audiences: [], experiences: [] } };
  for (const a of audiences) {
    const slug = audienceSlug(a);
    if (!slug || ownSlugs.has(slug)) continue;
    const t = timeOf(a.created, a.created_at);
    if (t === null) out.unconfirmed.audiences.push(slug);
    else if (t > sinceMs) out.audiences.push(slug);
  }
  for (const e of experiences) {
    if (ownUids.has(e.uid) || ownNames.has(e.name)) continue;
    const t = timeOf(e.createdAt, e.created_at, e.created);
    if (t === null) out.unconfirmed.experiences.push(e.name);
    else if (t > sinceMs) {
      out.experiences.push(e.name);
      out.experienceUids[e.name] = e.uid;
    }
  }
  return out;
}

export function describeReset(plan, since) {
  const lines = [`Created since ${since} (not the kit's own):`];
  const list = (title, items) => {
    lines.push(`${title}: ${items.length ? "" : "none"}`);
    for (const i of items) lines.push(`  - ${i}`);
  };
  list("Personalize experiences", plan.experiences);
  list("Lytics audiences", plan.audiences);
  const flagged = [...plan.unconfirmed.experiences.map((n) => `experience "${n}"`), ...plan.unconfirmed.audiences.map((s) => `audience ${s}`)];
  if (flagged.length) {
    lines.push("Not deleted automatically:");
    for (const f of flagged) lines.push(`  - ${f}: no timestamp — check by hand`);
  }
  return lines.join("\n");
}

// Already gone: an HTTP 404, or rp.mjs's lookup finding no such audience or experience. Other
// code-2 errors (a missing credential, an unknown environment) are real errors.
export const isNotFound = (e) =>
  e?.details?.status === 404 || (e?.code === 2 && /^(Lytics audience|Personalize experience) not found\b/.test(String(e?.message ?? "")));

// rp.mjs error → KitError (personalizePhase's mapping: an expired authtoken is exit 2 with the
// login hint), with its hints pointing at the script that is running.
export function asKitError(e, step, script = "kit:reset") {
  const k = toKitError(e, step);
  k.message = k.message.replace(/^Personalize setup stopped/, "Stopped");
  if (k.hint) k.hint = k.hint.replace(/kit:personalize/g, script);
  return k;
}

/**
 * Deletes what planReset found. Personalize first, then Lytics. Undated objects are never touched.
 * @param {object} d
 * @param {Function} d.runCommand  rp.mjs runCommand
 * @param {{get: Function}} d.cma  kit CMA client (variant groups)
 * @param {string[]} d.envNames    publish environments to unpublish variants from
 */
export async function runReset({ plan, state, runCommand, cma, envNames, log = () => {} }) {
  const call = async (step, name, args) => {
    try {
      return await runCommand(name, args);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw asKitError(e, step);
    }
  };
  const entries = state.created?.entries ?? [];
  for (const name of plan.experiences) {
    const uid = plan.experienceUids?.[name] ?? name;
    const exp = await call("experience", "personalize-experience", { positional: [uid] });
    if (!exp) { log(`experience "${name}" is already gone`); continue; }
    // Entry variants live on entries of the content types linked to the experience's variant group.
    const groups = exp.variant_group ? (await cma.get("/variant_groups"))?.variant_groups ?? [] : [];
    const cts = (groups.find((g) => g.uid === exp.variant_group)?.content_types ?? []).map((c) => c.uid ?? c);
    for (const v of exp.variants ?? []) {
      if (!v.cms_variant_uid) continue;
      for (const e of entries.filter((x) => cts.includes(x.ct))) {
        const input = { content_type: e.ct, entry: e.uid, variant_uid: v.cms_variant_uid, environments: envNames };
        const unpublished = await call("variant", "cms-unpublish-variant", { input });
        if (!unpublished) continue; // no variant on this entry
        await call("variant", "cms-delete-variant", { input });
        log(`deleted entry variant ${v.cms_variant_uid} on ${e.ct} ${e.uid}`);
      }
    }
    await call("experience", "personalize-delete-experience", { positional: [uid] });
    log(`deleted experience "${name}"`);
  }
  for (const slug of plan.audiences) {
    await call("audience", "lytics-delete-audience", { positional: [slug] });
    log(`deleted Lytics audience ${slug}`);
  }
}
