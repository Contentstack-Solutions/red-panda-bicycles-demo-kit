// Ruling R24: before teardown deletes any container (a content type or an asset folder), it
// checks that nothing in it was made by someone else. GETs only, so the dry run uses it too.
const PAGE = 100;

// Every item of a paged CMA list. A missing container (GET → null) has no items.
async function listAll(cma, path, query, key) {
  const out = [];
  for (let skip = 0; ; skip += PAGE) {
    const body = await cma.get(path, { ...query, include_count: "true", limit: String(PAGE), skip: String(skip) });
    const items = body?.[key] ?? [];
    out.push(...items);
    const count = typeof body?.count === "number" ? body.count : out.length;
    if (!items.length || out.length >= count) return out;
  }
}

/**
 * Content in the kit's content types and folders that the kit didn't create.
 * @returns {Promise<{container: string, count: number, sample: string[]}[]>}
 */
export async function findForeignContents(state, cma) {
  const created = state.created ?? {};
  const kitEntries = new Set((created.entries ?? []).map((e) => e.uid));
  const kitAssets = new Set([...(created.assets ?? []), ...(created.folders ?? [])]);
  const out = [];
  const contentTypes = created.contentTypes ?? [];
  if (contentTypes.length) {
    const codes = ((await cma.get("/locales"))?.locales ?? []).map((l) => l.code);
    const locales = codes.length ? codes : ["en"];
    for (const ct of contentTypes) {
      const foreign = new Set();
      for (const locale of locales) {
        for (const e of await listAll(cma, `/content_types/${ct}/entries`, { locale }, "entries")) {
          if (e?.uid && !kitEntries.has(e.uid)) foreign.add(e.uid);
        }
      }
      if (foreign.size) out.push({ container: `content type ${ct}`, count: foreign.size, sample: [...foreign].slice(0, 5) });
    }
  }
  for (const folder of created.folders ?? []) {
    const items = await listAll(cma, "/assets", { include_folders: "true", query: JSON.stringify({ parent_uid: folder }) }, "assets");
    const foreign = items.filter((a) => a?.uid && !kitAssets.has(a.uid)).map((a) => a.uid);
    if (foreign.length) out.push({ container: `folder ${folder}`, count: foreign.length, sample: foreign.slice(0, 5) });
  }
  return out;
}

export const describeForeign = (foreign) => foreign.map((f) => `  - ${f.container}: ${f.count} item(s) (${f.sample.join(", ")}${f.count > f.sample.length ? ", …" : ""})`).join("\n");

/** UIDs of the content types the stack still has. */
export async function remainingContentTypes(cma) {
  return (await listAll(cma, "/content_types", {}, "content_types")).map((c) => c.uid).filter(Boolean);
}
