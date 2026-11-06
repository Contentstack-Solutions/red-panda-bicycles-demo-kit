#!/usr/bin/env node
// Red Panda helper: writes to Lytics, Contentstack Personalize and the
// Contentstack stack. It reads its own keys (environment, macOS keychain or
// ~/.red-panda/credentials.env), so no token ever appears in a command line
// or in its output. Zero dependencies; Node 18+.
//
//   node .claude/skills/red-panda-customer-insights/scripts/rp.mjs help

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { apiBase, publishEnvironmentNames } from "../../../../scripts/kit/lib/env.mjs";

export const VERSION = "1.0.0";

const LYTICS = "https://api.lytics.io";

// Settings that differ per account come from the environment, read when used
// (not at import) so a caller or test can set them first. The repo's .env.local
// fills in whatever the environment doesn't already set (Claude Code doesn't load it).
const envValue = (name) => { loadRepoEnv(); return String(process.env[name] ?? "").trim(); };

// Personalize API base URL: CONTENTSTACK_PERSONALIZE_API_HOST, else the US host (ruling R34).
const personalizeBase = () => { loadRepoEnv(); return apiBase("personalize", process.env); };

// Management API base URL; the host differs by region (e.g. eu-api.contentstack.com).
const cmaBase = () => `https://${(envValue("CONTENTSTACK_MANAGEMENT_HOST") || "api.contentstack.io").replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

export const DEFAULTS = {
  get personalizeProject() {
    return envValue("CONTENTSTACK_PERSONALIZE_PROJECT_UID") || envValue("PERSONALIZE_PROJECT_UID") || null;
  },
  // Environment names; turned into uids with GET /v3/environments where uids are needed.
  get environments() {
    loadRepoEnv();
    return publishEnvironmentNames(process.env);
  },
  locale: "en",
};

const HOME_DIR = join(homedir(), ".red-panda");
// Hints show this script's real path, so they work from any directory.
const SELF = fileURLToPath(import.meta.url);
const run = (sub) => `node ${SELF} ${sub}`;
const CREDENTIALS_FILE = join(HOME_DIR, "credentials.env");
// The repo root is four folders above this script's folder.
const REPO_ENV_FILE = join(dirname(SELF), "..", "..", "..", "..", ".env.local");
const KEYCHAIN_SERVICE = "red-panda";
const KEYCHAIN_FILE_SERVICE = "red-panda-credentials";

// Canonical key → names it may be stored under.
export const KEYS = {
  LYTICS_ACCESS_TOKEN: ["LYTICS_ACCESS_TOKEN", "LYTICS_API_TOKEN", "LYTICS_TOKEN", "LYTICS_API_KEY"],
  CONTENTSTACK_AUTHTOKEN: ["CONTENTSTACK_AUTHTOKEN", "CS_AUTHTOKEN", "AUTHTOKEN"],
  // OAuth user token for the Brand Kit APIs (docs/manual-steps.md step 11); sent as Authorization: Bearer.
  CONTENTSTACK_OAUTH_TOKEN: ["CONTENTSTACK_OAUTH_TOKEN"],
  CONTENTSTACK_API_KEY: ["CONTENTSTACK_API_KEY", "CS_API_KEY", "STACK_API_KEY"],
  CONTENTSTACK_MANAGEMENT_TOKEN: ["CONTENTSTACK_MANAGEMENT_TOKEN", "CS_MANAGEMENT_TOKEN", "MANAGEMENT_TOKEN"],
};

// ---------------------------------------------------------------- errors

export class RpError extends Error {
  constructor(message, { code = 1, hint, details } = {}) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

// Exit 3 means "a person has to decide"; nothing was changed.
const conflict = (message, details, hint) => new RpError(message, { code: 3, details, hint });

// ---------------------------------------------------------------- credentials

// Sets the keys from the repo's .env.local (or RP_REPO_ENV_FILE; empty disables it)
// that aren't already in the environment. Never overrides. Each file loads once.
const loadedEnvFiles = new Set();
export function loadRepoEnv(path = process.env.RP_REPO_ENV_FILE ?? REPO_ENV_FILE, env = process.env) {
  if (!path || loadedEnvFiles.has(path)) return [];
  loadedEnvFiles.add(path);
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  const added = [];
  for (const [key, value] of Object.entries(parseEnvFile(text))) {
    if (env[key] === undefined) { env[key] = value; added.push(key); }
  }
  return added;
}

// Keys whose stored value (keychain or credentials file) beats the environment:
// `login` stores a fresh authtoken there, so a stale one in .env.local mustn't win.
const STORE_FIRST = new Set(["CONTENTSTACK_AUTHTOKEN", "CONTENTSTACK_OAUTH_TOKEN"]);

export function parseEnvFile(text) {
  const vars = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars[match[1]] = value;
  }
  return vars;
}

// `security … -w` prints a value containing newlines as hex.
export function decodeKeychainValue(value) {
  if (value && /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
    const decoded = Buffer.from(value, "hex").toString("utf8");
    if (decoded.includes("=") && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) return decoded;
  }
  return value;
}

export function readKeychain(service, account) {
  try {
    const args = ["find-generic-password", "-s", service, ...(account ? ["-a", account] : []), "-w"];
    const out = execFileSync("security", args, { stdio: ["ignore", "pipe", "ignore"] }).toString().replace(/\n$/, "");
    return out || null;
  } catch {
    return null;
  }
}

export function createCredentials(options = {}) {
  loadRepoEnv();
  const {
    env = process.env,
    keychain = readKeychain,
    readFile = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    files = [env.RP_CREDENTIALS_FILE, CREDENTIALS_FILE].filter(Boolean),
  } = options;
  const cache = new Map();
  let bundles;

  // Whole-file sources, in priority order: a keychain item holding a keys
  // file, then files on disk.
  function loadBundles() {
    if (bundles) return bundles;
    bundles = [];
    const item = keychain(KEYCHAIN_FILE_SERVICE);
    if (item) bundles.push({ source: `keychain "${KEYCHAIN_FILE_SERVICE}"`, vars: parseEnvFile(decodeKeychainValue(item)) });
    for (const path of files) {
      const text = readFile(path);
      if (text) bundles.push({ source: path.replace(homedir(), "~"), vars: parseEnvFile(text) });
    }
    return bundles;
  }

  function fromEnv(names) {
    for (const name of names) if (env[name]) return { value: env[name], source: `env ${name}` };
    return null;
  }

  function fromStore(names) {
    for (const name of names) {
      const value = keychain(KEYCHAIN_SERVICE, name);
      if (value) return { value, source: `keychain "${KEYCHAIN_SERVICE}" / ${name}` };
      // Also accept one item per key named `red-panda/<KEY>`, any account.
      const alt = keychain(`${KEYCHAIN_SERVICE}/${name}`);
      if (alt) return { value: alt, source: `keychain "${KEYCHAIN_SERVICE}/${name}"` };
    }
    for (const bundle of loadBundles()) {
      for (const name of names) if (bundle.vars[name]) return { value: bundle.vars[name], source: bundle.source };
    }
    return null;
  }

  function lookup(key) {
    if (cache.has(key)) return cache.get(key);
    const names = KEYS[key] ?? [key];
    const found = STORE_FIRST.has(key) ? fromStore(names) ?? fromEnv(names) : fromEnv(names) ?? fromStore(names);
    cache.set(key, found);
    return found;
  }

  return {
    has: (key) => Boolean(lookup(key)),
    source: (key) => lookup(key)?.source ?? null,
    get(key) {
      const found = lookup(key);
      if (!found) {
        throw new RpError(`Missing credential ${key}`, {
          code: 2,
          hint: `Store it in the keychain (${run("keys-import <file>")}) or in ~/.red-panda/credentials.env, then run doctor.`,
        });
      }
      return found.value;
    },
    secrets: () => [...cache.values()].filter(Boolean).map((f) => f.value),
  };
}

export function redact(text, secrets) {
  let out = String(text);
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join("[redacted]");
  return out;
}

// ---------------------------------------------------------------- http

async function http(method, url, { headers = {}, body, query } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  const res = await fetch(u, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const snippet = typeof json === "string" ? json.slice(0, 400) : JSON.stringify(json).slice(0, 600);
    const errorCode = json && typeof json === "object" && json.error_code !== undefined ? { error_code: json.error_code } : {};
    throw new RpError(`${method} ${u.host}${u.pathname} → ${res.status}: ${snippet}`, { details: { status: res.status, host: u.host, ...errorCode } });
  }
  return json;
}

export function clients(creds) {
  return {
    lytics: async (method, path, opts = {}) => {
      const json = await http(method, LYTICS + path, { ...opts, headers: { Authorization: creds.get("LYTICS_ACCESS_TOKEN") } });
      return json && typeof json === "object" && "data" in json ? json.data : json;
    },
    personalize: async (method, path, opts = {}) => {
      const project = DEFAULTS.personalizeProject;
      if (!project) {
        throw new RpError("Missing CONTENTSTACK_PERSONALIZE_PROJECT_UID", {
          code: 2, hint: "Set it to the Personalize project uid (Personalize → your project → Settings).",
        });
      }
      try {
        return await http(method, personalizeBase() + path, {
          ...opts,
          headers: { authtoken: creds.get("CONTENTSTACK_AUTHTOKEN"), "x-project-uid": project },
        });
      } catch (err) {
        if (err.details?.status === 401) {
          err.hint = `The Contentstack authtoken has expired or was logged out. Ask the user to run \`${run("login")}\` in Terminal, then retry.`;
        }
        throw err;
      }
    },
    cma: (method, path, opts = {}) => {
      const auth = creds.has("CONTENTSTACK_MANAGEMENT_TOKEN")
        ? { authorization: creds.get("CONTENTSTACK_MANAGEMENT_TOKEN") }
        : { authtoken: creds.get("CONTENTSTACK_AUTHTOKEN") };
      return http(method, cmaBase() + path, { ...opts, headers: { api_key: creds.get("CONTENTSTACK_API_KEY"), ...auth } });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const progress = (msg) => process.stderr.write(`rp: ${msg}\n`);

async function poll(fn, { seconds, every = 3, label }) {
  const deadline = Date.now() + seconds * 1000;
  let announced = false;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() >= deadline) return null;
    if (!announced && label) { progress(label); announced = true; }
    await sleep(every * 1000);
  }
}

// ---------------------------------------------------------------- pure helpers

export function slugify(name) {
  return String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function toSegmentQl(ql) {
  const trimmed = String(ql ?? "").trim();
  if (!trimmed) throw new RpError("segment_ql is required", { code: 2 });
  return /^FILTER\b/i.test(trimmed) ? trimmed : `FILTER ${trimmed} FROM user`;
}

export function normalizeQl(ql) {
  return String(ql).replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim().toLowerCase();
}

export function findByRef(items, ref, fields) {
  if (ref === undefined || ref === null || ref === "") return null;
  const needle = String(ref).toLowerCase();
  return items.find((item) => fields.some((f) => item[f] !== undefined && String(item[f]).toLowerCase() === needle)) ?? null;
}

export function buildVariants(specs, audiences) {
  return specs.map((spec) => {
    const audience = findByRef(audiences, spec.audience, ["uid", "slug", "name"]);
    if (!audience) throw new RpError(`Personalize audience not found: ${spec.audience}`, { code: 2 });
    const lytics = audience.source === "LYTICS";
    return {
      __type: "SegmentedVariant",
      name: spec.name || audience.name,
      audiences: lytics ? [] : [audience.uid],
      lyticsAudiences: lytics ? [audience.uid] : [],
      audienceCombinationType: "AND",
    };
  });
}

// Which of the target environments would receive the base entry's unpublished
// changes if a variant were published now.
export function baseDraftStatus(entry, environments, locale) {
  const behind = [];
  for (const env of environments) {
    const published = (entry.publish_details ?? []).filter((p) => p.environment === env && (p.locale ?? locale) === locale && !p.variant_uid);
    const version = Math.max(0, ...published.map((p) => p.version ?? 0));
    if (version < entry._version) behind.push({ environment: env, published_version: version || null });
  }
  return { base_version: entry._version, has_draft: behind.length > 0, behind };
}

export function pickVariant(experience, versionVariants, ref) {
  const cmsMap = experience?._cms?.variants ?? {};
  const candidates = versionVariants.map((v) => ({ name: v.name, short_uid: v.shortUid, cms_variant_uid: cmsMap[v.shortUid] }));
  let chosen;
  if (ref === undefined || ref === null || ref === "") {
    if (candidates.length !== 1) {
      throw new RpError(`Experience "${experience.name}" has ${candidates.length} variants; pass "variant" (name or short uid).`, {
        code: 2, details: { variants: candidates },
      });
    }
    chosen = candidates[0];
  } else {
    chosen = findByRef(candidates, ref, ["name", "short_uid", "cms_variant_uid"]);
  }
  if (!chosen) throw new RpError(`Variant not found: ${ref}`, { code: 2, details: { variants: candidates } });
  if (!chosen.cms_variant_uid) {
    throw new RpError(`Variant "${chosen.name}" hasn't synced to the stack yet.`, { hint: "Wait a few seconds and retry." });
  }
  return chosen;
}

// A variant's targeting, ignoring its name and short uid.
const variantTargets = (v) => JSON.stringify([[...(v.lyticsAudiences ?? [])].sort(), [...(v.audiences ?? [])].sort()]);
const variantKey = (v) => `${String(v.name).toLowerCase()}|${variantTargets(v)}`;

// Plans adding one variant through the draft → edit → activate cycle. Status
// lives on versions: edit the one draft (or a new one), then activating it
// archives the live version. Existing variants are carried over as they are,
// short uids included, so their CMS variants (and any content on them) stay.
export function planAddVariant(versions, added) {
  const live = versions.find((v) => v.status === "ACTIVE") ?? versions.find((v) => v.status === "PAUSED") ?? null;
  const draft = versions.find((v) => v.status === "DRAFT") ?? null;
  const base = (live ?? draft)?.variants ?? [];

  const sameTargets = base.find((v) => variantTargets(v) === variantTargets(added));
  if (sameTargets) return { status: "exists", live, draft, variant: sameTargets };
  if (base.some((v) => String(v.name).toLowerCase() === String(added.name).toLowerCase())) {
    throw conflict(`A variant called "${added.name}" already targets a different audience.`,
      { variants: base.map(({ name, shortUid }) => ({ name, short_uid: shortUid })) }, 'Ask the user for another name and rerun with "name".');
  }

  if (live && draft) {
    const expected = new Set([...base, added].map(variantKey));
    const draftKeys = draft.variants.map(variantKey);
    const untouched = draftKeys.every((k) => expected.has(k)) && base.every((v) => draftKeys.includes(variantKey(v)));
    if (!untouched) {
      throw conflict("This experience already has a draft version with other unsaved changes; activating it would publish them too.",
        { draft_version: draft.uid, draft_variants: draft.variants.map((v) => v.name) },
        "Ask the user whether someone is still editing it in Personalize. Don't activate or change it without a yes.");
    }
  }
  // Resuming an unfinished run: keep the short uid the draft already gave it.
  const resumed = live && draft?.variants.find((v) => variantKey(v) === variantKey(added));
  return { status: "planned", live, draft, variants: [...base, resumed || added] };
}

const SYSTEM_FIELDS = new Set(["uid", "_version", "created_at", "updated_at", "created_by", "updated_by", "ACL", "_in_progress", "publish_details", "_rules", "_workflow", "locale"]);
export function stripSystemFields(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([k]) => !SYSTEM_FIELDS.has(k)));
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s);
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(arg);
  }
  return { positional, flags };
}

// Shell tools often leave stdin open with nothing on it; give up if no data
// arrives quickly instead of waiting forever.
function readStdin({ idleMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const finish = () => { clearTimeout(timer); process.stdin.pause(); resolve(Buffer.concat(chunks).toString("utf8")); };
    const timer = setTimeout(() => { if (chunks.length === 0) finish(); }, idleMs);
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
  });
}

async function readInput(flags, { required = true } = {}) {
  let text;
  if (typeof flags.json === "string") text = flags.json;
  else if (typeof flags.file === "string") text = readFileSync(flags.file, "utf8");
  else if (!process.stdin.isTTY) text = await readStdin();
  if (!text || !text.trim()) {
    if (!required) return {};
    throw new RpError("This command needs a JSON body.", { code: 2, hint: "Pass it on stdin with a quoted heredoc: <<'JSON' … JSON" });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new RpError(`Invalid JSON body: ${err.message}`, { code: 2, hint: "Use a quoted heredoc (<<'JSON') so the shell leaves quotes and backticks alone." });
  }
}

// ---------------------------------------------------------------- Lytics

async function lyticsAudiences(api) {
  const list = await api.lytics("GET", "/api/segment", { query: { table: "user" } });
  return (list ?? []).map((s) => ({ id: s.id, slug: s.slug_name, name: s.name, is_public: Boolean(s.is_public), segment_ql: s.segment_ql, kind: s.kind }));
}

async function findLyticsAudience(api, ref) {
  const audience = findByRef(await lyticsAudiences(api), ref, ["id", "slug", "name"]);
  if (!audience) throw new RpError(`Lytics audience not found: ${ref}`, { code: 2 });
  return audience;
}

async function updateLyticsAudience(api, id, changes) {
  const current = await api.lytics("GET", `/api/segment/${id}`);
  const body = { ...current };
  if (changes.name !== undefined) body.name = changes.name;
  if (changes.description !== undefined) body.description = changes.description;
  if (changes.is_public !== undefined) body.is_public = Boolean(changes.is_public);
  if (changes.segment_ql !== undefined) body.segment_ql = toSegmentQl(changes.segment_ql);
  const saved = await api.lytics("PUT", `/api/segment/${id}`, { body });
  return { id, slug: saved?.slug_name ?? body.slug_name, name: saved?.name ?? body.name, is_public: Boolean(saved?.is_public ?? body.is_public) };
}

const lyticsCommands = {
  async "lytics-audiences"({ api }) {
    return (await lyticsAudiences(api)).map(({ segment_ql, kind, ...rest }) => rest);
  },

  async "lytics-audience"({ api, positional }) {
    return findLyticsAudience(api, positional[0]);
  },

  async "lytics-audience-size"({ api, positional }) {
    const audience = await findLyticsAudience(api, positional[0]);
    try {
      const scan = await http("GET", `${LYTICS}/api/segment/${audience.id}/scan`, {
        headers: { Authorization: api.creds.get("LYTICS_ACCESS_TOKEN") }, query: { limit: 1 },
      });
      return { slug: audience.slug, total: scan?.total ?? scan?.data?.total ?? null };
    } catch (err) {
      if (err.details?.status === 404) err.hint = "New audiences can't be scanned for about a minute. Use the count you measured before creating it.";
      throw err;
    }
  },

  async "lytics-create-audience"({ api, input }) {
    if (!input.name) throw new RpError('"name" is required', { code: 2 });
    const segment_ql = toSegmentQl(input.segment_ql ?? input.ql ?? input.definition);
    const slug = input.slug || input.slug_name || slugify(input.name);
    const wantPublic = Boolean(input.is_public ?? input.public);
    const all = await lyticsAudiences(api);
    const existing = findByRef(all, slug, ["slug"]) ?? findByRef(all, input.name, ["name"]);

    if (existing) {
      if (normalizeQl(existing.segment_ql ?? "") !== normalizeQl(segment_ql)) {
        throw conflict(`An audience called "${existing.name}" (${existing.slug}) already exists with a different definition.`,
          { existing: { id: existing.id, slug: existing.slug, segment_ql: existing.segment_ql }, requested: { segment_ql } },
          "Ask whether to update it (lytics-update-audience) or use a new name.");
      }
      if (wantPublic && !existing.is_public) {
        const updated = await updateLyticsAudience(api, existing.id, { is_public: true });
        return { status: "exists_made_public", ...updated };
      }
      return { status: "exists", id: existing.id, slug: existing.slug, name: existing.name, is_public: existing.is_public };
    }

    const created = await api.lytics("POST", "/api/segment", {
      body: { table: "user", name: input.name, slug_name: slug, segment_ql, description: input.description ?? "", is_public: wantPublic, save_hist: true },
    });
    return { status: "created", id: created.id, slug: created.slug_name ?? slug, name: created.name ?? input.name, is_public: Boolean(created.is_public ?? wantPublic) };
  },

  async "lytics-update-audience"({ api, input }) {
    const audience = await findLyticsAudience(api, input.audience ?? input.id ?? input.slug);
    return { status: "updated", ...(await updateLyticsAudience(api, audience.id, input)) };
  },

  async "lytics-delete-audience"({ api, positional }) {
    const audience = await findLyticsAudience(api, positional[0]);
    await api.lytics("DELETE", `/api/segment/${audience.id}`);
    return { status: "deleted", id: audience.id, slug: audience.slug, name: audience.name };
  },

  async "lytics-profile"({ api, positional }) {
    const [field, value] = positional.length === 1 ? ["_uids", positional[0]] : positional;
    return api.lytics("GET", `/api/entity/user/${encodeURIComponent(field)}/${encodeURIComponent(value)}`);
  },

  async "lytics-send"({ api, positional, input }) {
    const stream = positional[0];
    if (!stream) throw new RpError("Usage: lytics-send <stream> with the record(s) as the JSON body", { code: 2 });
    const records = Array.isArray(input) ? input : [input];
    await api.lytics("POST", `/collect/json/${encodeURIComponent(stream)}`, { body: records });
    return { status: "sent", stream, records: records.length };
  },
};

// ---------------------------------------------------------------- Personalize

async function personalizeExperiences(api) {
  return (await api.personalize("GET", "/experiences")) ?? [];
}

async function findExperience(api, ref) {
  const experience = findByRef(await personalizeExperiences(api), ref, ["uid", "name", "shortUid"]);
  if (!experience) throw new RpError(`Personalize experience not found: ${ref}`, { code: 2 });
  return experience;
}

async function latestVersion(api, experience) {
  const versions = (await api.personalize("GET", `/experiences/${experience.uid}/versions`)) ?? [];
  return versions.find((v) => v.uid === experience.latestVersion) ?? versions.find((v) => v.status === "DRAFT") ?? versions[0];
}

function summarizeExperience(experience, version) {
  const cms = experience._cms?.variants ?? {};
  return {
    uid: experience.uid,
    name: experience.name,
    state: experience.status,
    variant_group: experience._cms?.variantGroup ?? null,
    variants: (version?.variants ?? []).map((v) => ({
      name: v.name,
      short_uid: v.shortUid,
      cms_variant_uid: cms[v.shortUid] ?? null,
      targets: [...(v.lyticsAudiences ?? []).map((uid) => ({ lytics_audience: uid })), ...(v.audiences ?? []).map((uid) => ({ personalize_audience: uid }))],
    })),
  };
}

async function waitForAudiences(api, refs, seconds) {
  let audiences = [];
  const found = await poll(async () => {
    audiences = (await api.personalize("GET", "/audiences")) ?? [];
    return refs.every((ref) => findByRef(audiences, ref, ["uid", "slug", "name"])) ? audiences : null;
  }, { seconds, every: 5, label: "waiting for the Lytics audience to sync into Personalize (usually 1-2 min)…" });
  if (!found) {
    const missing = refs.filter((ref) => !findByRef(audiences, ref, ["uid", "slug", "name"]));
    throw new RpError(`Audience not in Personalize yet: ${missing.join(", ")}`, {
      hint: "Personalize only sees public Lytics audiences. Check it's public (lytics-update-audience with is_public true), wait a minute, then rerun the same command; it picks up where it stopped.",
    });
  }
  return found;
}

async function linkContentTypes(api, groupUid, contentTypes) {
  if (!groupUid || contentTypes.length === 0) return [];
  const { variant_groups: groups = [] } = await api.cma("GET", "/v3/variant_groups");
  const group = groups.find((g) => g.uid === groupUid);
  if (!group) throw new RpError(`Variant group ${groupUid} not found in the stack yet`, { hint: "Wait a few seconds and retry." });
  const linked = (group.content_types ?? []).map((ct) => ct.uid);
  const missing = contentTypes.filter((ct) => !linked.includes(ct));
  if (missing.length > 0) {
    await api.cma("PUT", `/v3/variant_groups/${groupUid}`, {
      body: { name: group.name, content_types: [...(group.content_types ?? []), ...missing.map((uid) => ({ uid, status: "linked" }))] },
    });
  }
  return [...linked, ...missing];
}

const personalizeCommands = {
  async "personalize-audiences"({ api }) {
    return ((await api.personalize("GET", "/audiences")) ?? []).map(({ uid, name, slug, source }) => ({ uid, name, slug, source }));
  },

  async "personalize-experiences"({ api }) {
    return (await personalizeExperiences(api)).map((e) => ({
      uid: e.uid, name: e.name, state: e.status, variant_group: e._cms?.variantGroup ?? null, cms_variants: e._cms?.variants ?? {},
    }));
  },

  async "personalize-experience"({ api, positional }) {
    const experience = await findExperience(api, positional[0]);
    return summarizeExperience(experience, await latestVersion(api, experience));
  },

  async "personalize-create-experience"({ api, input }) {
    if (!input.name) throw new RpError('"name" is required', { code: 2 });
    const specs = input.variants ?? (input.audience ? [{ name: input.variant_name, audience: input.audience }] : []);
    if (specs.length === 0) throw new RpError('Pass "audience" or "variants": [{ "name", "audience" }]', { code: 2 });
    const contentTypes = [].concat(input.content_types ?? input.content_type ?? []);
    const activate = input.activate !== false;

    const audiences = await waitForAudiences(api, specs.map((s) => s.audience), Number(input.wait_seconds ?? 180));
    const variants = buildVariants(specs, audiences);

    let experience = findByRef(await personalizeExperiences(api), input.name, ["name"]);
    let status = "created";
    if (experience) {
      status = "exists";
    } else {
      experience = await api.personalize("POST", "/experiences", { body: { name: input.name, description: input.description ?? "", __type: "SEGMENTED" } });
    }

    let version = await latestVersion(api, experience);
    if (version.status !== "ACTIVE" || version.variants?.length === 0) {
      version = await api.personalize("PUT", `/experiences/${experience.uid}/versions/${version.uid}`, {
        body: { status: activate ? "ACTIVE" : "DRAFT", variants },
      });
      if (status === "exists") status = "resumed";
    }

    // Personalize mirrors each variant into the stack as a CMS variant.
    experience = await poll(async () => {
      const e = await findExperience(api, experience.uid);
      return e._cms?.syncStatus === "SUCCESS" && Object.keys(e._cms.variants ?? {}).length >= version.variants.length ? e : null;
    }, { seconds: 45, every: 2, label: "waiting for the variants to sync into the stack…" }) ?? (await findExperience(api, experience.uid));

    const content_types = await linkContentTypes(api, experience._cms?.variantGroup, contentTypes);
    return { status, ...summarizeExperience(experience, version), content_types };
  },

  // Changing a live experience: never edit it in place. Draft, edit, activate.
  async "personalize-add-variant"({ api, input }) {
    if (!input.experience || !input.audience) throw new RpError('"experience" and "audience" are required', { code: 2 });
    let experience = await findExperience(api, input.experience);
    const activate = input.activate !== false;
    const audiences = await waitForAudiences(api, [input.audience], Number(input.wait_seconds ?? 180));
    const [added] = buildVariants([{ name: input.name ?? input.variant_name, audience: input.audience }], audiences);

    const versions = (await api.personalize("GET", `/experiences/${experience.uid}/versions`)) ?? [];
    const plan = planAddVariant(versions, added);
    if (plan.status === "exists") {
      return { status: "exists", variant: plan.variant.name, ...summarizeExperience(experience, plan.live ?? plan.draft) };
    }

    // 1. Create the draft as a copy of the live variants (only one draft can
    // exist, and the API needs a variants array), 2. edit it, 3. activate it.
    const path = (v) => `/experiences/${experience.uid}/versions/${v.uid}`;
    const draft = plan.draft ?? await api.personalize("POST", `/experiences/${experience.uid}/versions`, {
      body: { status: "DRAFT", variants: plan.live?.variants ?? [] },
    });
    let version = await api.personalize("PUT", path(draft), { body: { status: "DRAFT", variants: plan.variants } });
    if (activate) version = await api.personalize("PUT", path(draft), { body: { status: "ACTIVE", variants: version?.variants ?? plan.variants } });

    experience = await poll(async () => {
      const e = await findExperience(api, experience.uid);
      return e._cms?.syncStatus === "SUCCESS" && Object.keys(e._cms.variants ?? {}).length >= plan.variants.length ? e : null;
    }, { seconds: 45, every: 2, label: "waiting for the new variant to sync into the stack…" }) ?? (await findExperience(api, experience.uid));

    const content_types = await linkContentTypes(api, experience._cms?.variantGroup, [].concat(input.content_types ?? input.content_type ?? []));
    return {
      status: activate ? "activated" : "draft",
      added: added.name,
      archived_version: activate ? plan.live?.uid ?? null : null,
      ...summarizeExperience(experience, version),
      content_types,
    };
  },

  async "personalize-set-status"({ api, input, positional }) {
    const experience = await findExperience(api, input.experience ?? positional[0]);
    const target = String(input.status ?? positional[1] ?? "").toUpperCase();
    if (!["ACTIVE", "PAUSED"].includes(target)) throw new RpError("status must be ACTIVE or PAUSED", { code: 2 });
    const version = await latestVersion(api, experience);
    await api.personalize("PUT", `/experiences/${experience.uid}/versions/${version.uid}`, { body: { status: target, variants: version.variants } });
    const updated = await findExperience(api, experience.uid);
    return { status: "updated", state: updated.status, uid: updated.uid, name: updated.name };
  },

  async "personalize-create-events"({ api, input }) {
    const wanted = input.events ?? [input];
    const existing = (await api.personalize("GET", "/events")) ?? [];
    const results = [];
    for (const event of wanted) {
      if (!event.key) throw new RpError('Each event needs a "key"', { code: 2 });
      const found = existing.find((e) => e.key === event.key);
      if (found) { results.push({ key: event.key, status: "exists", uid: found.uid }); continue; }
      const created = await api.personalize("POST", "/events", { body: { key: event.key, description: event.description ?? "" } });
      results.push({ key: event.key, status: "created", uid: created?.uid });
    }
    return results;
  },

  async "personalize-delete-experience"({ api, positional }) {
    const experience = await findExperience(api, positional[0]);
    await api.personalize("DELETE", `/experiences/${experience.uid}`);
    // The stack keeps the experience's variant group, marked "unlinked", so remove it too.
    const groupUid = experience._cms?.variantGroup;
    const removed = groupUid && await poll(async () => {
      const { variant_groups: groups = [] } = await api.cma("GET", "/v3/variant_groups");
      const group = groups.find((g) => g.uid === groupUid);
      if (!group) return true;
      if (group.personalize_metadata?.status !== "unlinked") return null;
      await api.cma("DELETE", `/v3/variant_groups/${groupUid}`);
      return true;
    }, { seconds: 30, every: 2 });
    return { status: "deleted", uid: experience.uid, name: experience.name, variant_group_removed: Boolean(removed) };
  },
};

// ---------------------------------------------------------------- CMS

async function resolveVariant(api, input) {
  if (input.variant_uid) return { cms_variant_uid: input.variant_uid, variant_group: input.variant_group ?? null };
  if (!input.experience) throw new RpError('Pass "experience" (name or uid) or "variant_uid"', { code: 2 });
  const experience = await findExperience(api, input.experience);
  const version = await latestVersion(api, experience);
  const variant = pickVariant(experience, version?.variants ?? [], input.variant);
  return { ...variant, variant_group: experience._cms?.variantGroup ?? null, experience: experience.name };
}

async function resolveEnvironments(api, envs) {
  const list = [].concat(envs ?? DEFAULTS.environments);
  if (list.every((e) => /^blt[0-9a-f]+$/i.test(e))) return list;
  const { environments = [] } = await api.cma("GET", "/v3/environments");
  return list.map((e) => {
    const match = findByRef(environments, e, ["uid", "name"]);
    if (!match) throw new RpError(`Environment not found: ${e}`, { code: 2 });
    return match.uid;
  });
}

const entryPath = (ct, uid) => `/v3/content_types/${encodeURIComponent(ct)}/entries/${encodeURIComponent(uid)}`;

function requireEntry(input) {
  if (!input.content_type || !input.entry) throw new RpError('"content_type" and "entry" (base entry uid) are required', { code: 2 });
}

const cmsCommands = {
  async "cms-entry"({ api, input, positional }) {
    const ct = input.content_type ?? positional[0];
    const uid = input.entry ?? positional[1];
    const { entry } = await api.cma("GET", entryPath(ct, uid), { query: { locale: input.locale ?? DEFAULTS.locale, include_publish_details: true } });
    return entry;
  },

  async "cms-create-entry"({ api, input }) {
    if (!input.content_type || !input.fields) throw new RpError('"content_type" and "fields" are required', { code: 2 });
    const locale = input.locale ?? DEFAULTS.locale;
    const { entry } = await api.cma("POST", `/v3/content_types/${encodeURIComponent(input.content_type)}/entries`, { query: { locale }, body: { entry: input.fields } });
    return { status: "created", uid: entry.uid, title: entry.title, version: entry._version };
  },

  async "cms-update-entry"({ api, input }) {
    requireEntry(input);
    if (!input.fields) throw new RpError('"fields" is required', { code: 2 });
    const locale = input.locale ?? DEFAULTS.locale;
    const { entry: current } = await api.cma("GET", entryPath(input.content_type, input.entry), { query: { locale } });
    const { entry } = await api.cma("PUT", entryPath(input.content_type, input.entry), {
      query: { locale }, body: { entry: { ...stripSystemFields(current), ...input.fields } },
    });
    return { status: "updated", uid: entry.uid, version: entry._version, changed: Object.keys(input.fields) };
  },

  async "cms-publish-entry"({ api, input }) {
    requireEntry(input);
    const locale = input.locale ?? DEFAULTS.locale;
    const environments = await resolveEnvironments(api, input.environments);
    await api.cma("POST", `${entryPath(input.content_type, input.entry)}/publish`, { body: { entry: { environments, locales: [locale] }, locale } });
    return { status: "queued", entry: input.entry, environments };
  },

  async "cms-delete-entry"({ api, input, positional }) {
    const ct = input.content_type ?? positional[0];
    const uid = input.entry ?? positional[1];
    await api.cma("DELETE", entryPath(ct, uid), { query: { locale: input.locale ?? DEFAULTS.locale } });
    return { status: "deleted", entry: uid };
  },

  async "cms-create-variant"({ api, input }) {
    requireEntry(input);
    const fields = input.fields ?? {};
    const changed = Object.keys(fields);
    if (changed.length === 0) throw new RpError('"fields" must list the fields that change', { code: 2 });
    const locale = input.locale ?? DEFAULTS.locale;
    const variant = await resolveVariant(api, input);
    // An entry variant can only exist once its group lists the content type.
    await linkContentTypes(api, variant.variant_group, [input.content_type]);
    const { entry } = await api.cma("PUT", `${entryPath(input.content_type, input.entry)}/variants/${variant.cms_variant_uid}`, {
      query: { locale }, body: { entry: { ...fields, _variant: { _change_set: changed } } },
    });
    return { status: "saved", entry: input.entry, variant_uid: variant.cms_variant_uid, variant: variant.name, version: entry?._version, changed };
  },

  async "cms-publish-variant"({ api, input }) {
    requireEntry(input);
    const locale = input.locale ?? DEFAULTS.locale;
    const environments = await resolveEnvironments(api, input.environments);
    const variant = await resolveVariant(api, input);
    const path = entryPath(input.content_type, input.entry);

    // Publishing a variant also publishes the base entry's latest version when
    // it has unpublished changes, so a half-finished base edit would go live.
    const { entry: base } = await api.cma("GET", path, { query: { locale, include_publish_details: true } });
    const draft = baseDraftStatus(base, environments, locale);
    if (draft.has_draft && !input.allow_base_draft) {
      throw conflict("The base entry has unpublished changes; publishing the variant would publish them too.", draft,
        'Ask the user. Rerun with "allow_base_draft": true only if they say the base changes can go live.');
    }

    const { entry: current } = await api.cma("GET", `${path}/variants/${variant.cms_variant_uid}`, { query: { locale } });
    await api.cma("POST", `${path}/publish`, {
      body: {
        entry: {
          environments,
          locales: [locale],
          variants: [{ uid: variant.cms_variant_uid, version: current._version }],
          variant_rules: { publish_latest_base: false, publish_latest_base_conditionally: true },
        },
        locale,
      },
    });

    const live = await poll(async () => {
      const { entry } = await api.cma("GET", `${path}/variants/${variant.cms_variant_uid}`, { query: { locale, include_publish_details: true } });
      const done = environments.every((env) => (entry.publish_details ?? []).some((p) => p.environment === env && p.version === current._version));
      return done ? entry : null;
    }, { seconds: 30, every: 2 });
    return { status: live ? "published" : "queued", entry: input.entry, variant_uid: variant.cms_variant_uid, version: current._version, environments };
  },

  async "cms-unpublish-variant"({ api, input }) {
    requireEntry(input);
    const locale = input.locale ?? DEFAULTS.locale;
    const environments = await resolveEnvironments(api, input.environments);
    const variant = await resolveVariant(api, input);
    const path = entryPath(input.content_type, input.entry);
    const { entry: current } = await api.cma("GET", `${path}/variants/${variant.cms_variant_uid}`, { query: { locale } });
    await api.cma("POST", `${path}/unpublish`, {
      body: { entry: { environments, locales: [locale], variants: [{ uid: variant.cms_variant_uid, version: current._version }] }, locale },
    });
    const offline = await poll(async () => {
      const { entry } = await api.cma("GET", `${path}/variants/${variant.cms_variant_uid}`, { query: { locale, include_publish_details: true } });
      return environments.every((env) => !(entry.publish_details ?? []).some((p) => p.environment === env)) ? entry : null;
    }, { seconds: 30, every: 2 });
    return { status: offline ? "unpublished" : "queued", entry: input.entry, variant_uid: variant.cms_variant_uid, environments };
  },

  async "cms-delete-variant"({ api, input }) {
    requireEntry(input);
    const variant = await resolveVariant(api, input);
    await api.cma("DELETE", `${entryPath(input.content_type, input.entry)}/variants/${variant.cms_variant_uid}`, { query: { locale: input.locale ?? DEFAULTS.locale } });
    return { status: "deleted", entry: input.entry, variant_uid: variant.cms_variant_uid };
  },
};

// ---------------------------------------------------------------- setup

function storeInKeychain(account, value) {
  execFileSync("security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", value], { stdio: "ignore" });
}

function canonicalVars(vars) {
  const out = {};
  for (const [key, names] of Object.entries(KEYS)) {
    const name = names.find((n) => vars[n]);
    if (name) out[key] = vars[name];
  }
  return out;
}

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

async function check(fn) {
  try { await fn(); return "ok"; } catch (err) { return err.code === 2 ? "missing credential" : err.message.slice(0, 160); }
}

const setupCommands = {
  async version() {
    return { version: VERSION, path: SELF };
  },

  async doctor({ api, creds }) {
    const keys = Object.fromEntries(Object.keys(KEYS).map((k) => [k, creds.source(k) ?? "missing"]));
    const checks = {
      lytics: await check(() => api.lytics("GET", "/api/segment", { query: { table: "user" } })),
      personalize: await check(() => api.personalize("GET", "/experiences")),
      cms: await check(() => api.cma("GET", "/v3/environments")),
    };
    return {
      version: VERSION,
      keys,
      checks,
      ready: { lytics_write: checks.lytics === "ok", personalize_write: checks.personalize === "ok", cms_write: checks.cms === "ok" },
    };
  },

  async "keys-import"({ positional }) {
    const file = positional[0];
    if (!file || !existsSync(file)) throw new RpError("Usage: keys-import <path to KEY=value file>", { code: 2 });
    const vars = canonicalVars(parseEnvFile(readFileSync(file, "utf8")));
    if (Object.keys(vars).length === 0) throw new RpError(`No known keys in ${file}. Expected names like ${Object.keys(KEYS).join(", ")}.`, { code: 2 });
    for (const [key, value] of Object.entries(vars)) storeInKeychain(key, value);
    return { status: "stored", keychain_service: KEYCHAIN_SERVICE, keys: Object.keys(vars) };
  },

  // Run by a person in Terminal: it asks for the password and 2FA code.
  async login({ flags }) {
    if (!process.stdin.isTTY) {
      throw new RpError("login is interactive.", { code: 2, hint: `Ask the user to run \`${run("login")}\` in Terminal themselves.` });
    }
    const email = typeof flags.email === "string" ? flags.email : await prompt("Contentstack email: ");
    const password = await prompt("Password: ", { hidden: true });
    const tfa = await prompt("2FA code (blank if none): ");
    const res = await http("POST", `${cmaBase()}/v3/user-session`, {
      body: { user: { email, password, ...(tfa ? { tfa_token: tfa } : {}) } },
    }).catch((err) => {
      throw new RpError(err.message.includes("294") ? "Login needs a current 2FA code; codes last about 30 seconds." : err.message, { code: 1 });
    });
    const token = res?.user?.authtoken;
    if (!token) throw new RpError("Login succeeded but returned no authtoken.");
    try {
      storeInKeychain("CONTENTSTACK_AUTHTOKEN", token);
      return { status: "stored", where: `keychain "${KEYCHAIN_SERVICE}" / CONTENTSTACK_AUTHTOKEN` };
    } catch {
      mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
      const current = existsSync(CREDENTIALS_FILE) ? readFileSync(CREDENTIALS_FILE, "utf8") : "";
      const kept = current.split("\n").filter((l) => l && !/^\s*(export\s+)?CONTENTSTACK_AUTHTOKEN\s*=/.test(l));
      writeFileSync(CREDENTIALS_FILE, [...kept, `CONTENTSTACK_AUTHTOKEN=${token}`].join("\n") + "\n", { mode: 0o600 });
      return { status: "stored", where: "~/.red-panda/credentials.env" };
    }
  },
};

// ---------------------------------------------------------------- main

export const COMMANDS = { ...setupCommands, ...lyticsCommands, ...personalizeCommands, ...cmsCommands };

// Runs one command in process, as the CLI does after reading its arguments.
export async function runCommand(name, { input = {}, positional = [], flags = {} } = {}, creds = createCredentials()) {
  const fn = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  if (!fn) throw new RpError(`Unknown command: ${name}`, { code: 2, hint: "Run help for the list." });
  const api = { ...clients(creds), creds };
  return fn({ api, creds, input, positional, flags });
}

// Commands that take a JSON body on stdin (or --json / --file).
const BODY_REQUIRED = new Set([
  "lytics-create-audience", "lytics-update-audience", "lytics-send",
  "personalize-create-experience", "personalize-add-variant", "personalize-create-events",
  "cms-create-entry", "cms-update-entry", "cms-publish-entry",
  "cms-create-variant", "cms-publish-variant", "cms-unpublish-variant", "cms-delete-variant",
]);
const BODY_OPTIONAL = new Set(["cms-entry", "cms-delete-entry", "personalize-set-status"]);

const HELP = `rp.mjs ${VERSION}: Lytics, Personalize and Contentstack writes. Output is JSON.
Bodies go on stdin with a quoted heredoc:  node .claude/skills/red-panda-customer-insights/scripts/rp.mjs <command> <<'JSON' {...} JSON

Setup     doctor | version | keys-import <file> | login (a person runs this in Terminal)
Lytics    lytics-audiences | lytics-audience <slug|id> | lytics-audience-size <slug|id> | lytics-profile [field] <value>
          lytics-create-audience {name, segment_ql, is_public?, slug?, description?}
          lytics-update-audience {audience, is_public?, name?, segment_ql?, description?}
          lytics-delete-audience <slug|id> | lytics-send <stream> {record | [records]}
Personalize  personalize-audiences | personalize-experiences | personalize-experience <name|uid>
          personalize-create-experience {name, audience | variants:[{name, audience}], content_type?, activate?, description?}
          personalize-add-variant {experience, audience, name?, content_type?, activate?}
          personalize-set-status <name|uid> ACTIVE|PAUSED | personalize-delete-experience <name|uid>
          personalize-create-events {events:[{key, description?}]}
CMS       cms-entry <content_type> <uid>
          cms-create-variant {content_type, entry, experience, variant?, fields}
          cms-publish-variant {content_type, entry, experience, variant?, environments?, allow_base_draft?}
          cms-unpublish-variant | cms-delete-variant {content_type, entry, experience, variant?}
          cms-create-entry {content_type, fields} | cms-update-entry {content_type, entry, fields}
          cms-publish-entry {content_type, entry, environments?} | cms-delete-entry <content_type> <uid>
Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 needs a person's decision (nothing changed)`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") { process.stdout.write(HELP + "\n"); return 0; }
  const creds = createCredentials();
  try {
    if (!Object.hasOwn(COMMANDS, command)) throw new RpError(`Unknown command: ${command}`, { code: 2, hint: "Run help for the list." });
    const { positional, flags } = parseArgs(rest);
    const input = BODY_REQUIRED.has(command)
      ? await readInput(flags)
      : BODY_OPTIONAL.has(command) && positional.length === 0 ? await readInput(flags, { required: false }) : {};
    const result = await runCommand(command, { input, positional, flags }, creds);
    process.stdout.write(redact(JSON.stringify(result), creds.secrets()) + "\n");
    return 0;
  } catch (err) {
    const out = { error: err.message, ...(err.hint ? { hint: err.hint } : {}), ...(err.code === 3 && err.details ? { details: err.details } : {}), ...(err.code === 2 && err.details ? { details: err.details } : {}) };
    process.stderr.write(redact(JSON.stringify(out), creds.secrets()) + "\n");
    return err instanceof RpError ? err.code : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
