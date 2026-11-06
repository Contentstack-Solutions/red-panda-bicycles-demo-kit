// Import handlers for the content phases: asset folders, assets, entries (base and references
// passes, with nl localized after en) and publishing. Folders, assets and entries get new UIDs
// in the target stack; state.uidMap maps source -> target, and state.assets holds {uid, url}.
// Each handler returns the step outcome: "created", "updated", "skipped", or "deferred"
// (not recorded as done, so a later run retries it).
import path from "node:path";
import { KitError } from "./env.mjs";
import { parseEntryKey, pruneRefs, rewriteEntry } from "./importPlan.mjs";

const snapshotEntry = (ctx, key) => {
  const { ct, uid, locale } = parseEntryKey(key);
  const e = ctx.snapshot.entries.find((x) => x.ct === ct && x.uid === uid && x.locale === locale);
  if (!e) throw new KitError(`Snapshot has no entry ${key}`, { code: 1 });
  return e;
};
const ctSchema = (ctx, ct) => ctx.snapshot.contentTypes.find((c) => c.uid === ct)?.schema ?? [];
const target = (ctx, srcUid, what) => {
  const t = ctx.state.uidMap[srcUid];
  if (!t) throw new KitError(`No target ${what} for source ${srcUid}; its create step hasn't run`, { code: 1 });
  return t;
};

// After a lost create response (state.pending), look for the object the last run created:
// the one match that no source object is mapped to yet. Two or more matches need a person.
async function recoverPending(ctx, step, list, describe) {
  if (!ctx.isPending(step)) return null;
  const mapped = new Set(Object.values(ctx.state.uidMap));
  const hits = (list ?? []).filter((x) => x?.uid && !mapped.has(x.uid));
  if (hits.length > 1) {
    throw new KitError(`Can't tell which of ${hits.map((h) => h.uid).join(", ")} the last run created for ${describe}`, {
      code: 3,
      hint: "Delete the extra copies in the stack, then re-run.",
      details: { candidates: hits.map((h) => h.uid), step },
    });
  }
  if (hits.length === 1) ctx.log(`recovered ${describe} → ${hits[0].uid} (created by the last run)`);
  return hits[0] ?? null;
}

// The entry body for the target stack: dangling refs pruned (ruling R10), references and
// assets remapped. `locale` is a read-only system field, so it isn't sent.
function entryBody(ctx, e, withReferences) {
  const schema = ctSchema(ctx, e.ct);
  const opts = { globalFields: ctx.snapshot.globalFields };
  let src = e.entry;
  if (ctx.danglingEntries.has(`${e.ct}/${e.uid}.${e.locale}`)) src = pruneRefs(src, schema, ctx.danglingUids, opts);
  const out = rewriteEntry(src, schema, ctx.state.uidMap, ctx.state.assets, { withReferences, ...opts });
  delete out.locale;
  return out;
}

// Environments publishing may use: requested names that exist in the stack (created by the
// kit, adopted, or already there).
export function publishEnvironments(ctx) {
  const have = new Set([...ctx.envExisting, ...ctx.state.created.environments, ...ctx.state.adopted.environments]);
  if (ctx.dryRun) for (const e of ctx.snapshot.environments) have.add(e.name);
  return ctx.envNames.filter((n) => have.has(n));
}

function publishTargets(ctx) {
  const envs = publishEnvironments(ctx);
  if (!envs.length && !ctx.warnedNoEnvironments) {
    ctx.warnedNoEnvironments = true;
    ctx.log(`warning: none of CONTENTSTACK_PUBLISH_ENVIRONMENTS (${ctx.envNames.join(", ") || "empty"}) exists in the stack; nothing is published`);
  }
  return envs;
}

// Locales an entry is published in: the master publish covers every locale the snapshot has
// for that entry; a localized version is only published on its own if the master isn't.
function entryPublishLocales(ctx, e) {
  const versions = ctx.snapshot.entries.filter((x) => x.ct === e.ct && x.uid === e.uid);
  if (e.locale === ctx.master) return [e.locale, ...versions.map((x) => x.locale).filter((l) => l !== e.locale)];
  return versions.some((x) => x.locale === ctx.master && x.publish_environments?.length) ? null : [e.locale];
}

export const CONTENT_HANDLERS = {
  async folders(ctx, step) {
    const { cma, state } = ctx;
    const f = ctx.snapshot.folders.find((x) => x.uid === step.key);
    const parent = f.parent_uid ? target(ctx, f.parent_uid, "folder") : null;
    const query = { is_dir: true, name: f.name, ...(parent ? { parent_uid: parent } : {}) };
    const found = ctx.isPending(step)
      ? await recoverPending(ctx, step, (await cma.get("/assets", { include_folders: "true", query: JSON.stringify(query) }))?.assets, `folder "${f.name}"`)
      : null;
    const uid = found?.uid ?? (await ctx.creating(step, () => cma.post("/assets/folders", { asset: { name: f.name, ...(parent ? { parent_uid: parent } : {}) } })))?.asset?.uid;
    if (!uid) throw new KitError(`Folder "${f.name}" was created but the response has no uid`, { code: 1 });
    state.uidMap[f.uid] = uid;
    ctx.addCreated("folders", uid);
    return found ? "skipped" : "created";
  },

  async assets(ctx, step) {
    const { cma, state } = ctx;
    const a = ctx.snapshot.assets.find((x) => x.uid === step.key);
    const parent = a.parent_uid ? target(ctx, a.parent_uid, "folder") : null;
    let asset = ctx.isPending(step)
      ? await recoverPending(ctx, step, (await cma.get("/assets", { query: JSON.stringify({ filename: a.filename, ...(parent ? { parent_uid: parent } : {}) }) }))?.assets, `asset ${a.filename}`)
      : null;
    const recovered = Boolean(asset);
    if (!asset) {
      const bytes = await ctx.readFile(path.join(ctx.snapshot.dir, a.file));
      const form = new FormData();
      form.append("asset[upload]", new Blob([bytes], { type: a.content_type }), a.filename);
      if (parent) form.append("asset[parent_uid]", parent);
      if (a.title) form.append("asset[title]", a.title);
      if (a.description) form.append("asset[description]", a.description);
      asset = (await ctx.creating(step, () => cma.upload("/assets", form)))?.asset;
    }
    if (!asset?.uid) throw new KitError(`Asset ${a.filename} was uploaded but the response has no uid`, { code: 1 });
    state.assets[a.uid] = { uid: asset.uid, url: asset.url };
    state.uidMap[a.uid] = asset.uid;
    ctx.addCreated("assets", asset.uid);
    return recovered ? "skipped" : "created";
  },

  // Master locale: create without references. Other locales: localize the new entry (PUT ?locale=).
  async "entries:base"(ctx, step) {
    const { cma, state } = ctx;
    const e = snapshotEntry(ctx, step.key);
    const body = entryBody(ctx, e, false);
    if (e.locale !== ctx.master) {
      await cma.put(`/content_types/${e.ct}/entries/${target(ctx, e.uid, "entry")}?locale=${e.locale}`, { entry: body });
      return "updated";
    }
    const found = ctx.isPending(step) && body.title
      ? await recoverPending(ctx, step, (await cma.get(`/content_types/${e.ct}/entries`, { locale: e.locale, query: JSON.stringify({ title: body.title }) }))?.entries, `${e.ct} entry "${body.title}"`)
      : null;
    const uid = found?.uid ?? (await ctx.creating(step, () => cma.post(`/content_types/${e.ct}/entries?locale=${e.locale}`, { entry: body })))?.entry?.uid;
    if (!uid) throw new KitError(`Entry ${step.key} was created but the response has no uid`, { code: 1 });
    state.uidMap[e.uid] = uid;
    ctx.addCreated("entries", { ct: e.ct, uid });
    return found ? "skipped" : "created";
  },

  async "entries:full"(ctx, step) {
    const e = snapshotEntry(ctx, step.key);
    const body = entryBody(ctx, e, true);
    await ctx.cma.put(`/content_types/${e.ct}/entries/${target(ctx, e.uid, "entry")}?locale=${e.locale}`, { entry: body });
    return "updated";
  },

  async "publish:assets"(ctx, step) {
    const environments = publishTargets(ctx);
    if (!environments.length) return "deferred";
    const t = ctx.state.assets[step.key]?.uid ?? target(ctx, step.key, "asset");
    const locales = ctx.snapshot.locales.map((l) => l.code);
    await ctx.cma.post(`/assets/${t}/publish`, { asset: { environments, locales } });
    return "updated";
  },

  async "publish:entries"(ctx, step) {
    const e = snapshotEntry(ctx, step.key);
    const locales = entryPublishLocales(ctx, e);
    if (!locales) return "skipped"; // published with its master-locale version
    const environments = publishTargets(ctx);
    if (!environments.length) return "deferred";
    await ctx.cma.post(`/content_types/${e.ct}/entries/${target(ctx, e.uid, "entry")}/publish`, { entry: { environments, locales } });
    return "updated";
  },
};

export const CONTENT_OUTCOMES = {
  folders: () => "created",
  assets: () => "created",
  "entries:base": (ctx, step) => (parseEntryKey(step.key).locale === ctx.master ? "created" : "updated"),
  "entries:full": () => "updated",
  "publish:assets": (ctx) => (publishEnvironments(ctx).length ? "updated" : "skipped"),
  "publish:entries": (ctx, step) =>
    entryPublishLocales(ctx, snapshotEntry(ctx, step.key)) && publishEnvironments(ctx).length ? "updated" : "skipped",
};
