// Import executor: replays seed/contentstack/ into the SE's stack through the CMA, following
// importOrder() from importPlan.mjs. Phase handlers live in importSchema.mjs (locales,
// environments, taxonomies, global fields, content types) and importContent.mjs (folders,
// assets, entries, publishing).
//
// Safety rules:
// - A pre-scan does every check before the first write: master locale (exit 2), field
//   extensions (exit 2), and conflicts (exit 3): a fixed-UID object (content type, global
//   field, taxonomy) that exists in the stack but that .kit/state.json doesn't record
//   creating. Nothing is ever overwritten that the kit didn't create. Existing environments
//   and locales with the snapshot's names are adopted instead (state.adopted).
// - Resumable: every finished step is recorded in state.progress and saved immediately, so a
//   re-run skips it. Before each create, state.pending names it; if the response was lost
//   (crash, 5xx after the write), the next run finds the object instead of creating it again.
import { readFile as fsReadFile } from "node:fs/promises";
import { KitError } from "./env.mjs";
import { danglingRefs, importOrder, remapExtensions } from "./importPlan.mjs";
import { SCHEMA_HANDLERS, SCHEMA_OUTCOMES } from "./importSchema.mjs";
import { CONTENT_HANDLERS, CONTENT_OUTCOMES } from "./importContent.mjs";

export const MASTER_LOCALE = "en";
export const CREATED_KINDS = ["locales", "environments", "taxonomies", "globalFields", "contentTypes", "folders", "assets", "entries"];

const HANDLERS = { ...SCHEMA_HANDLERS, ...CONTENT_HANDLERS };
const OUTCOMES = { ...SCHEMA_OUTCOMES, ...CONTENT_OUTCOMES };

// Fills in the importer's parts of the kit state without touching anything else in it.
export function prepareState(state) {
  state.uidMap ??= {};
  state.assets ??= {};
  state.created ??= {};
  for (const k of CREATED_KINDS) state.created[k] ??= [];
  state.adopted ??= {};
  state.adopted.environments ??= [];
  state.adopted.locales ??= [];
  state.progress ??= {};
  state.ids ??= {};
  state.phases ??= {};
  return state;
}

/**
 * @param {object} opts
 * @param {{get: Function, post: Function, put: Function, del: Function, upload: Function}} opts.cma
 * @param {import("./importPlan.mjs").Snapshot} opts.snapshot
 * @param {object} opts.state            kit state (mutated in place unless dryRun)
 * @param {string[]} [opts.envNames]     CONTENTSTACK_PUBLISH_ENVIRONMENTS
 * @param {string} opts.siteUrl          SITE_URL, the environments' base URL
 * @param {boolean} [opts.dryRun]        GETs only; returns the planned summary
 * @param {(state: object) => void} [opts.save]   called after every write
 * @param {(line: string) => void} [opts.log]
 * @param {(file: string) => Promise<Buffer>} [opts.readFile]  asset file reader (tests stub it)
 * @returns {Promise<{state: object, summary: Record<string, {created: number, skipped: number, updated: number}>}>}
 */
export async function runImport({ cma, snapshot, state, envNames = ["preview"], siteUrl, dryRun = false, save = () => {}, log = () => {}, readFile = fsReadFile }) {
  const work = prepareState(dryRun ? structuredClone(state) : state);
  const steps = importOrder(snapshot);
  const summary = {};
  let deferred = 0;
  for (const s of steps) summary[s.phase] ??= { created: 0, skipped: 0, updated: 0 };

  const ctx = {
    cma,
    snapshot,
    state: work,
    siteUrl,
    envNames,
    dryRun,
    log,
    readFile,
    master: MASTER_LOCALE,
    save: () => { if (!dryRun) save(work); },
    created: (kind) => work.created[kind],
    addCreated: (kind, value) => work.created[kind].push(value),
    isPending: (step) => work.pending?.phase === step.phase && work.pending?.key === step.key,
    // Marks the step as in flight (saved) before the create, so a lost response is recoverable.
    async creating(step, fn) {
      work.pending = { phase: step.phase, kind: step.kind, key: step.key };
      ctx.save();
      return fn();
    },
  };

  await prescan(ctx);

  for (const step of steps) {
    const done = work.progress[step.phase]?.[step.key];
    if (done) {
      summary[step.phase].skipped++;
      continue;
    }
    if (dryRun) {
      summary[step.phase][OUTCOMES[step.phase](ctx, step)]++;
      continue;
    }
    const outcome = await HANDLERS[step.phase](ctx, step);
    if (outcome === "deferred") {
      summary[step.phase].skipped++;
      deferred++;
      continue;
    }
    (work.progress[step.phase] ??= {})[step.key] = true;
    delete work.pending;
    summary[step.phase][outcome]++;
    if (step.phase === "entries:full") setIds(ctx);
    ctx.save();
  }
  setIds(ctx);
  ctx.save();
  // Publish steps skipped because none of the publish environments exists (finding I8).
  return { state: dryRun ? state : work, summary, deferred };
}

// state.ids: the target homepage (master locale) and the hero_banner its `hero` field references.
function setIds({ snapshot, state, master }) {
  const home = snapshot.entries.find((e) => e.ct === "homepage" && e.locale === master);
  if (!home) return;
  const hero = [home.entry?.hero].flat().find((r) => r?.uid)?.uid;
  if (state.uidMap[home.uid]) state.ids.homepage = state.uidMap[home.uid];
  if (hero && state.uidMap[hero]) state.ids.heroBanner = state.uidMap[hero];
}

// ---------------------------------------------------------------- pre-scan (GETs only)

async function prescan(ctx) {
  const { cma, snapshot, state, master } = ctx;

  // Ruling R11: the snapshot is authored in `en`, and a stack's master language can't change.
  const stackLocales = (await cma.get("/locales"))?.locales ?? [];
  const stackMaster = stackLocales.find((l) => !l.fallback_locale)?.code;
  if (stackMaster !== master) {
    throw new KitError(
      `This stack's master language is ${stackMaster ?? "unknown"}. Create a new stack with master language English (en), because the master language can't be changed.`,
      { code: 2, details: { masterLocale: stackMaster ?? null } },
    );
  }
  const snapMaster = snapshot.locales.find((l) => !l.fallback_locale)?.code;
  if (snapMaster && snapMaster !== master) {
    throw new KitError(`The snapshot's master language is ${snapMaster}, expected ${master}.`, { code: 1, hint: "Re-export the snapshot." });
  }

  // Field extensions are remapped by title; every schema is checked before anything is written.
  const exts = (await cma.get("/extensions", { include_marketplace_extensions: "true" }))?.extensions ?? [];
  const titleToUid = {};
  for (const x of exts) if (x.title && !titleToUid[x.title]) titleToUid[x.title] = x.uid;
  const uidToTitle = Object.fromEntries((snapshot.extensions ?? []).map((x) => [x.uid, x.title]));
  const missing = new Set();
  const remap = (schema) => {
    try {
      return remapExtensions(schema, titleToUid, uidToTitle);
    } catch (e) {
      if (e instanceof KitError && e.code === 2 && e.details?.missing) {
        e.details.missing.forEach((t) => missing.add(t));
        return null;
      }
      throw e;
    }
  };
  ctx.schemas = { globalFields: {}, contentTypes: {} };
  for (const g of snapshot.globalFields) ctx.schemas.globalFields[g.uid] = remap(g.schema);
  for (const c of snapshot.contentTypes) ctx.schemas.contentTypes[c.uid] = remap(c.schema);
  if (missing.size) {
    const list = [...missing];
    throw new KitError(`Missing field extension(s) in the target stack: ${list.join(", ")}`, {
      code: 2,
      hint: "Install the RP Commerce app in this stack (Marketplace → Apps), then re-run. Nothing was changed.",
      details: { missing: list },
    });
  }

  // Conflicts: fixed-UID objects in the stack that the kit didn't create.
  const ours = (kind, key, phase) => state.created[kind].includes(key) || (state.pending?.key === key && state.pending?.phase === phase);
  const conflicts = [];
  ctx.existing = new Set();
  const stackCodes = new Set(stackLocales.map((l) => l.code));
  // Ruling R13: a non-master locale that already exists is adopted (no write, never torn
  // down), like an environment; it isn't a conflict.
  for (const l of snapshot.locales) {
    if (l.code !== master && stackCodes.has(l.code)) ctx.existing.add(`locale:${l.code}`);
  }
  const probe = async (label, kind, path, uid, phase) => {
    if ((await cma.get(path)) === null) return;
    ctx.existing.add(`${label}:${uid}`);
    if (!ours(kind, uid, phase)) conflicts.push(`${label}:${uid}`);
  };
  for (const t of snapshot.taxonomies) await probe("taxonomy", "taxonomies", `/taxonomies/${t.taxonomy.uid}`, t.taxonomy.uid, "taxonomies");
  for (const g of snapshot.globalFields) await probe("global_field", "globalFields", `/global_fields/${g.uid}`, g.uid, "globalFields:base");
  for (const c of snapshot.contentTypes) await probe("content_type", "contentTypes", `/content_types/${c.uid}`, c.uid, "contentTypes:base");
  if (conflicts.length) {
    throw new KitError(
      `This stack already has ${conflicts.length} object(s) the import would create, and .kit/state.json doesn't record creating them: ${conflicts.join(", ")}`,
      {
        code: 3,
        hint: "Use a new, empty stack (or remove these from this one), then re-run. Nothing was changed.",
        details: { conflicts },
      },
    );
  }

  // Environments are matched by name. An existing one that the kit didn't create is adopted
  // (used for publishing, never deleted by teardown). CONTENTSTACK_PUBLISH_ENVIRONMENTS names
  // outside the snapshot are looked up too, since publishing may target them.
  ctx.envExisting = new Set();
  const envNames = new Set([...snapshot.environments.map((e) => e.name), ...ctx.envNames]);
  for (const name of envNames) {
    if ((await cma.get(`/environments/${encodeURIComponent(name)}`)) !== null) ctx.envExisting.add(name);
  }

  for (const name of ctx.envNames) {
    if (!ctx.envExisting.has(name) && !snapshot.environments.some((e) => e.name === name)) {
      ctx.log(`warning: CONTENTSTACK_PUBLISH_ENVIRONMENTS names "${name}", which isn't in this stack or the snapshot; nothing is published there`);
    }
  }

  // Ruling R10: references to entries that aren't in the snapshot (deleted in the source) are
  // reported and pruned before the references pass.
  const dangling = danglingRefs(snapshot);
  ctx.danglingUids = new Set(dangling.map((d) => d.uid));
  ctx.danglingEntries = new Set(dangling.map((d) => d.entry));
  for (const d of dangling) {
    ctx.log(`warning: dangling reference in ${d.entry} at ${d.path} → ${d.ct}/${d.uid} (not in the snapshot; removed)`);
  }
}

