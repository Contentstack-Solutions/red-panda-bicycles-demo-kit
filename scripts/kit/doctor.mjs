// doctor: checks every key, app and connection before a phase writes anything.
// Usage: node --env-file=.env.local scripts/kit/doctor.mjs [--phase <name>]
// Exit 0 when all checks pass, 2 when any fail. Results never contain secret values.
import { fileURLToPath } from "node:url";
import { KitError, apiBase, nonUsRegionWithoutHosts, personaEmail, requireEnv } from "./lib/env.mjs";
import { createCma } from "./lib/cma.mjs";
import { createCredentials } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

export const COMMERCE_EXTENSION_TITLES = ["RP Commerce Products", "RP Commerce Category"];

const CORE_ENV = [
  "CONTENTSTACK_API_KEY",
  "CONTENTSTACK_MANAGEMENT_TOKEN",
  "CONTENTSTACK_DELIVERY_TOKEN",
  "CONTENTSTACK_ENVIRONMENT",
  "SITE_URL",
  "DEMO_PERSONA_EMAIL",
];

// Environment variables each phase needs.
export const PHASE_ENV = {
  keys: CORE_ENV,
  contentstack: CORE_ENV,
  commerce: ["RED_PANDA_COMMERCE_API_URL", "RED_PANDA_COMMERCE_STPRE_ID", "RED_PANDA_COMMERCE_STPRE_TOKEN"],
  lytics: ["LYTICS_ACCESS_TOKEN", "LYTICS_TAG"],
  // The Contentstack authtoken isn't an env var: rp.mjs login stores it (keychain or ~/.red-panda/credentials.env).
  personalize: ["CONTENTSTACK_PERSONALIZE_PROJECT_UID"],
  brandkit: ["BRAND_KIT_UID", "CONTENTSTACK_ORGANIZATION_UID"],
  site: CORE_ENV,
};

// Which checks each phase needs, in run order. Later tasks and the setup skill rely on this.
export const PHASE_CHECKS = {
  keys: ["node", "env", "cma", "delivery-token", "persona"],
  commerce: ["node", "env", "commerce-app", "commerce-store"],
  contentstack: ["node", "env", "cma", "delivery-token", "commerce-app", "persona"],
  lytics: ["node", "env", "lytics", "persona"],
  personalize: ["node", "env", "region-hosts", "personalize"],
  brandkit: ["node", "env", "region-hosts"],
  site: ["node", "env", "delivery-token", "persona", "personalize-uid"],
};

const CHECK_ORDER = ["node", "env", "region-hosts", "cma", "delivery-token", "commerce-app", "commerce-store", "lytics", "personalize", "persona", "personalize-uid"];
const MARKETPLACE_PATH = "Contentstack → Marketplace → Apps → install RP Commerce in this stack (ask the app owner for access)";
const LOGIN_FIX = "Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it stores a fresh token for the kit), then re-run.";

const pass = (name, detail) => ({ name, ok: true, detail });
// A warning never fails doctor (exit 0); it's shown with "!".
const warn = (name, detail, fix) => ({ name, ok: true, warn: true, detail, ...(fix ? { fix } : {}) });
const fail = (name, detail, fix) => ({ name, ok: false, detail, ...(fix ? { fix } : {}) });
const errText = (e) => (e?.details?.status ? `HTTP ${e.details.status}` : "request failed");

function missingEnv(names) {
  try {
    requireEnv(names);
    return null;
  } catch (e) {
    return e.details?.missing ?? names;
  }
}

function needs(name, names, fix) {
  const missing = missingEnv(names);
  return missing ? fail(name, `needs ${missing.join(", ")}`, fix ?? "Add them to .env.local (see .env.example).") : null;
}

function cmaFor(ctx) {
  return createCma({
    apiKey: process.env.CONTENTSTACK_API_KEY,
    managementToken: process.env.CONTENTSTACK_MANAGEMENT_TOKEN,
    host: process.env.CONTENTSTACK_MANAGEMENT_HOST || "api.contentstack.io",
    branch: process.env.CONTENTSTACK_BRANCH || "main",
    fetchImpl: ctx.fetchImpl,
    sleep: ctx.sleep ?? (async () => {}),
  });
}

const CMA_ENV = ["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN"];

const CHECKS = {
  node: async (ctx) => {
    const v = ctx.nodeVersion ?? process.versions.node;
    const [maj, min] = v.split(".").map(Number);
    return maj > 20 || (maj === 20 && min >= 6)
      ? pass("node", `Node ${v}`)
      : fail("node", `Node ${v} is older than 20.6`, "Install Node 20.6 or newer (https://nodejs.org), then re-run.");
  },

  env: async (ctx) => {
    const phases = ctx.phase ? [ctx.phase] : Object.keys(PHASE_ENV);
    const names = [...new Set(phases.flatMap((p) => PHASE_ENV[p]))];
    const missing = missingEnv(names);
    return missing
      ? fail("env", `missing: ${missing.join(", ")}`, "Add them to .env.local; .env.example says where to find each one.")
      : pass("env", `${names.length} variables set`);
  },

  cma: async (ctx) => {
    const bad = needs("cma", CMA_ENV);
    if (bad) return bad;
    const cma = cmaFor(ctx);
    const fix = "Create a management token with write access: Contentstack → Settings → Tokens → Management Tokens, and check CONTENTSTACK_API_KEY.";
    try {
      if ((await cma.get("/content_types", { limit: 1 })) === null) return fail("cma", "content_types not readable", fix);
      if ((await cma.get("/stacks")) === null) return fail("cma", "management token cannot read the stack (write scope?)", fix);
      return pass("cma", "management token can read the stack; write access is confirmed by the import");
    } catch (e) {
      return fail("cma", `management API ${errText(e)}`, fix);
    }
  },

  "delivery-token": async (ctx) => {
    const bad = needs("delivery-token", ["CONTENTSTACK_API_KEY", "CONTENTSTACK_DELIVERY_TOKEN", "CONTENTSTACK_ENVIRONMENT"]);
    if (bad) return bad;
    const fix = "Check CONTENTSTACK_DELIVERY_TOKEN and that its environment matches CONTENTSTACK_ENVIRONMENT (Contentstack → Settings → Tokens → Delivery Tokens).";
    const host = process.env.CONTENTSTACK_HOST || "cdn.contentstack.io";
    const url = `https://${host}/v3/content_types?limit=1&environment=${encodeURIComponent(process.env.CONTENTSTACK_ENVIRONMENT)}`;
    try {
      const res = await ctx.fetchImpl(url, {
        headers: { api_key: process.env.CONTENTSTACK_API_KEY, access_token: process.env.CONTENTSTACK_DELIVERY_TOKEN },
      });
      return res.status === 200
        ? pass("delivery-token", `reads environment ${process.env.CONTENTSTACK_ENVIRONMENT}`)
        : fail("delivery-token", `delivery API returned ${res.status}`, fix);
    } catch {
      return fail("delivery-token", "delivery API unreachable", fix);
    }
  },

  "commerce-app": async (ctx) => {
    const bad = needs("commerce-app", CMA_ENV);
    if (bad) return bad;
    try {
      const body = await cmaFor(ctx).get("/extensions", { include_marketplace_extensions: "true" });
      const titles = new Set((body?.extensions ?? []).map((x) => x.title));
      const missing = COMMERCE_EXTENSION_TITLES.filter((t) => !titles.has(t));
      return missing.length
        ? fail("commerce-app", `missing extension(s): ${missing.join(", ")}`, `Missing ${missing.join(", ")}. ${MARKETPLACE_PATH}`)
        : pass("commerce-app", `found ${COMMERCE_EXTENSION_TITLES.join(", ")}`);
    } catch (e) {
      return fail("commerce-app", `extensions lookup ${errText(e)}`, MARKETPLACE_PATH);
    }
  },

  "commerce-store": async (ctx) => {
    const bad = needs("commerce-store", PHASE_ENV.commerce);
    if (bad) return bad;
    const url = `${process.env.RED_PANDA_COMMERCE_API_URL}/api/public/store/${process.env.RED_PANDA_COMMERCE_STPRE_ID}/categories/categoryByUrl?url=/e-bikes`;
    const token = process.env.RED_PANDA_COMMERCE_STPRE_TOKEN;
    const fix = "Check RED_PANDA_COMMERCE_API_URL, RED_PANDA_COMMERCE_STPRE_ID and RED_PANDA_COMMERCE_STPRE_TOKEN (ask the RP Commerce app owner).";
    try {
      const res = await ctx.fetchImpl(url, { headers: { Authorization: token, "x-store-token": token } });
      return res.status >= 200 && res.status < 300
        ? pass("commerce-store", "store reachable")
        : fail("commerce-store", `store returned ${res.status}`, fix);
    } catch {
      return fail("commerce-store", "store unreachable", fix);
    }
  },

  lytics: async (ctx) => {
    const bad = needs("lytics", ["LYTICS_ACCESS_TOKEN"]);
    if (bad) return bad;
    const fix = "Create an admin access token: Lytics → Account → Access Tokens, and put it in LYTICS_ACCESS_TOKEN.";
    try {
      const res = await ctx.fetchImpl("https://api.lytics.io/api/account", { headers: { Authorization: process.env.LYTICS_ACCESS_TOKEN } });
      return res.status === 200 ? pass("lytics", "access token valid") : fail("lytics", `Lytics returned ${res.status}`, fix);
    } catch {
      return fail("lytics", "Lytics unreachable", fix);
    }
  },

  personalize: async (ctx) => {
    const bad = needs("personalize", PHASE_ENV.personalize);
    if (bad) return bad;
    const uid = process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID;
    const creds = ctx.creds ?? createCredentials();
    if (!creds.has("CONTENTSTACK_AUTHTOKEN")) return fail("personalize", "no Contentstack authtoken stored", LOGIN_FIX);
    try {
      const res = await ctx.fetchImpl(`${apiBase("personalize")}/projects/${encodeURIComponent(uid)}`, {
        headers: { authtoken: creds.get("CONTENTSTACK_AUTHTOKEN"), "x-project-uid": uid },
      });
      if (res.status === 200) return pass("personalize", "authtoken valid, project found");
      if (res.status === 401) return fail("personalize", "Personalize returned 401 (authtoken expired or wrong)", LOGIN_FIX);
      return fail("personalize", `Personalize returned ${res.status}`, "Check CONTENTSTACK_PERSONALIZE_PROJECT_UID (Personalize → project → Settings). " + LOGIN_FIX);
    } catch {
      return fail("personalize", "Personalize unreachable", LOGIN_FIX);
    }
  },

  // Ruling R34: the Personalize and Brand Kit hosts default to the US ones; other regions set them.
  "region-hosts": async () => {
    const unset = nonUsRegionWithoutHosts();
    return unset.length
      ? warn("region-hosts", `Non-US regions: set the Personalize/Brand Kit hosts for your region (untested). Unset: ${unset.join(", ")}`,
          "Set them in .env.local to your region's hosts (see .env.example).")
      : pass("region-hosts", "Personalize and Brand Kit hosts match the region");
  },

  // Ruling R37: the site reads the Personalize project UID from CONTENTSTACK_PERSONALIZATION.
  "personalize-uid": async () => {
    const site = String(process.env.CONTENTSTACK_PERSONALIZATION ?? "").trim();
    const project = String(process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID ?? "").trim();
    const fix = "Set CONTENTSTACK_PERSONALIZATION to your Personalize project UID, the same value as CONTENTSTACK_PERSONALIZE_PROJECT_UID, in .env.local and in Launch's environment variables (then redeploy).";
    if (!site) return fail("personalize-uid", "CONTENTSTACK_PERSONALIZATION is not set", fix);
    if (site.toLowerCase() === "true") return fail("personalize-uid", 'CONTENTSTACK_PERSONALIZATION is "true", not a project UID', fix);
    if (project && site !== project) return fail("personalize-uid", "CONTENTSTACK_PERSONALIZATION differs from CONTENTSTACK_PERSONALIZE_PROJECT_UID", fix);
    return pass("personalize-uid", "the site reads the Personalize project UID");
  },

  persona: async () => {
    const bad = needs("persona", ["DEMO_PERSONA_EMAIL"]);
    if (bad) return bad;
    try {
      return pass("persona", `persona email ok (${personaEmail(process.env.DEMO_PERSONA_EMAIL).replace(/^.*@/, "…@")})`);
    } catch (e) {
      return fail("persona", e.message, e.hint ?? "Fix DEMO_PERSONA_EMAIL in .env.local.");
    }
  },
};

export async function runChecks(ctx = {}) {
  const { phase } = ctx;
  if (phase !== undefined && !PHASE_CHECKS[phase]) {
    throw new KitError(`Unknown phase "${phase}"`, { code: 2, hint: `Use one of: ${Object.keys(PHASE_CHECKS).join(", ")}` });
  }
  const full = { ...ctx, fetchImpl: ctx.fetchImpl ?? fetch };
  const wanted = phase ? new Set(PHASE_CHECKS[phase]) : new Set(CHECK_ORDER);
  const results = [];
  for (const name of CHECK_ORDER) if (wanted.has(name)) results.push(await CHECKS[name](full));
  return results;
}

export function formatTable(results) {
  const w = Math.max(...results.map((r) => r.name.length));
  return results
    .map((r) => `${r.ok ? (r.warn ? "!" : "✓") : "✗"} ${r.name.padEnd(w)}  ${r.detail}${(r.ok && !r.warn) || !r.fix ? "" : `\n  ${" ".repeat(w)}  fix: ${r.fix}`}`)
    .join("\n");
}

async function main(argv) {
  const i = argv.indexOf("--phase");
  const phase = i >= 0 ? argv[i + 1] : undefined;
  try {
    const results = await runChecks({ phase });
    console.log(formatTable(results));
    process.exit(results.every((r) => r.ok) ? 0 : 2);
  } catch (e) {
    console.error(e instanceof KitError ? `${e.message}${e.hint ? `\n${e.hint}` : ""}` : e.message);
    process.exit(e instanceof KitError ? e.code : 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
