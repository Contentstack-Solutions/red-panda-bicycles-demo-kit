// Test helper (not a test file): an in-memory Contentstack stack behind the cma.mjs interface.
// Used by importRun.test.mjs and import-contentstack.test.mjs.
import { KitError } from "./env.mjs";

export const ALL_EXTENSIONS = [
  { uid: "tgt_products", title: "RP Commerce Products" },
  { uid: "tgt_category", title: "RP Commerce Category" },
  { uid: "tgt_other", title: "Something else" },
];

// An in-memory stack: path -> object, plus a request log. Entries are stored per locale at
// "/content_types/<ct>/entries/<uid>@<locale>". POSTing a fixed-uid object that exists fails
// like the CMA does, so a duplicate create shows up as an error, not silently.
export function fakeCma({ extensions = ALL_EXTENSIONS, masterLocale = "en", store = new Map(), hook } = {}) {
  const log = [];
  let seq = store.size;
  const newUid = (prefix) => `${prefix}${String(++seq).padStart(4, "0")}`;
  const notFound = () => null;
  const fail = (status, msg) => new KitError(`${msg}: ${status}`, { code: 1, details: { status } });
  const one = (key, p) => (store.has(p) ? { [key]: store.get(p) } : notFound());
  const createFixed = (p, value) => {
    if (store.has(p)) throw fail(422, `exists ${p}`);
    store.set(p, value);
  };

  function route(method, rawPath, query, body) {
    const u = new URL(rawPath, "http://cma");
    const p = u.pathname;
    const q = { ...Object.fromEntries(u.searchParams), ...(query ?? {}) };
    const seg = p.split("/").filter(Boolean);
    if (method === "GET") {
      if (p === "/locales") {
        const rest = [...store.entries()].filter(([k]) => k.startsWith("/locales/")).map(([, v]) => v);
        return { locales: [{ code: masterLocale, fallback_locale: null }, ...rest] };
      }
      if (p === "/extensions") return { extensions };
      if (seg[0] === "content_types" && seg[2] === "entries" && seg.length === 3) {
        const query = JSON.parse(q.query ?? "{}");
        const entries = [...store.entries()]
          .filter(([k, v]) => k.startsWith(`/content_types/${seg[1]}/entries/`) && k.endsWith(`@${q.locale ?? "en"}`) && Object.entries(query).every(([f, x]) => v[f] === x))
          .map(([, v]) => v);
        return { entries };
      }
      if (p === "/assets") {
        const query = JSON.parse(q.query ?? "{}");
        const assets = [...store.entries()].filter(([k, v]) => /^\/assets\/[^/]+$/.test(k) && Object.entries(query).every(([f, x]) => v[f] === x)).map(([, v]) => v);
        return { assets };
      }
      const keys = { environments: "environment", taxonomies: "taxonomy", global_fields: "global_field", content_types: "content_type" };
      if (seg.length === 2 && keys[seg[0]]) return one(keys[seg[0]], p);
      if (seg[0] === "taxonomies" && seg[2] === "terms" && seg.length === 4) return one("term", p);
      throw new Error(`fake: unhandled GET ${p}`);
    }
    if (method === "POST") {
      if (p.endsWith("/publish")) return { notice: "queued" };
      if (p === "/locales") return createFixed(`/locales/${body.locale.code}`, { ...body.locale }), { locale: body.locale };
      if (p === "/environments") return createFixed(`/environments/${body.environment.name}`, { ...body.environment }), { environment: body.environment };
      if (p === "/taxonomies") return createFixed(`/taxonomies/${body.taxonomy.uid}`, { ...body.taxonomy }), { taxonomy: body.taxonomy };
      if (seg[0] === "taxonomies" && seg[2] === "terms") {
        if (!store.has(`/taxonomies/${seg[1]}`)) throw fail(422, "no taxonomy");
        return createFixed(`${p}/${body.term.uid}`, { ...body.term }), { term: body.term };
      }
      if (p === "/global_fields") return createFixed(`/global_fields/${body.global_field.uid}`, structuredClone(body.global_field)), { global_field: body.global_field };
      if (p === "/content_types") return createFixed(`/content_types/${body.content_type.uid}`, structuredClone(body.content_type)), { content_type: body.content_type };
      if (p === "/assets/folders") {
        const uid = newUid("tf");
        store.set(`/assets/${uid}`, { uid, is_dir: true, ...body.asset });
        return { asset: { uid, ...body.asset } };
      }
      if (p === "/assets") {
        const uid = newUid("ta");
        const file = body.get("asset[upload]");
        const asset = { uid, filename: file.name, title: body.get("asset[title]"), parent_uid: body.get("asset[parent_uid]") ?? null, url: `https://img.example/${uid}/${file.name}` };
        store.set(`/assets/${uid}`, asset);
        return { asset };
      }
      if (seg[0] === "content_types" && seg[2] === "entries" && seg.length === 3) {
        if (!store.has(`/content_types/${seg[1]}`)) throw fail(422, "no content type");
        const uid = newUid("te");
        store.set(`${p}/${uid}@${q.locale ?? "en"}`, { ...structuredClone(body.entry), uid });
        return { entry: { ...body.entry, uid } };
      }
      throw new Error(`fake: unhandled POST ${p}`);
    }
    if (method === "PUT") {
      if (seg[0] === "content_types" && seg[2] === "entries" && seg.length === 4) {
        if (!store.has(`/content_types/${seg[1]}/entries/${seg[3]}@en`)) throw fail(422, "no entry");
        store.set(`${p}@${q.locale ?? "en"}`, { ...structuredClone(body.entry), uid: seg[3] });
        return { entry: body.entry };
      }
      const keys = { global_fields: "global_field", content_types: "content_type" };
      if (seg.length === 2 && keys[seg[0]]) {
        if (!store.has(p)) throw fail(422, `missing ${p}`);
        store.set(p, structuredClone(body[keys[seg[0]]]));
        return body;
      }
      throw new Error(`fake: unhandled PUT ${p}`);
    }
    throw new Error(`fake: unhandled ${method} ${p}`);
  }

  async function handle(method, path, { query, body } = {}) {
    const entry = { method, path: path.split("?")[0], query: { ...Object.fromEntries(new URL(path, "http://cma").searchParams), ...(query ?? {}) }, body };
    log.push(entry);
    if (hook) {
      const r = hook(entry, { log, store, route: () => route(method, path, query, body) });
      if (r !== undefined) return r;
    }
    return route(method, path, query, body);
  }

  return {
    store,
    log,
    writes: () => log.filter((r) => r.method !== "GET"),
    cma: {
      get: (path, query) => handle("GET", path, { query }),
      post: (path, body) => handle("POST", path, { body }),
      put: (path, body) => handle("PUT", path, { body }),
      del: (path) => handle("DELETE", path),
      upload: (path, form) => handle("POST", path, { body: form }),
    },
  };
}
