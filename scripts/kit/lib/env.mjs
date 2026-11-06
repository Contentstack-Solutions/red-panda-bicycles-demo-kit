// Shared env helpers for the kit scripts. Exit codes: 1 error, 2 missing input
// or credential, 3 needs a person's decision (nothing changed).
export class KitError extends Error {
  constructor(message, { code = 1, hint, details } = {}) {
    super(message);
    this.name = "KitError";
    this.code = code;
    if (hint !== undefined) this.hint = hint;
    if (details !== undefined) this.details = details;
  }
}

// The one place the persona email is validated and normalized. Lytics UI search
// breaks on "+", and identify must match the seeded profile exactly.
export function personaEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email) {
    throw new KitError("DEMO_PERSONA_EMAIL is empty", { code: 2, hint: "Set DEMO_PERSONA_EMAIL in .env.local." });
  }
  if (!email.includes("@")) {
    throw new KitError(`DEMO_PERSONA_EMAIL "${email}" is not an email address`, { code: 2 });
  }
  if (email.includes("+")) {
    throw new KitError(`DEMO_PERSONA_EMAIL "${email}" contains "+"`, {
      code: 2,
      hint: "Use an address without a plus tag; Lytics search breaks on it.",
    });
  }
  return email;
}

export function requireEnv(names, env = process.env) {
  const missing = names.filter((n) => !String(env[n] ?? "").trim());
  if (missing.length) {
    throw new KitError(`Missing required environment variable(s): ${missing.join(", ")}`, {
      code: 2,
      hint: "Add them to .env.local (see .env.example).",
      details: { missing },
    });
  }
  return Object.fromEntries(names.map((n) => [n, env[n]]));
}

// Ruling R19: environment names the setup publishes to (and rp.mjs publishes variants to).
// CONTENTSTACK_PUBLISH_ENVIRONMENTS (comma-separated), else CONTENTSTACK_ENVIRONMENT, else preview.
export function publishEnvironmentNames(env = process.env) {
  const split = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const listed = split(env.CONTENTSTACK_PUBLISH_ENVIRONMENTS);
  if (listed.length) return listed;
  const site = split(env.CONTENTSTACK_ENVIRONMENT);
  return site.length ? site : ["preview"];
}

// Ruling R34: API hosts the kit can't derive from CONTENTSTACK_REGION. Defaults are the US hosts;
// other regions set the overrides (the exact non-US names are untested, so none are guessed).
// Read when called, so .env.local (loaded by rp.mjs) and tests can set them first.
export const API_HOSTS = {
  personalize: { env: "CONTENTSTACK_PERSONALIZE_API_HOST", fallback: "personalize-api.contentstack.com" },
  brandkit: { env: "CONTENTSTACK_BRANDKIT_API_HOST", fallback: "brand-kits-api.contentstack.com" },
  ai: { env: "CONTENTSTACK_AI_HOST", fallback: "ai.contentstack.com" },
};

/** "https://<host>" for "personalize", "brandkit" or "ai". */
export function apiBase(kind, env = process.env) {
  const spec = API_HOSTS[kind];
  if (!spec) throw new KitError(`Unknown API "${kind}"`);
  const host = String(env[spec.env] ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || spec.fallback;
  return `https://${host}`;
}

const US_REGIONS = new Set(["", "us", "na", "aws-na"]);

/** Host variables still unset when CONTENTSTACK_REGION names a non-US region (doctor warns). */
export function nonUsRegionWithoutHosts(env = process.env) {
  if (US_REGIONS.has(String(env.CONTENTSTACK_REGION ?? "").trim().toLowerCase())) return [];
  return Object.values(API_HOSTS).map((h) => h.env).filter((n) => !String(env[n] ?? "").trim());
}
