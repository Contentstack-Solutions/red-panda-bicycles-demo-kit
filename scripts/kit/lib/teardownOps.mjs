// Full uninstall: removes what setup created, in reverse order, driven only by what
// .kit/state.json records as created (state.created, state.personalize, state.brandkit).
// Anything the kit found already there is adopted (state.adopted, state.brandkit.adopted,
// adopted experiences, event keys not recorded as created) and only ever becomes a manual step.
// Every deletion is recorded in state.tornDown and saved at once, so a re-run skips it.
import { LOOKALIKE_MODELS } from "../../lytics/lib/audienceDef.mjs";
import { KitError } from "./env.mjs";
import { firstArray, profileName, profilesApi, uidOf, vaultBase } from "./brandkitPhase.mjs";
import { parseEntryKey } from "./importPlan.mjs";
import { MASTER_LOCALE } from "./importRun.mjs";
import { asKitError, isNotFound, kitAudienceSlugs } from "./resetOps.mjs";
import { describeForeign, findForeignContents, remainingContentTypes } from "./teardownChecks.mjs";

export const LYTICS_LIMITS_NOTE =
  "Lytics profiles and events can't be deleted through the API, so the seeded profiles and their history stay in the Lytics account. " +
  "Use a dedicated sandbox Lytics account for this demo.";
export const MODELS_FIRST = "Delete the lookalike models first (Lytics UI), then re-run: Lytics may refuse to delete an audience a model still uses.";

const uniq = (xs) => [...new Set(xs)];
const existed = (what) => `${what} existed before setup; delete it yourself if you want`;

// Locales each kit entry has (target uid → codes), from the import's finished entry steps.
function entryLocales(state) {
  const out = {};
  for (const key of Object.keys(state.progress?.["entries:base"] ?? {})) {
    let k;
    try { k = parseEntryKey(key); } catch { continue; }
    const target = state.uidMap?.[k.uid];
    if (target) (out[target] ??= []).push(k.locale);
  }
  for (const t of Object.keys(out)) out[t] = uniq([MASTER_LOCALE, ...out[t]].filter((l) => out[t].includes(l)));
  return out;
}

/**
 * The ordered tear-down plan.
 * @param {object} state  kit state
 * @param {{envNames?: string[]}} [opts]  publish environments to unpublish from
 * @returns {{id: string, kind: string, label: string}[]}  plus each kind's own fields. Kind
 *   "manual" steps are for a person and never run; "check-containers" runs every time.
 */
export function planTeardown(state, { envNames = ["preview"] } = {}) {
  const steps = [];
  const add = (step) => steps.push(step);
  const manual = (id, label) => add({ id: `manual:${id}`, kind: "manual", label });
  const created = state.created ?? {};
  const adopted = state.adopted ?? {};
  const list = (kind) => {
    const v = created[kind] ?? [];
    if (!Array.isArray(v)) throw new KitError(`.kit/state.json: created.${kind} isn't a list`, { code: 1, hint: "The state file isn't in the shape setup writes; nothing was changed." });
    return [...v];
  };
  const entries = list("entries");
  const ctOf = (uid) => entries.find((e) => e.uid === uid)?.ct ?? null;
  const p = state.personalize ?? {};
  const pSteps = p.steps ?? {};
  const bk = state.brandkit ?? {};
  const bkAdopted = { vault: bk.adopted?.vault ?? {}, profiles: bk.adopted?.profiles ?? {} };

  // 1. Brand Kit voice profiles and Knowledge Vault items the kit created
  for (const [name, uid] of Object.entries(bk.profiles ?? {})) {
    if (name in bkAdopted.profiles) continue;
    add({ id: `brandkit:profile:${uid ?? name}`, kind: "brandkit-profile", uid: uid ?? null, name, label: `Delete voice profile "${name}"` });
  }
  for (const [title, uid] of Object.entries(bk.vault ?? {})) {
    if (title in bkAdopted.vault) continue;
    if (!uid) manual(`vault:${title}`, `Delete the Knowledge Vault item "${title}" by hand (its uid wasn't recorded)`);
    else add({ id: `brandkit:vault:${uid}`, kind: "brandkit-vault", uid, title, label: `Delete Knowledge Vault item "${title}"` });
  }
  for (const name of Object.keys(bkAdopted.profiles)) manual(`adopted-profile:${name}`, existed(`Voice profile "${name}"`));
  for (const title of Object.keys(bkAdopted.vault)) manual(`adopted-vault:${title}`, existed(`Knowledge Vault item "${title}"`));

  // Experiences that were already there (R23): they, their variants and variant group are manual.
  const experiences = Object.entries(p.experiences ?? {});
  const adoptedExps = experiences.filter(([, e]) => e?.adopted);
  const adoptedVariantUids = new Set(adoptedExps.flatMap(([, e]) => Object.values(e.variants ?? {})).filter(Boolean));
  const adoptedNames = new Set(adoptedExps.map(([n]) => n));
  const adoptedRefs = new Set(adoptedExps.map(([n, e]) => e.uid ?? n));

  // 2. Entry variants: unpublish, then delete
  const variants = (pSteps.variant?.result ?? []).filter((v) => v?.entry && v?.variant_uid);
  const ours = [];
  for (const v of variants) {
    const ct = ctOf(v.entry);
    if (adoptedVariantUids.has(v.variant_uid)) manual(`variant:${v.entry}:${v.variant_uid}`, `Entry variant ${v.variant_uid} on entry ${v.entry} belongs to an experience that existed before setup; unpublish and delete it yourself if you want`);
    else if (!ct) manual(`variant:${v.entry}:${v.variant_uid}`, `Unpublish and delete entry variant ${v.variant_uid} on entry ${v.entry} by hand (its content type isn't recorded)`);
    else ours.push({ content_type: ct, entry: v.entry, variant_uid: v.variant_uid });
  }
  for (const v of ours) add({ id: `variant-unpublish:${v.entry}:${v.variant_uid}`, kind: "variant-unpublish", ...v, environments: [...envNames], label: `Unpublish entry variant ${v.variant_uid} on ${v.content_type} ${v.entry} from ${envNames.join(", ")}` });
  for (const v of ours) add({ id: `variant-delete:${v.entry}:${v.variant_uid}`, kind: "variant-delete", ...v, label: `Delete entry variant ${v.variant_uid} on ${v.content_type} ${v.entry}` });

  // 3. Experiences the kit created, then their leftover variant groups
  for (const [name, exp] of experiences) {
    const ref = exp?.uid ?? name;
    if (exp?.adopted) manual(`experience:${ref}`, existed(`Personalize experience "${name}"`));
    else add({ id: `experience:${ref}`, kind: "experience-delete", ref, name, label: `Delete Personalize experience "${name}"` });
  }
  const groups = (pSteps.experience?.result ?? []).filter((e) => e?.variant_group);
  for (const uid of uniq(groups.map((e) => e.variant_group))) {
    const owner = groups.find((e) => e.variant_group === uid);
    if (adoptedNames.has(owner?.name) || adoptedRefs.has(owner?.uid)) manual(`variant-group:${uid}`, existed(`Variant group ${uid} (of experience "${owner?.name}")`));
    else add({ id: `variant-group:${uid}`, kind: "variant-group-delete", uid, label: `Delete variant group ${uid} if it's still in the stack` });
  }

  // 4. Event keys recorded as created. "exists" or no status: kept.
  for (const e of pSteps.events?.result ?? []) {
    if (!e?.key) continue;
    if (e.status === "created") add({ id: `event:${e.key}`, kind: "event-delete", key: e.key, label: `Delete Personalize event key ${e.key}` });
    else manual(`event:${e.key}`, `Event key ${e.key} is kept: it existed before setup, or the kit didn't record creating it; delete it yourself if you want`);
  }

  // 5. Entries: unpublish each in the locales it has, then delete (last created first)
  const locales = entryLocales(state);
  const reversed = entries.slice().reverse();
  for (const e of reversed) {
    add({ id: `entry-unpublish:${e.ct}/${e.uid}`, kind: "entry-unpublish", ct: e.ct, uid: e.uid, environments: [...envNames], locales: locales[e.uid] ?? [MASTER_LOCALE], label: `Unpublish ${e.ct} entry ${e.uid}` });
  }
  for (const e of reversed) add({ id: `entry:${e.ct}/${e.uid}`, kind: "entry-delete", ct: e.ct, uid: e.uid, label: `Delete ${e.ct} entry ${e.uid} (all locales)` });

  // 6. Assets; then (R24) check that no kit container holds anyone else's content; then folders
  for (const uid of list("assets").reverse()) add({ id: `asset:${uid}`, kind: "asset-delete", uid, label: `Delete asset ${uid}` });
  if (list("contentTypes").length || list("folders").length) {
    add({ id: "check:containers", kind: "check-containers", label: "Check the kit's content types and asset folders hold nothing the kit didn't create" });
  }
  for (const uid of list("folders").reverse()) add({ id: `folder:${uid}`, kind: "folder-delete", uid, label: `Delete asset folder ${uid}` });

  // 7. Content types, then the global fields they use, then the stand-in field extensions
  // (--without-commerce) that both used, then taxonomies
  for (const uid of list("contentTypes").reverse()) add({ id: `content-type:${uid}`, kind: "content-type-delete", uid, label: `Delete content type ${uid}` });
  for (const uid of list("globalFields").reverse()) add({ id: `global-field:${uid}`, kind: "global-field-delete", uid, label: `Delete global field ${uid}` });
  for (const uid of list("extensions").reverse()) add({ id: `extension:${uid}`, kind: "extension-delete", uid, label: `Delete stand-in field extension ${uid}` });
  for (const uid of list("taxonomies").reverse()) add({ id: `taxonomy:${uid}`, kind: "taxonomy-delete", uid, label: `Delete taxonomy ${uid}` });

  // 8. Environments and languages the kit created (never adopted ones)
  const adoptedEnvs = new Set(adopted.environments ?? []);
  const adoptedLocales = new Set(adopted.locales ?? []);
  for (const name of list("environments").reverse()) {
    if (!adoptedEnvs.has(name)) add({ id: `environment:${name}`, kind: "environment-delete", name, label: `Delete environment ${name}` });
  }
  for (const code of list("locales").reverse()) {
    if (code !== MASTER_LOCALE && !adoptedLocales.has(code)) add({ id: `locale:${code}`, kind: "locale-delete", code, label: `Delete language ${code} (only if the stack has no other content types left)` });
  }

  // 9. Lytics audiences the seeder recorded creating (R21); models are manual
  const lytics = state.phases?.lytics?.steps ?? {};
  const createdAud = created.lyticsAudiences;
  if (Array.isArray(createdAud)) {
    for (const slug of createdAud) add({ id: `audience:${slug}`, kind: "audience-delete", slug, label: `Delete Lytics audience ${slug}` });
    for (const slug of adopted.lyticsAudiences ?? []) manual(`audience:${slug}`, existed(`Lytics audience ${slug}`));
  } else if (lytics.audiences?.done) {
    for (const slug of kitAudienceSlugs()) manual(`audience:${slug}`, `Lytics audience ${slug}: the kit has no record of creating it; delete it yourself if setup made it`);
  }
  // R35: put back the account's own api_whitelist_fields, recorded before setup first changed it.
  if (Array.isArray(state.lytics?.previousWhitelist)) {
    const value = [...state.lytics.previousWhitelist];
    add({ id: "lytics:whitelist", kind: "lytics-whitelist-restore", value, label: `Restore the Lytics api_whitelist_fields setting to its value before setup (${value.length} field(s))` });
  }
  if (createdAud?.length) {
    manual("personalize-audiences", "Check Personalize → Audiences a few minutes later and delete any synced copies of the deleted Lytics audiences that are still listed");
  }
  if (lytics.model?.done) {
    for (const m of LOOKALIKE_MODELS) manual(`model:${m.name}`, `Delete the Lytics lookalike model "${m.name}" in the Lytics UI (the kit has no confirmed API endpoint for deleting models). ${MODELS_FIRST}`);
  }
  if (Object.keys(bk.vault ?? {}).length || Object.keys(bk.profiles ?? {}).length || Object.keys(bkAdopted.vault).length || Object.keys(bkAdopted.profiles).length) {
    manual("brand-kit", "Delete the Brand Kit itself in Contentstack if you no longer need it (teardown removes only the items and profiles it created)");
  }
  return steps;
}

const isWork = (s) => s.kind !== "manual" && s.kind !== "check-containers";
export const workSteps = (steps) => steps.filter(isWork);
export const manualSteps = (steps) => steps.filter((s) => s.kind === "manual");
export const allDone = (steps, state) => workSteps(steps).every((s) => state.tornDown?.[s.id]);

export function describeTeardown(steps, state = {}) {
  const done = state.tornDown ?? {};
  const counts = {};
  for (const s of steps) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  const w = Math.max(4, ...Object.keys(counts).map((k) => k.length));
  const lines = ["Counts:"];
  for (const [kind, n] of Object.entries(counts)) lines.push(`  ${kind.padEnd(w)}  ${n}`);
  lines.push("Plan, in order:");
  let i = 0;
  for (const s of steps.filter((x) => x.kind !== "manual")) lines.push(`  ${String(++i).padStart(3)}. ${s.label}${done[s.id] ? ` (done: ${done[s.id].outcome ?? "deleted"})` : ""}`);
  lines.push(describeManual(steps));
  return lines.filter(Boolean).join("\n");
}

export function describeManual(steps) {
  const manual = manualSteps(steps);
  return manual.length ? ["By hand:", ...manual.map((s) => `  - ${s.label}`)].join("\n") : "";
}

// ------------------------------------------------------------------ execution

const GONE = "already deleted";
const brandkitUnconfirmed = (e) => new KitError(`${e.message} (the item is still listed, so it isn't deleted)`, { code: e.code === 2 ? 2 : 1, hint: e.hint });

async function listVault(api) {
  return firstArray(await api("GET", `${vaultBase()}/get-context?limit=50`), ["items", "contexts", "contents", "knowledge_vault"]);
}

// Endpoints the kit hasn't confirmed (Brand Kit and event DELETEs) only run when a GET shows the
// object is there, and a failed DELETE is an error: a 404 from them never counts as deleted.
const EXEC = {
  async "brandkit-vault"(s, d) {
    if (!(await listVault(d.brandkitApi)).some((i) => uidOf(i) === s.uid)) return GONE;
    try { await d.brandkitApi("DELETE", `${vaultBase()}/${s.uid}`); } catch (e) { throw brandkitUnconfirmed(e); }
    return "deleted";
  },
  async "brandkit-profile"(s, d) {
    if (!d.brandKitUid) throw new KitError("BRAND_KIT_UID is not set", { code: 2, hint: "Add it to .env.local." });
    const url = `${profilesApi()}/brand-kits/${d.brandKitUid}/profiles`;
    const v2 = { version: "v2" };
    const list = firstArray(await d.brandkitApi("GET", url, { extra: v2 }), ["profiles", "items"]);
    const hit = list.find((x) => (s.uid ? uidOf(x) === s.uid : profileName(x) === s.name));
    if (!hit) return GONE;
    try { await d.brandkitApi("DELETE", `${url}/${uidOf(hit)}`, { extra: v2 }); } catch (e) { throw brandkitUnconfirmed(e); }
    return "deleted";
  },
  async "variant-unpublish"(s, d) {
    await d.runCommand("cms-unpublish-variant", { input: { content_type: s.content_type, entry: s.entry, variant_uid: s.variant_uid, environments: s.environments } });
    return "unpublished";
  },
  async "variant-delete"(s, d) {
    await d.runCommand("cms-delete-variant", { input: { content_type: s.content_type, entry: s.entry, variant_uid: s.variant_uid } });
    return "deleted";
  },
  async "experience-delete"(s, d) {
    await d.runCommand("personalize-delete-experience", { positional: [s.ref] });
    return "deleted";
  },
  async "variant-group-delete"(s, d) {
    const groups = (await d.cma.get("/variant_groups"))?.variant_groups ?? [];
    if (!groups.some((g) => g.uid === s.uid)) return GONE;
    await d.cma.del(`/variant_groups/${s.uid}`);
    return "deleted";
  },
  async "event-delete"(s, d) {
    const found = ((await d.personalize("GET", "/events")) ?? []).find((e) => e.key === s.key);
    if (!found) return GONE;
    try {
      await d.personalize("DELETE", `/events/${found.uid}`);
    } catch (e) {
      if (isNotFound(e)) throw new KitError(`DELETE /events/${found.uid} returned 404 although event ${s.key} is listed`, { code: 1, hint: "Delete the event key in Personalize → Events by hand, then re-run." });
      throw e;
    }
    return "deleted";
  },
  async "entry-unpublish"(s, d) {
    await d.cma.post(`/content_types/${s.ct}/entries/${s.uid}/unpublish`, { entry: { environments: s.environments, locales: s.locales } });
    return "unpublished";
  },
  async "entry-delete"(s, d) {
    await d.cma.del(`/content_types/${s.ct}/entries/${s.uid}?locale=${MASTER_LOCALE}&delete_all_localized=true`);
    return "deleted";
  },
  "asset-delete": (s, d) => d.cma.del(`/assets/${s.uid}`).then(() => "deleted"),
  async "check-containers"(s, d, state) {
    const foreign = await findForeignContents(state, d.cma);
    if (foreign.length) {
      throw new KitError(`The kit's containers hold content the kit didn't create:\n${describeForeign(foreign)}`, {
        code: 3,
        hint: "Move or delete that content in Contentstack (or keep these containers and stop here), then re-run. No content type, folder or schema was deleted.",
      });
    }
    return "checked";
  },
  "folder-delete": (s, d) => d.cma.del(`/assets/folders/${s.uid}`).then(() => "deleted"),
  "content-type-delete": (s, d) => d.cma.del(`/content_types/${s.uid}`).then(() => "deleted"),
  "global-field-delete": (s, d) => d.cma.del(`/global_fields/${s.uid}`).then(() => "deleted"),
  "extension-delete": (s, d) => d.cma.del(`/extensions/${s.uid}`).then(() => "deleted"),
  "taxonomy-delete": (s, d) => d.cma.del(`/taxonomies/${s.uid}`).then(() => "deleted"),
  "environment-delete": (s, d) => d.cma.del(`/environments/${encodeURIComponent(s.name)}`).then(() => "deleted"),
  async "locale-delete"(s, d, state, log) {
    // The kit's content types are gone by now, so any content type left is someone else's,
    // and its entries may be localized in this language.
    const left = await remainingContentTypes(d.cma);
    if (left.length) {
      log(`Keeping language ${s.code}: the stack still has content types the kit didn't create (${left.join(", ")}). Delete it yourself if you want.`);
      return `kept: other content types remain (${left.join(", ")}); delete the language by hand if you want`;
    }
    await d.cma.del(`/locales/${s.code}`);
    return "deleted";
  },
  async "audience-delete"(s, d) {
    await d.runCommand("lytics-delete-audience", { positional: [s.slug] });
    return "deleted";
  },
  async "lytics-whitelist-restore"(s, d) {
    await d.lyticsSetting("api_whitelist_fields", s.value);
    return "restored";
  },
};

// Unconfirmed-endpoint kinds decide "already deleted" themselves (from a GET).
const SELF_CHECKED = new Set(["brandkit-vault", "brandkit-profile", "event-delete", "check-containers"]);

/**
 * Runs the plan in order. Each finished step goes into state.tornDown and is saved at once; a
 * 404 counts as already deleted. Any other error stops the run with the steps still to do in
 * err.details.remaining and the failed step's kind in err.details.failedKind.
 */
export async function runTeardown({ steps, state, deps, save = () => {}, log = () => {} }) {
  state.tornDown ??= {};
  const todo = steps.filter((s) => s.kind !== "manual");
  for (let i = 0; i < todo.length; i++) {
    const s = todo[i];
    if (state.tornDown[s.id]) { log(`skip ${s.label} (done)`); continue; }
    let outcome;
    try {
      outcome = await EXEC[s.kind](s, deps, state, log);
    } catch (e) {
      if (!SELF_CHECKED.has(s.kind) && isNotFound(e)) outcome = GONE;
      else {
        const k = e instanceof KitError ? e : asKitError(e, s.kind, "kit:teardown");
        const remaining = todo.slice(i).filter((x) => isWork(x) && !state.tornDown[x.id]).map((x) => x.label);
        throw new KitError(`Teardown stopped at "${s.label}": ${k.message}`, { code: k.code, hint: k.hint, details: { remaining, failedKind: s.kind } });
      }
    }
    if (s.kind === "check-containers") { log(`${s.label}: ok`); continue; } // re-checked on every run
    state.tornDown[s.id] = { at: new Date().toISOString(), outcome };
    save(state);
    log(`${s.label}: ${outcome}`);
  }
  return state;
}

/** Credentials each kind of step needs, so a run can stop before its first call. */
export function teardownNeeds(steps, state = {}) {
  const kinds = new Set(steps.filter((s) => s.kind !== "manual" && !state.tornDown?.[s.id]).map((s) => s.kind));
  const has = (...ks) => ks.some((k) => kinds.has(k));
  return {
    brandkit: has("brandkit-vault", "brandkit-profile"),
    personalize: has("variant-unpublish", "variant-delete", "experience-delete", "event-delete"),
    cma: has("variant-group-delete", "entry-unpublish", "entry-delete", "asset-delete", "check-containers", "folder-delete", "content-type-delete", "global-field-delete", "extension-delete", "taxonomy-delete", "environment-delete", "locale-delete"),
    lytics: has("audience-delete", "lytics-whitelist-restore"),
    lyticsSettings: has("lytics-whitelist-restore"),
  };
}
