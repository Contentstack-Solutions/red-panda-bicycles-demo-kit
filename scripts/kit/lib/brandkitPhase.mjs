// Brand Kit phase: fills the SE's Brand Kit with the Knowledge Vault (11 brand documents from
// seed/brandkit/ plus 4 items regenerated from the imported CMS content) and creates the two
// v2 voice profiles. Idempotent: items and profiles are matched by title/name and skipped.
// Progress is saved to state.brandkit after every write.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { KitError, apiBase } from "./env.mjs";

// Read when called (ruling R34): CONTENTSTACK_AI_HOST and CONTENTSTACK_BRANDKIT_API_HOST override the US hosts.
export const vaultBase = (env = process.env) => `${apiBase("ai", env)}/brand-kits/v1/knowledge-vault`;
export const profilesApi = (env = process.env) => `${apiBase("brandkit", env)}/v2`;
export const POLL_MS = 3_000;
export const POLL_TIMEOUT_MS = 60_000;

export const OAUTH_HINT =
  "Contentstack rejected the token for the Brand Kit APIs. Brand Kit may need an OAuth token instead of the session authtoken: " +
  "follow docs/manual-steps.md step 11 (OAuth fallback; store it as CONTENTSTACK_OAUTH_TOKEN, never in chat). Nothing was changed.";

/**
 * Brand Kit request headers (ruling R32). An OAuth token stored as CONTENTSTACK_OAUTH_TOKEN goes in
 * `Authorization: Bearer` and no authtoken is sent; otherwise the session authtoken from
 * `rp.mjs login` goes in `authtoken`. Returns null when neither is stored.
 * @param {{has: (k: string) => boolean, get: (k: string) => string}} creds  rp.mjs credentials
 * @returns {{headers: Record<string,string>, token: string, kind: "oauth"|"authtoken"} | null}
 */
export function brandkitAuth(creds, { organizationUid, brandKitUid }) {
  const ids = { organization_uid: organizationUid, brand_kit_uid: brandKitUid };
  if (creds.has("CONTENTSTACK_OAUTH_TOKEN")) {
    const token = creds.get("CONTENTSTACK_OAUTH_TOKEN");
    return { kind: "oauth", token, headers: { Authorization: `Bearer ${token}`, ...ids } };
  }
  if (creds.has("CONTENTSTACK_AUTHTOKEN")) {
    const token = creds.get("CONTENTSTACK_AUTHTOKEN");
    return { kind: "authtoken", token, headers: { authtoken: token, ...ids } };
  }
  return null;
}

// The three blog articles used as Knowledge Vault items, in order. "A Good Day Out Around Amsterdam"
// is the day-trip guide as it ships in the snapshot.
export const CMS_ARTICLE_TITLES = [
  "5 Things Nobody Tells You About Riding in Amsterdam",
  "A Rainy Tuesday on the Amstel",
  "A Good Day Out Around Amsterdam",
];
export const DESTINATIONS_TITLE = "Trip Planner destinations: places we ride to from Amsterdam";

// ------------------------------------------------------------------ parsing

function splitHeading(md, what) {
  const m = /^\s*#\s+(.+?)\s*\n([\s\S]*)$/.exec(String(md).replace(/\r\n/g, "\n"));
  if (!m) throw new KitError(`${what} doesn't start with a "# Title" heading.`);
  return { title: m[1].trim(), content: m[2].trim() };
}

/** @returns {{title: string, content: string}} title from the first "# " heading; content is the rest. */
export const parseVaultFile = (md) => splitHeading(md, "Knowledge Vault file");

/** "# Voice: The Long Ride" → name "The Long Ride". */
export function parseProfileFile(md) {
  const { title, content } = splitHeading(md, "Voice profile file");
  return { name: title.replace(/^Voice:\s*/i, "").trim(), content };
}

/** JSON RTE (or a plain string) → text: text nodes joined, blank line between block nodes. */
export function rteToText(node) {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  const blocks = [];
  const inline = (n) => (typeof n.text === "string" ? n.text : (n.children ?? []).map(inline).join(""));
  const INLINE = new Set(["a", "span", "b", "i", "u", "em", "strong", "code", "sub", "sup", "reference"]);
  const isBlock = (n) => typeof n.text !== "string" && !INLINE.has(n.type);
  const walk = (n) => {
    const kids = n.children ?? [];
    if (kids.some(isBlock)) {
      for (const k of kids) (isBlock(k) ? walk(k) : blocks.push(inline(k)));
    } else {
      const t = inline(n);
      if (t.trim()) blocks.push(t);
    }
  };
  walk(node);
  return blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
}

const fmtDate = (d) => String(d ?? "").slice(0, 10);

/** Regenerates the 3 article items and the Trip Planner destinations item from the snapshot. */
export function buildCmsItems(snapshot) {
  const entries = snapshot.entries ?? [];
  const articles = entries.filter((e) => e.ct === "blog_article");
  const items = CMS_ARTICLE_TITLES.map((title) => {
    const a = articles.find((e) => e.entry?.title === title);
    if (!a) throw new KitError(`Blog article "${title}" isn't in the imported content snapshot.`, { hint: "Re-run the export, or check seed/contentstack/entries." });
    const e = a.entry;
    const head = [
      "Red Panda Bicycles blog article (published on the Red Panda website).",
      `URL: /en${e.url}`,
      `Category: ${e.category}`,
      `Author: ${[e.author_name, e.author_role].filter(Boolean).join(", ")}`,
      `Published: ${fmtDate(e.publish_date)}`,
      `Summary: ${e.excerpt}`,
    ].join("\n");
    return { title, content: `${head}\n\n${rteToText(e.body)}` };
  });
  const places = entries.filter((e) => e.ct === "attraction");
  if (!places.length) throw new KitError("No attraction entries in the content snapshot.", { hint: "Re-run the export." });
  const list = places.map(({ entry: p }) => `- **${p.title}** (${p.latitude}, ${p.longitude}): ${p.blurb}`).join("\n");
  items.push({
    title: DESTINATIONS_TITLE,
    content: [
      "These are the destinations featured in the Red Panda Trip Planner on the website. The Trip Planner measures the straight-line distance from the rider (or from Amsterdam Centraal, 52.3791, 4.9003, if location is unavailable) and recommends a bike: for trips under about 5 km a Red Panda City Bike is perfect for hopping across town; beyond that it suggests an E-Bike. Real riding distances are always longer than straight-line distances.",
      "Destinations:",
      list,
    ].join("\n\n"),
  });
  return items;
}

/** Reads seed/brandkit/{knowledge-vault,voice-profiles}/*.md. cms-* files are never replayed from disk. */
export function loadBrandkitSeed(dir = "seed/brandkit") {
  const read = (sub) => {
    const d = path.join(dir, sub);
    return readdirSync(d).filter((f) => f.endsWith(".md")).sort().map((f) => ({ file: f, md: readFileSync(path.join(d, f), "utf8") }));
  };
  return {
    vault: read("knowledge-vault").filter((f) => !f.file.startsWith("cms-")).map((f) => parseVaultFile(f.md)),
    profiles: read("voice-profiles").map((f) => parseProfileFile(f.md)),
  };
}

// ------------------------------------------------------------------ API

export const firstArray = (body, keys) => {
  if (Array.isArray(body)) return body;
  for (const k of keys) if (Array.isArray(body?.[k])) return body[k];
  for (const k of ["data", "result", "results"]) {
    const v = body?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") { const r = firstArray(v, keys); if (r.length) return r; }
  }
  return [];
};
export const uidOf = (o) => o?.uid ?? o?._id ?? o?.id ?? o?.profile?.uid ?? o?.data?.uid ?? o?.data?._id ?? o?.data?.id ?? o?.context?.uid;
export const vaultTitle = (o) => o?._metadata?.title ?? o?.metadata?.title ?? o?.title;
export const profileName = (o) => o?.name ?? o?.profile?.name;

export function createApi({ fetch: fetchImpl = globalThis.fetch, headers }) {
  return async function api(method, url, { body, extra } = {}) {
    const init = { method, headers: { ...headers, ...extra, ...(body ? { "content-type": "application/json" } : {}) } };
    if (body) init.body = JSON.stringify(body);
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      throw new KitError(`${method} ${url} failed: ${e?.message ?? e}`, { code: 1 });
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new KitError(`Brand Kit API returned ${res.status} for ${method} ${url}.`, { code: 2, hint: OAUTH_HINT });
    }
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!res.ok) {
      throw new KitError(`Brand Kit API ${method} ${url} returned ${res.status}: ${text.slice(0, 300)}`, { code: 1, hint: "Fix the error above and re-run npm run kit:brandkit; items already created are skipped." });
    }
    return parsed;
  };
}

/**
 * @param {object} d
 * @param {typeof fetch} d.fetch
 * @param {Record<string,string>} d.headers  authtoken, organization_uid, brand_kit_uid
 * @param {string} d.brandKitUid
 * @param {{vault: {title,content}[], profiles: {name,content}[]}} d.seed
 * @param {{title,content}[]} d.cmsItems
 */
export async function runBrandkitPhase(d) {
  const { seed, cmsItems = [], state, save = () => {}, sleep, clock, log = () => {}, brandKitUid } = d;
  const api = createApi({ fetch: d.fetch, headers: d.headers });
  const bk = (state.brandkit ??= {});
  bk.vault ??= {};
  bk.profiles ??= {};
  // Ruling R22: items and profiles that were already there (not recorded by an earlier kit run)
  // are adopted: recorded apart, and never torn down.
  bk.adopted ??= {};
  bk.adopted.vault ??= {};
  bk.adopted.profiles ??= {};
  state.phases ??= {};
  const persist = () => save(state);

  const listVault = async () => firstArray(await api("GET", `${vaultBase()}/get-context?limit=50`), ["items", "contexts", "contents", "knowledge_vault"]);
  const waitFor = async (what, pred, onTimeout) => {
    const start = clock();
    for (;;) {
      const found = pred(await listVault());
      if (found) return found;
      if (clock() - start >= POLL_TIMEOUT_MS) {
        if (onTimeout) throw onTimeout();
        throw new KitError(`${what} still isn't visible in the Knowledge Vault after ${POLL_TIMEOUT_MS / 1000} s.`, { code: 1, hint: "Writes are asynchronous; wait a minute and re-run npm run kit:brandkit (finished items are skipped)." });
      }
      await sleep(POLL_MS);
    }
  };

  // ---- Knowledge Vault
  const wanted = [...seed.vault, ...cmsItems];
  let existing = await listVault();
  const titled = (list, title) => list.find((i) => vaultTitle(i) === title);
  for (const item of wanted) {
    const have = titled(existing, item.title);
    if (have) {
      if (bk.vault[item.title]) bk.vault[item.title] = uidOf(have) ?? bk.vault[item.title];
      else bk.adopted.vault[item.title] = uidOf(have) ?? null;
      persist();
      log(`skip "${item.title}" (already in the Knowledge Vault)`);
      continue;
    }
    let uid = bk.vault[item.title];
    if (uid) {
      // Created earlier (state has its uid): never POST again for this title. Wait for it to be listed.
      log(`resume "${item.title}" (created earlier as ${uid})`);
      await waitFor(`"${item.title}"`, (list) => list.find((i) => uidOf(i) === uid), () => new KitError(
        `"${item.title}" (${uid}) was created earlier but isn't visible in the Knowledge Vault yet.`,
        { code: 3, hint: "Writes are asynchronous: re-run npm run kit:brandkit in a minute. Nothing was created or changed this time." },
      ));
    } else {
      log(`create "${item.title}"`);
      const before = new Set(existing.map(uidOf));
      const created = await api("POST", `${vaultBase()}/`, { body: { content: item.content } });
      uid = uidOf(created);
      if (uid) { bk.vault[item.title] = uid; persist(); }
      if (uid) {
        await waitFor(`"${item.title}"`, (list) => list.find((i) => uidOf(i) === uid));
      } else {
        // The create response had no uid: identify the item as the one new uid in the list. Never guess.
        const ambiguous = (n) => new KitError(`Created "${item.title}" but couldn't tell which Knowledge Vault item it is (${n} new items appeared).`, {
          code: 3,
          hint: "Open the Knowledge Vault in Contentstack, delete any untitled or duplicate items for this title, then re-run npm run kit:brandkit. Nothing further was changed.",
        });
        const start = clock();
        for (;;) {
          const fresh = (await listVault()).filter((i) => !before.has(uidOf(i)));
          if (fresh.length > 1) throw ambiguous(fresh.length);
          if (fresh.length === 1) { uid = uidOf(fresh[0]); break; }
          if (clock() - start >= POLL_TIMEOUT_MS) throw ambiguous(0);
          await sleep(POLL_MS);
        }
        bk.vault[item.title] = uid;
        persist();
      }
    }
    await api("PUT", `${vaultBase()}/${uid}`, { body: { content: item.content, _metadata: { title: item.title } } });
    existing = await waitFor(`The title of "${item.title}"`, (list) => (titled(list, item.title) ? list : null));
    persist();
  }

  // ---- Voice profiles
  const profilesUrl = `${profilesApi()}/brand-kits/${brandKitUid}/profiles`;
  const v2 = { version: "v2" };
  const haveProfiles = firstArray(await api("GET", profilesUrl, { extra: v2 }), ["profiles", "items"]);
  let templateUid;
  for (const p of seed.profiles) {
    const have = haveProfiles.find((x) => profileName(x) === p.name);
    if (have) {
      if (bk.profiles[p.name]) bk.profiles[p.name] = uidOf(have) ?? bk.profiles[p.name];
      else bk.adopted.profiles[p.name] = uidOf(have) ?? null;
      persist();
      log(`skip voice profile "${p.name}" (already exists)`);
      continue;
    }
    if (!templateUid) {
      const templates = firstArray(await api("GET", `${profilesApi()}/profile-templates`, { extra: v2 }), ["templates", "profile_templates", "items"]);
      const voice = templates.find((t) => /voice/i.test(`${t?.name ?? ""} ${t?.type ?? ""}`));
      if (!voice) {
        throw new KitError(`No "voice" profile template found. Templates available: ${templates.map((t) => t?.name ?? t?.uid).join(", ") || "(none)"}.`, { code: 1, hint: "Check the Brand Kit's profile templates in Contentstack and re-run." });
      }
      templateUid = uidOf(voice) ?? voice.template_uid;
    }
    log(`create voice profile "${p.name}"`);
    const created = await api("POST", profilesUrl, { extra: v2, body: { profile: { name: p.name, content: p.content, template_uid: templateUid } } });
    bk.profiles[p.name] = uidOf(created) ?? null;
    haveProfiles.push({ name: p.name, uid: bk.profiles[p.name] });
    persist();
  }

  state.phases.brandkit = { done: true, at: new Date().toISOString() };
  persist();
  return state.brandkit;
}
