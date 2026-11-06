// Pure planning for the Contentstack import (seed/contentstack/ -> an empty stack).
// No network. loadSnapshot is the only function that touches disk.
//
// Why two passes: content types and global fields reference each other in cycles
// (page.hero -> hero_banner, hero_banner.page -> page; trip_planner.bikes.link_page -> page),
// so schemas are created without reference fields first, then updated with them. Entries
// follow the same pattern: created with references emptied, then updated once every
// entry has a target UID.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { KitError } from "./env.mjs";
import { globalFieldRefs, walkSchema } from "./snapshot.mjs";

/**
 * @typedef {{code: string, name?: string, fallback_locale: string|null}} SnapshotLocale
 * @typedef {{name: string}} SnapshotEnvironment
 * @typedef {{uid: string, title: string}} SnapshotExtension
 * @typedef {{taxonomy: {uid: string, name: string, description?: string}, terms: {uid: string, name: string, parent_uid: string|null, order: number|null}[]}} SnapshotTaxonomy
 * @typedef {{uid: string, title: string, schema: object[]}} SnapshotGlobalField
 * @typedef {{uid: string, title: string, options?: object, schema: object[]}} SnapshotContentType
 * @typedef {{uid: string, name: string, parent_uid: string|null}} SnapshotFolder
 * @typedef {{uid: string, filename: string, title?: string, description?: string, content_type: string, parent_uid: string|null, file: string}} SnapshotAsset
 * @typedef {{ct: string, uid: string, locale: string, entry: object, publish_environments: string[]}} SnapshotEntry
 * @typedef {{ct: string, uid: string, locale: string, variants: {experience: string|null, variant: string|null, fields: object, change_set: string[]}[]}} SnapshotVariants
 * @typedef {{content_types: string[], entries: {ct: string, uid: string}[]}} SnapshotOrder
 *
 * @typedef {object} Snapshot
 * @property {SnapshotLocale[]} locales
 * @property {SnapshotEnvironment[]} environments
 * @property {SnapshotExtension[]} extensions        source field extensions, remapped by title
 * @property {SnapshotTaxonomy[]} taxonomies
 * @property {SnapshotGlobalField[]} globalFields    unwrapped from {global_field}
 * @property {SnapshotContentType[]} contentTypes    unwrapped from {content_type}, in order.content_types order
 * @property {SnapshotFolder[]} folders              as exported; NOT guaranteed parents-first (importOrder sorts)
 * @property {SnapshotAsset[]} assets                assets/manifest.json; `file` is relative to the snapshot dir
 * @property {SnapshotEntry[]} entries               order.entries order, master locale before localized versions
 * @property {SnapshotVariants[]} variants
 * @property {SnapshotOrder} order
 * @property {string} dir                            absolute snapshot directory (to resolve asset files)
 *
 * @typedef {"locales"|"environments"|"taxonomies"|"globalFields:base"|"contentTypes:base"|"globalFields:full"|"contentTypes:full"|"folders"|"assets"|"entries:base"|"entries:full"|"publish:assets"|"publish:entries"} Phase
 * @typedef {"locale"|"environment"|"taxonomy"|"globalField"|"contentType"|"folder"|"asset"|"entry"} StepKind
 * @typedef {{phase: Phase, kind: StepKind, key: string}} Step
 *   key: locale code · environment name · taxonomy/global field/content type/folder/asset uid ·
 *   entry "<ct>/<uid>.<locale>" (the entries/ file name; see entryKey/parseEntryKey)
 *
 * @typedef {Record<string, string>} UidMap                       source entry uid -> target entry uid
 * @typedef {Record<string, {uid: string, url: string}>} AssetMap  source asset uid -> target asset
 */

const clone = (v) => structuredClone(v);

// ---------------------------------------------------------------- schemas

// Base schema: every `reference` field removed at any depth (top level, group schemas,
// modular-block schemas, inline global_field schemas). Global-field fields and global-field
// blocks are kept. Containers left with no fields are dropped (the CMA rejects empty groups).
// RTE fields keep only sys_assets in reference_to, because embedded content types may not exist yet.
export function splitReferences(schema) {
  return { base: stripRefs(clone(schema ?? [])), full: clone(schema ?? []) };
}

function stripRefs(fields) {
  const out = [];
  for (const f of fields) {
    if (f.data_type === "reference") continue;
    if (Array.isArray(f.blocks)) {
      f.blocks = f.blocks.filter((b) => {
        if (!Array.isArray(b.schema)) return true; // global-field block (reference_to)
        b.schema = stripRefs(b.schema);
        return b.schema.length > 0;
      });
      if (!f.blocks.length) continue;
    } else if (Array.isArray(f.schema)) {
      f.schema = stripRefs(f.schema);
      if (!f.schema.length) continue;
    }
    if (f.data_type !== "global_field" && Array.isArray(f.reference_to)) {
      const assetsOnly = f.reference_to.filter((r) => r === "sys_assets");
      if (assetsOnly.length !== f.reference_to.length) {
        f.reference_to = assetsOnly;
        if (f.field_metadata && "embed_entry" in f.field_metadata) f.field_metadata.embed_entry = false;
      }
    }
    out.push(f);
  }
  return out;
}

// Rewrites extension_uid (source stack) to the target stack's extension with the same title.
// Collects every missing title before throwing, so the SE sees the whole list at once.
export function remapExtensions(schema, titleToUid, uidToTitle) {
  const out = clone(schema ?? []);
  const missing = [];
  const unknown = [];
  walkSchema(out, (f) => {
    if (!f.extension_uid) return;
    const title = uidToTitle?.[f.extension_uid];
    if (!title) {
      if (!unknown.includes(f.extension_uid)) unknown.push(f.extension_uid);
      return;
    }
    const target = titleToUid?.[title];
    if (!target) {
      if (!missing.includes(title)) missing.push(title);
      return;
    }
    f.extension_uid = target;
  });
  if (unknown.length) {
    throw new KitError(`Schema uses extension(s) not listed in extensions.json: ${unknown.join(", ")}`, {
      code: 1,
      hint: "The snapshot is inconsistent; re-run the export.",
      details: { unknown },
    });
  }
  if (missing.length) {
    throw new KitError(`Missing field extension(s) in the target stack: ${missing.join(", ")}`, {
      code: 2,
      hint: "Install the RP Commerce app in the target stack, then re-run.",
      details: { missing },
    });
  }
  return out;
}

// ---------------------------------------------------------------- entries

function gfIndex(globalFields) {
  if (!globalFields) return {};
  if (Array.isArray(globalFields)) return Object.fromEntries(globalFields.map((g) => [g.uid, g.schema]));
  return Object.fromEntries(Object.entries(globalFields).map(([k, v]) => [k, Array.isArray(v) ? v : v?.schema]));
}

const isRte = (f) => f.data_type === "json" && f.field_metadata?.allow_json_rte === true;
const isEmpty = (v) => v === undefined || v === null;
const join = (base, key) => (base ? `${base}.${key}` : key);

// Walks an entry against its schema and returns a new entry. Handlers map the values of
// reference, file and JSON RTE fields; everything else (text, taxonomy, extension JSON,
// unknown keys) passes through unchanged. Global fields (fields and blocks) are resolved
// from `gfs`; an unresolved global field with a value throws rather than pass through
// untouched references.
function mapEntry(entry, schema, gfs, h) {
  const mapFields = (obj, fields, base) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const out = { ...obj };
    for (const f of fields ?? []) {
      if (!(f.uid in out)) continue;
      out[f.uid] = mapField(out[f.uid], f, join(base, f.uid));
    }
    return out;
  };

  const gfSchema = (f, gfUid, p) => {
    const s = Array.isArray(f.schema) ? f.schema : gfs[gfUid];
    if (!s) throw new KitError(`No schema for global field "${gfUid}" at ${p}`, { code: 1, hint: "Pass globalFields (snapshot.globalFields)." });
    return s;
  };

  const each = (value, f, p, fn) =>
    f.multiple && Array.isArray(value) ? value.map((v, i) => fn(v, `${p}[${i}]`)) : fn(value, p);

  const mapField = (value, f, p) => {
    switch (f.data_type) {
      case "reference":
        return h.reference(value, p);
      case "file":
        return h.file(value, p);
      case "group":
        return each(value, f, p, (v, vp) => mapFields(v, f.schema, vp));
      case "global_field":
        if (isEmpty(value)) return value;
        return each(value, f, p, (v, vp) => mapFields(v, gfSchema(f, f.reference_to, vp), vp));
      case "blocks":
        if (!Array.isArray(value)) return value;
        return value.map((item, i) => {
          if (!item || typeof item !== "object") return item;
          const out = { ...item };
          for (const b of f.blocks ?? []) {
            if (!(b.uid in out)) continue;
            const bp = `${p}[${i}].${b.uid}`;
            const s = Array.isArray(b.schema) ? b.schema : b.reference_to ? gfSchema(b, b.reference_to, bp) : [];
            out[b.uid] = mapFields(out[b.uid], s, bp);
          }
          return out;
        });
      case "json":
        return isRte(f) ? each(value, f, p, (v, vp) => h.rte(v, vp)) : value;
      default:
        return value;
    }
  };

  return mapFields(entry, schema, "");
}

// Visits JSON RTE nodes depth-first; fn(node, path) returns the node to keep, or null to drop it.
function mapRte(doc, p, fn) {
  const visit = (node, np) => {
    if (!node || typeof node !== "object") return node;
    const kept = fn(node, np);
    if (!kept || !Array.isArray(kept.children)) return kept;
    let children = kept.children.map((c, i) => visit(c, `${np}.children[${i}]`)).filter((c) => c !== null);
    if (!children.length && kept.children.length) children = [{ text: "" }]; // Slate elements need at least one child
    return { ...kept, children };
  };
  return visit(doc, p);
}

const refList = (value) => (isEmpty(value) ? [] : Array.isArray(value) ? value : [value]);
const isEntryEmbed = (n) => n.type === "reference" && n.attrs?.["entry-uid"];
const isAssetEmbed = (n) => n.type === "reference" && n.attrs?.["asset-uid"];

/**
 * Every entry this entry references: reference fields at any depth and JSON RTE entry embeds.
 * @param {object} entry
 * @param {object[]} schema  content type (or global field) schema
 * @param {{globalFields?: SnapshotGlobalField[]|Record<string, object[]>}} [opts]
 * @returns {{path: string, ct: string, uid: string}[]}
 */
export function entryRefs(entry, schema, { globalFields } = {}) {
  const refs = [];
  mapEntry(entry, schema, gfIndex(globalFields), {
    reference(value, p) {
      refList(value).forEach((r, i) => {
        if (r?.uid) refs.push({ path: `${p}[${i}]`, ct: r._content_type_uid, uid: r.uid });
      });
      return value;
    },
    file: (v) => v,
    rte(doc, p) {
      mapRte(doc, p, (n, np) => {
        if (isEntryEmbed(n)) refs.push({ path: np, ct: n.attrs["content-type-uid"], uid: n.attrs["entry-uid"] });
        return n;
      });
      return doc;
    },
  });
  return refs;
}

/**
 * Rewrites an entry for the target stack. Reference uids go through uidMap; file fields become
 * target asset uid strings (arrays for multiple fields; the CMA rejects objects on write);
 * JSON RTE asset embeds get the target asset-uid and asset-link; RTE entry embeds get the target
 * entry-uid. Taxonomy values and extension JSON are unchanged. The source `uid` is dropped.
 * With withReferences:false, reference fields become [] and RTE entry embeds are removed
 * (asset embeds stay; assets are imported before entries).
 * A source uid missing from uidMap or assetMap is a caller bug: KitError code 1 naming path and uid.
 * @param {object} entry
 * @param {object[]} schema
 * @param {UidMap} uidMap
 * @param {AssetMap} assetMap
 * @param {{withReferences: boolean, globalFields?: SnapshotGlobalField[]|Record<string, object[]>}} opts
 */
export function rewriteEntry(entry, schema, uidMap, assetMap, { withReferences, globalFields } = {}) {
  if (typeof withReferences !== "boolean") throw new KitError("rewriteEntry: withReferences must be true or false", { code: 1 });
  const targetEntry = (uid, p) => {
    const t = uidMap?.[uid];
    if (!t) throw new KitError(`No target entry for reference ${uid} at ${p}`, { code: 1, details: { path: p, uid } });
    return t;
  };
  const targetAsset = (uid, p) => {
    const t = assetMap?.[uid];
    const tuid = typeof t === "string" ? t : t?.uid;
    if (!tuid) throw new KitError(`No target asset for ${uid} at ${p}`, { code: 1, details: { path: p, uid } });
    return { uid: tuid, url: typeof t === "string" ? undefined : t.url };
  };
  const fileUid = (v, p) => {
    if (isEmpty(v)) return null;
    const uid = typeof v === "string" ? v : v?.uid;
    return uid ? targetAsset(uid, p).uid : null;
  };

  const { uid: _sourceUid, ...rest } = clone(entry ?? {});
  return mapEntry(rest, schema, gfIndex(globalFields), {
    reference(value, p) {
      if (isEmpty(value)) return value;
      if (!withReferences) return [];
      return refList(value).map((r, i) => (r?.uid ? { ...r, uid: targetEntry(r.uid, `${p}[${i}]`) } : r));
    },
    file(value, p) {
      if (Array.isArray(value)) return value.map((v, i) => fileUid(v, `${p}[${i}]`)).filter(Boolean);
      return fileUid(value, p);
    },
    rte(doc, p) {
      if (isEmpty(doc)) return doc;
      return mapRte(doc, p, (n, np) => {
        if (isEntryEmbed(n)) {
          if (!withReferences) return null;
          return { ...n, attrs: { ...n.attrs, "entry-uid": targetEntry(n.attrs["entry-uid"], np) } };
        }
        if (isAssetEmbed(n)) {
          const t = targetAsset(n.attrs["asset-uid"], np);
          const attrs = { ...n.attrs, "asset-uid": t.uid };
          if ("asset-link" in attrs && t.url) attrs["asset-link"] = t.url;
          return { ...n, attrs };
        }
        return n;
      });
    },
  });
}

/**
 * References (fields and RTE entry embeds) to entries that are not in the snapshot, e.g. entries
 * deleted in the source stack whose UIDs the CMA still returns. rewriteEntry throws on these;
 * the importer reports them and removes them explicitly with pruneRefs.
 * @param {Snapshot} snapshot
 * @returns {{entry: string, path: string, ct: string, uid: string}[]}
 */
export function danglingRefs(snapshot) {
  const known = new Set((snapshot.entries ?? []).map((e) => e.uid));
  const schemas = Object.fromEntries((snapshot.contentTypes ?? []).map((c) => [c.uid, c.schema]));
  const out = [];
  for (const e of snapshot.entries ?? []) {
    for (const r of entryRefs(e.entry, schemas[e.ct], { globalFields: snapshot.globalFields })) {
      if (!known.has(r.uid)) out.push({ entry: entryKey(e), ...r });
    }
  }
  return out;
}

/**
 * Removes references to the given source entry uids (reference-field items and RTE entry embeds).
 * Everything else is unchanged; the input is not mutated.
 * @param {object} entry
 * @param {object[]} schema
 * @param {Set<string>|string[]} uids
 * @param {{globalFields?: SnapshotGlobalField[]|Record<string, object[]>}} [opts]
 */
export function pruneRefs(entry, schema, uids, { globalFields } = {}) {
  const drop = uids instanceof Set ? uids : new Set(uids ?? []);
  return mapEntry(clone(entry ?? {}), schema, gfIndex(globalFields), {
    reference: (value) => (isEmpty(value) ? value : refList(value).filter((r) => !drop.has(r?.uid))),
    file: (v) => v,
    rte: (doc, p) => (isEmpty(doc) ? doc : mapRte(doc, p, (n) => (isEntryEmbed(n) && drop.has(n.attrs["entry-uid"]) ? null : n))),
  });
}

// ---------------------------------------------------------------- order

export const entryKey = (e) => `${e.ct}/${e.uid}.${e.locale}`;
export function parseEntryKey(key) {
  const m = /^([^/]+)\/([^.]+)\.(.+)$/.exec(key);
  if (!m) throw new KitError(`Bad entry key "${key}"`, { code: 1 });
  return { ct: m[1], uid: m[2], locale: m[3] };
}

// Stable topological sort: each item after its dependencies (deps outside the set are ignored;
// cycles fall back to input order).
function topo(items, idOf, depsOf) {
  const byId = new Map(items.map((it) => [idOf(it), it]));
  const done = new Set();
  const visiting = new Set();
  const out = [];
  const visit = (it) => {
    const id = idOf(it);
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const d of depsOf(it)) if (byId.has(d)) visit(byId.get(d));
    visiting.delete(id);
    done.add(id);
    out.push(it);
  };
  items.forEach(visit);
  return out;
}

/**
 * The full import as an ordered list of steps.
 * @param {Snapshot} snapshot
 * @returns {Step[]}
 */
export function importOrder(snapshot) {
  const steps = [];
  const add = (phase, kind, keys) => keys.forEach((key) => steps.push({ phase, kind, key }));

  const locales = topo(snapshot.locales ?? [], (l) => l.code, (l) => (l.fallback_locale ? [l.fallback_locale] : []));
  const gfs = topo(snapshot.globalFields ?? [], (g) => g.uid, (g) => globalFieldRefs(g.schema));
  const ctUids = (snapshot.contentTypes ?? []).map((c) => c.uid);
  const ctOrder = [...(snapshot.order?.content_types ?? []).filter((u) => ctUids.includes(u)), ...ctUids.filter((u) => !(snapshot.order?.content_types ?? []).includes(u))];
  const folders = topo(snapshot.folders ?? [], (f) => f.uid, (f) => (f.parent_uid ? [f.parent_uid] : []));
  const master = locales.find((l) => !l.fallback_locale)?.code;
  const entries = [...(snapshot.entries ?? [])].sort((a, b) => (a.locale === master ? 0 : 1) - (b.locale === master ? 0 : 1));
  const assets = (snapshot.assets ?? []).map((a) => a.uid);

  add("locales", "locale", locales.map((l) => l.code));
  add("environments", "environment", (snapshot.environments ?? []).map((e) => e.name));
  add("taxonomies", "taxonomy", (snapshot.taxonomies ?? []).map((t) => t.taxonomy.uid));
  add("globalFields:base", "globalField", gfs.map((g) => g.uid));
  add("contentTypes:base", "contentType", ctOrder);
  add("globalFields:full", "globalField", gfs.map((g) => g.uid));
  add("contentTypes:full", "contentType", ctOrder);
  add("folders", "folder", folders.map((f) => f.uid));
  add("assets", "asset", assets);
  add("entries:base", "entry", entries.map(entryKey));
  add("entries:full", "entry", entries.map(entryKey));
  add("publish:assets", "asset", assets);
  add("publish:entries", "entry", entries.filter((e) => e.publish_environments?.length).map(entryKey));
  return steps;
}

// ---------------------------------------------------------------- disk

/**
 * Reads seed/contentstack/ into a Snapshot. Missing optional directories (taxonomies/, variants/)
 * read as empty; a missing required file throws KitError code 2.
 * @param {string} [dir]
 * @returns {Snapshot}
 */
export function loadSnapshot(dir = "seed/contentstack") {
  const root = path.resolve(dir);
  if (!existsSync(root)) {
    throw new KitError(`Snapshot directory not found: ${root}`, { code: 2, hint: "Run from the kit repo root, or pass the snapshot directory." });
  }
  const readJson = (rel) => {
    const file = path.join(root, rel);
    if (!existsSync(file)) throw new KitError(`Snapshot file missing: ${file}`, { code: 2 });
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      throw new KitError(`Snapshot file is not valid JSON: ${file} (${e.message})`, { code: 1 });
    }
  };
  const jsonFiles = (rel) => {
    const d = path.join(root, rel);
    return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort() : [];
  };
  const subdirs = (rel) => {
    const d = path.join(root, rel);
    return existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort() : [];
  };
  const splitName = (f) => {
    const m = /^(.+)\.([^.]+)\.json$/.exec(f);
    return m ? { uid: m[1], locale: m[2] } : null;
  };

  const locales = readJson("locales.json");
  const order = readJson("order.json");
  const master = locales.find((l) => !l.fallback_locale)?.code;

  const contentTypes = jsonFiles("content_types").map((f) => readJson(`content_types/${f}`).content_type);
  const rank = new Map((order.content_types ?? []).map((u, i) => [u, i]));
  contentTypes.sort((a, b) => (rank.get(a.uid) ?? Infinity) - (rank.get(b.uid) ?? Infinity));

  const entries = [];
  for (const ct of subdirs("entries")) {
    for (const f of jsonFiles(`entries/${ct}`)) {
      const n = splitName(f);
      if (!n) continue;
      const { entry, publish_environments = [] } = readJson(`entries/${ct}/${f}`);
      entries.push({ ct, uid: n.uid, locale: n.locale, entry, publish_environments });
    }
  }
  const entryRank = new Map((order.entries ?? []).map((e, i) => [`${e.ct}/${e.uid}`, i]));
  entries.sort(
    (a, b) =>
      (a.locale === master ? 0 : 1) - (b.locale === master ? 0 : 1) ||
      (entryRank.get(`${a.ct}/${a.uid}`) ?? Infinity) - (entryRank.get(`${b.ct}/${b.uid}`) ?? Infinity) ||
      a.locale.localeCompare(b.locale),
  );

  const variants = [];
  for (const ct of subdirs("variants")) {
    for (const f of jsonFiles(`variants/${ct}`)) {
      const n = splitName(f);
      if (n) variants.push({ ct, uid: n.uid, locale: n.locale, variants: readJson(`variants/${ct}/${f}`) });
    }
  }

  return {
    dir: root,
    locales,
    environments: readJson("environments.json"),
    extensions: readJson("extensions.json"),
    taxonomies: jsonFiles("taxonomies").map((f) => readJson(`taxonomies/${f}`)),
    globalFields: jsonFiles("global_fields").map((f) => readJson(`global_fields/${f}`).global_field),
    contentTypes,
    folders: readJson("folders.json"),
    assets: readJson("assets/manifest.json"),
    entries,
    variants,
    order,
  };
}
