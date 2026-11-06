// Pure helpers for the stack snapshot (seed/contentstack/). No network, no disk.

const SYSTEM_KEY = /^(created_|updated_)/;
const SYSTEM_KEYS = new Set(["_version", "ACL", "_in_progress", "publish_details", "_metadata"]);

// The CMA returns file fields as full asset objects (CDN url with the source stack's api key,
// user uids, timestamps). Reduce them to {uid, filename, title}: the import maps the uid to the
// re-uploaded asset, and nothing source-specific leaks into the snapshot.
export function slimAssetRefs(value) {
  if (Array.isArray(value)) return value.map(slimAssetRefs);
  if (value && typeof value === "object") {
    if (typeof value.uid === "string" && typeof value.url === "string" && typeof value.filename === "string" && typeof value.content_type === "string") {
      const ref = { uid: value.uid, filename: value.filename };
      if (value.title) ref.title = value.title;
      return ref;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, slimAssetRefs(v)]));
  }
  return value;
}

// Removes system fields; keeps uid, title, locale and the field values. Embedded asset objects become refs.
export function stripEntry(entry) {
  const out = {};
  for (const [k, v] of Object.entries(entry ?? {})) {
    if (SYSTEM_KEY.test(k) || SYSTEM_KEYS.has(k)) continue;
    out[k] = slimAssetRefs(v);
  }
  return out;
}

// Calls visit(field) for every field in a schema, descending into groups and modular blocks.
export function walkSchema(schema, visit) {
  for (const field of schema ?? []) {
    visit(field);
    if (Array.isArray(field.schema)) walkSchema(field.schema, visit);
    if (Array.isArray(field.blocks)) for (const b of field.blocks) walkSchema(b.schema, visit);
  }
}

export function globalFieldRefs(schema) {
  const refs = new Set();
  walkSchema(schema, (f) => {
    if (f.data_type === "global_field" && f.reference_to) refs.add(f.reference_to);
  });
  return [...refs];
}

export function extensionRefs(schema) {
  const refs = new Set();
  walkSchema(schema, (f) => {
    if (f.extension_uid) refs.add(f.extension_uid);
  });
  return [...refs];
}

// Topological order of content types by non-reference dependencies (global fields).
// Reference fields add no edge, so page <-> hero_banner cycles are tolerated; Task 7
// fills references in a second pass. Ties keep the input order; if a genuine cycle
// remains (global fields referencing each other), the leftovers are appended in input order.
export function dependencyOrder(contentTypes, globalFields = []) {
  const nodes = new Map();
  for (const gf of globalFields) nodes.set(`gf:${gf.uid}`, { ct: false, deps: globalFieldRefs(gf.schema).map((u) => `gf:${u}`) });
  for (const ct of contentTypes) nodes.set(`ct:${ct.uid}`, { ct: true, uid: ct.uid, deps: globalFieldRefs(ct.schema).map((u) => `gf:${u}`) });

  const done = new Set();
  const order = [];
  const visiting = new Set();
  const visit = (key) => {
    if (done.has(key) || visiting.has(key)) return;
    const node = nodes.get(key);
    if (!node) return;
    visiting.add(key);
    for (const d of node.deps) visit(d);
    visiting.delete(key);
    done.add(key);
    if (node.ct) order.push(node.uid);
  };
  for (const ct of contentTypes) visit(`ct:${ct.uid}`);
  return order;
}

// Environment names an entry is published to, for one locale.
export function publishEnvironments(entry, envNameByUid, locale) {
  const details = entry?.publish_details;
  const list = Array.isArray(details) ? details : details ? [details] : [];
  const names = list
    .filter((d) => !d.locale || d.locale === locale)
    .map((d) => envNameByUid.get(d.environment) ?? null)
    .filter(Boolean);
  return [...new Set(names)];
}

// Maps variant uids to {experience, variant} names from the variant_groups listing.
// Where the API doesn't expose a name, the value is null.
export function variantNameMap(groups) {
  const map = new Map();
  for (const g of groups ?? []) {
    const variants = g.variants ?? g.variant_uids ?? [];
    for (const v of variants) {
      const uid = typeof v === "string" ? v : v.uid;
      if (uid) map.set(uid, { experience: g.name ?? null, variant: typeof v === "string" ? null : v.name ?? null });
    }
  }
  return map;
}

// An entry-variant record from the CMA, reduced to the snapshot shape. Returns null when
// the change set is empty (inherits everything from the base entry).
export function toVariantRecord(raw, names = new Map()) {
  const meta = raw?._variant ?? {};
  const change_set = meta._change_set ?? [];
  if (!change_set.length) return null;
  const known = names.get(meta._uid) ?? {};
  const fields = {};
  for (const k of change_set) if (k in raw) fields[k] = slimAssetRefs(raw[k]);
  return {
    experience: known.experience ?? meta._experience_name ?? null,
    variant: known.variant ?? meta._name ?? null,
    variant_uid: meta._uid ?? null,
    fields,
    change_set,
  };
}
