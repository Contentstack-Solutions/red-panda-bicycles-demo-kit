// Walks a source stack through the CMA and writes the snapshot layout (see Task 5).
import { readdirSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { KitError } from "./env.mjs";
import {
  dependencyOrder, extensionRefs, publishEnvironments, stripEntry, toVariantRecord, variantNameMap,
} from "./snapshot.mjs";

const PAGE = 100;

async function paginate(cma, apiPath, key, query = {}, warn = () => {}) {
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const body = await cma.get(apiPath, { ...query, limit: PAGE, skip });
    if (body == null) warn(`GET ${apiPath} returned nothing (404/422); treating as empty`);
    const page = body?.[key] ?? [];
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/**
 * The export deletes its output folder before swapping the new snapshot in, so --out is only
 * accepted when it's a folder named `contentstack` under the repo's seed/, or a folder that doesn't
 * exist yet or is empty. Anything else is refused with exit 2 before anything is deleted.
 * @returns {string} the resolved folder
 */
export function assertSafeOutDir(outDir, { root = process.cwd() } = {}) {
  const resolved = path.resolve(root, outDir);
  const seed = path.resolve(root, "seed");
  const rel = path.relative(seed, resolved);
  const underSeed = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  if (underSeed && path.basename(resolved) === "contentstack") return resolved;
  let entries;
  try { entries = readdirSync(resolved); } catch (e) {
    if (e.code === "ENOENT") return resolved;
    throw new KitError(`--out ${outDir} isn't a folder the export can write to`, { code: 2, hint: "Pass seed/contentstack, or a new or empty folder." });
  }
  if (entries.length === 0) return resolved;
  throw new KitError(`Refusing to replace ${resolved}: --out must be seed/contentstack (or another seed/**/contentstack), or a new or empty folder, because the export deletes it first.`, {
    code: 2,
    hint: "Pass --out seed/contentstack, or a new or empty folder. Nothing was changed.",
  });
}

export async function exportStack({ cma, outDir: requestedDir, root, fetchImpl = fetch, log = () => {}, warn = (m) => console.warn(`warning: ${m}`) }) {
  const finalDir = assertSafeOutDir(requestedDir, { root });
  // Write to a sibling temp directory and swap it in only on success, so a failed run keeps the old snapshot.
  const outDir = `${finalDir}.tmp-${process.pid}`;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  try {
    const counts = await exportInto({ cma, outDir, fetchImpl, log, warn });
    await rm(finalDir, { recursive: true, force: true });
    await rename(outDir, finalDir);
    return counts;
  } catch (e) {
    await rm(outDir, { recursive: true, force: true });
    throw e;
  }
}

async function exportInto({ cma, outDir, fetchImpl, log, warn }) {
  const put = async (rel, data) => {
    const file = path.join(outDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof data === "string" || data instanceof Uint8Array ? data : JSON.stringify(data, null, 2) + "\n");
  };
  const counts = {};

  // Locales and environments
  const getList = async (p, key, q) => { const b = await cma.get(p, q); if (b == null) warn(`GET ${p} returned nothing (404/422); treating as empty`); return b?.[key] ?? []; };
  const locales = (await getList("/locales", "locales")).map((l) => ({
    code: l.code, name: l.name, fallback_locale: l.fallback_locale ?? null,
  }));
  await put("locales.json", locales);
  const environments = await getList("/environments", "environments");
  const envNameByUid = new Map(environments.map((e) => [e.uid, e.name]));
  await put("environments.json", environments.map((e) => ({ name: e.name })));
  counts.locales = locales.length;
  counts.environments = environments.length;

  // Schemas
  const globalFields = await paginate(cma, "/global_fields", "global_fields", {}, warn);
  for (const gf of globalFields) {
    await put(`global_fields/${gf.uid}.json`, { global_field: { uid: gf.uid, title: gf.title, schema: gf.schema } });
  }
  const contentTypes = await paginate(cma, "/content_types", "content_types", {}, warn);
  for (const ct of contentTypes) {
    await put(`content_types/${ct.uid}.json`, { content_type: { uid: ct.uid, title: ct.title, options: ct.options, schema: ct.schema } });
  }
  counts.global_fields = globalFields.length;
  counts.content_types = contentTypes.length;

  // Field extensions referenced by any schema
  const wanted = new Set();
  for (const s of [...contentTypes, ...globalFields]) for (const u of extensionRefs(s.schema)) wanted.add(u);
  const extList = await getList("/extensions", "extensions", { include_marketplace_extensions: true });
  const extByUid = new Map(extList.map((e) => [e.uid, e]));
  const missing = [...wanted].filter((u) => !extByUid.has(u));
  if (missing.length) {
    throw new KitError(`Schemas reference extensions the source stack does not list: ${missing.join(", ")}`, { code: 1, details: { missing } });
  }
  await put("extensions.json", [...wanted].map((u) => ({ uid: u, title: extByUid.get(u).title })));
  counts.extensions = wanted.size;

  // Taxonomies
  const taxonomies = (await paginate(cma, "/taxonomies", "taxonomies", {}, warn));
  counts.terms = 0;
  for (const t of taxonomies) {
    const terms = (await paginate(cma, `/taxonomies/${t.uid}/terms`, "terms", { depth: 0 }, warn)).map((x) => ({
      uid: x.uid, name: x.name, parent_uid: x.parent_uid ?? null, order: x.order ?? null,
    }));
    counts.terms += terms.length;
    await put(`taxonomies/${t.uid}.json`, { taxonomy: { uid: t.uid, name: t.name, description: t.description ?? "" }, terms });
  }
  counts.taxonomies = taxonomies.length;

  // Asset folders and assets
  const folderRows = await paginate(cma, "/assets", "assets", { include_folders: true, query: JSON.stringify({ is_dir: true }) }, warn);
  const folders = folderRows.filter((f) => f.is_dir === true).map((f) => ({ uid: f.uid, name: f.name, parent_uid: f.parent_uid ?? null }));
  await put("folders.json", folders);
  counts.folders = folders.length;

  const assets = await paginate(cma, "/assets", "assets", { include_count: true }, warn);
  const manifest = [];
  for (const a of assets) {
    const file = `assets/files/${a.uid}-${path.basename(a.filename)}`;
    const res = await fetchImpl(a.url);
    if (!res.ok) throw new KitError(`Downloading asset ${a.uid} (${a.filename}) failed: ${res.status}`, { code: 1 });
    await put(file, new Uint8Array(await res.arrayBuffer()));
    manifest.push({
      uid: a.uid, filename: a.filename, title: a.title ?? a.filename, description: a.description ?? "",
      content_type: a.content_type, parent_uid: a.parent_uid ?? null, file,
    });
  }
  await put("assets/manifest.json", manifest);
  counts.assets = manifest.length;

  // Entries (every locale; only entries actually authored in that locale) and variants
  const order = dependencyOrder(contentTypes, globalFields);
  const groups = await getList("/variant_groups", "variant_groups");
  const names = variantNameMap(groups);
  await mkdir(path.join(outDir, "variants"), { recursive: true });
  const orderedEntries = [];
  counts.entries = 0;
  counts.variants = 0;
  for (const ctUid of order) {
    const seen = new Set();
    for (const loc of locales) {
      const entries = (await paginate(cma, `/content_types/${ctUid}/entries`, "entries", { locale: loc.code, include_publish_details: true }, warn))
        .filter((e) => e.locale === loc.code);
      for (const e of entries) {
        await put(`entries/${ctUid}/${e.uid}.${loc.code}.json`, {
          entry: stripEntry(e),
          publish_environments: publishEnvironments(e, envNameByUid, loc.code),
        });
        counts.entries++;
        if (!seen.has(e.uid)) { seen.add(e.uid); orderedEntries.push({ ct: ctUid, uid: e.uid }); }

        const rawBody = await cma.get(`/content_types/${ctUid}/entries/${e.uid}/variants`, { locale: loc.code });
        if (rawBody == null) warn(`GET variants of ${ctUid}/${e.uid} (${loc.code}) returned nothing (404/422); treating as none`);
        const raw = rawBody ?? {};
        const records = (raw.entries ?? raw.variants ?? [])
          .filter((v) => !v.locale || v.locale === loc.code)
          .map((v) => toVariantRecord(v, names))
          .filter(Boolean);
        if (records.length) {
          await put(`variants/${ctUid}/${e.uid}.${loc.code}.json`, records);
          counts.variants += records.length;
        }
      }
    }
  }
  if (!counts.variants) await put("variants/.gitkeep", "");
  await put("order.json", { content_types: order, entries: orderedEntries });
  log(counts);
  return counts;
}
