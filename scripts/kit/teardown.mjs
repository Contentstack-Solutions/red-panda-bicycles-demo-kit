// teardown: removes everything setup created, in reverse order, from .kit/state.json. Anything
// that was already in your accounts (adopted environments, languages, audiences, Brand Kit
// items, experiences, event keys, and the Brand Kit itself) is never deleted; it's listed as a
// step for you to do by hand if you want. A dry run unless you pass --yes.
// Usage: npm run kit:teardown            print the full ordered plan and any warnings; changes nothing
//        npm run kit:teardown -- --yes   delete, recording each deletion in .kit/state.json
// A re-run skips what's already deleted. On an error it stops and prints what's left. When every
// step is done, .kit/state.json is moved to .kit/state.torn-down-<time>.json.
// Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 a kit container holds content
// the kit didn't create (nothing of it was deleted).
import { fileURLToPath } from "node:url";
import { KitError, publishEnvironmentNames, requireEnv } from "./lib/env.mjs";
import { createCma } from "./lib/cma.mjs";
import { archiveKitState, loadKitState, saveKitState } from "./lib/state.mjs";
import { brandkitAuth, createApi } from "./lib/brandkitPhase.mjs";
import { LOGIN_HINT } from "./lib/personalizePhase.mjs";
import { putAccountSetting } from "./lib/lyticsPhase.mjs";
import {
  LYTICS_LIMITS_NOTE, MODELS_FIRST, allDone, describeForeign, describeManual, describeTeardown,
  findForeignContents, planTeardown, remainingContentTypes, runTeardown, teardownNeeds,
} from "./lib/ops.mjs";
import { clients, createCredentials, redact, runCommand } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

const USAGE = "Usage: npm run kit:teardown [-- --yes]";

export function parseArgs(argv) {
  const out = { yes: false };
  for (const a of argv) {
    if (a === "--yes") out.yes = true;
    else if (a === "--dry-run") out.yes = false;
    else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: USAGE });
  }
  return out;
}

const makeCma = (env) => {
  const v = requireEnv(["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN"], env);
  return createCma({ apiKey: v.CONTENTSTACK_API_KEY, managementToken: v.CONTENTSTACK_MANAGEMENT_TOKEN, host: env.CONTENTSTACK_MANAGEMENT_HOST || "api.contentstack.io", branch: env.CONTENTSTACK_BRANCH || "main" });
};

// Clients for the kinds of step still to do. Every credential is checked before the first call.
function buildDeps(steps, state, env, deps, getCreds) {
  const needs = teardownNeeds(steps, state);
  const d = { brandKitUid: env.BRAND_KIT_UID };
  const authtoken = () => {
    const creds = getCreds();
    if (!creds.has("CONTENTSTACK_AUTHTOKEN")) throw new KitError("No Contentstack authtoken is stored for the kit.", { code: 2, hint: LOGIN_HINT.replace("kit:personalize", "kit:teardown") });
    return creds;
  };
  if (needs.cma || needs.personalize) d.cma = deps.cma ?? makeCma(env);
  if (needs.personalize) {
    if (!deps.runCommand || !deps.personalize) {
      requireEnv(["CONTENTSTACK_API_KEY", "CONTENTSTACK_PERSONALIZE_PROJECT_UID"], env);
      authtoken();
    }
    d.personalize = deps.personalize ?? clients(getCreds()).personalize;
  }
  if (needs.lytics && !deps.runCommand) requireEnv(["LYTICS_ACCESS_TOKEN"], env);
  if (needs.lyticsSettings) {
    // R35: restores api_whitelist_fields with a bare-array PUT.
    if (!deps.lyticsSetting) {
      const { LYTICS_ACCESS_TOKEN: token } = requireEnv(["LYTICS_ACCESS_TOKEN"], env);
      d.lyticsSetting = (name, value) => putAccountSetting(name, value, { token });
    } else d.lyticsSetting = deps.lyticsSetting;
  }
  if (needs.personalize || needs.lytics) d.runCommand = deps.runCommand ?? ((name, opts) => runCommand(name, opts, getCreds()));
  if (needs.brandkit) {
    if (!deps.brandkitApi) {
      const v = requireEnv(["BRAND_KIT_UID", "CONTENTSTACK_ORGANIZATION_UID"], env);
      // R32: an OAuth token (CONTENTSTACK_OAUTH_TOKEN) goes in Authorization: Bearer; else the authtoken.
      const auth = brandkitAuth(getCreds(), { organizationUid: v.CONTENTSTACK_ORGANIZATION_UID, brandKitUid: v.BRAND_KIT_UID }) ?? authtoken();
      d.brandkitApi = createApi({ fetch: globalThis.fetch, headers: auth.headers });
    } else d.brandkitApi = deps.brandkitApi;
    if (!d.brandKitUid) requireEnv(["BRAND_KIT_UID"], env);
  }
  return d;
}

// Dry run (R24): what the container check would find now, with GETs only. Kit entries and assets
// are still there, so they're left out of the counts.
async function dryRunWarnings(state, cma) {
  const lines = [];
  const foreign = await findForeignContents(state, cma);
  if (foreign.length) {
    lines.push(`Warning: these kit containers hold content the kit didn't create, so --yes would stop (exit 3) before deleting any container:\n${describeForeign(foreign)}`);
  }
  const kitLocales = (state.created?.locales ?? []).filter((c) => !(state.adopted?.locales ?? []).includes(c) && c !== "en");
  if (kitLocales.length) {
    const kitCts = new Set(state.created?.contentTypes ?? []);
    const others = (await remainingContentTypes(cma)).filter((uid) => !kitCts.has(uid));
    if (others.length) lines.push(`Warning: language ${kitLocales.join(", ")} will be kept (a step for you): the stack has content types the kit didn't create (${others.join(", ")}).`);
  }
  return lines;
}

export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  let creds = deps.creds ?? null;
  const getCreds = () => (creds ??= createCredentials());
  const secrets = () => [env.LYTICS_ACCESS_TOKEN, env.CONTENTSTACK_MANAGEMENT_TOKEN, env.CONTENTSTACK_AUTHTOKEN, env.CONTENTSTACK_API_KEY, ...(creds?.secrets?.() ?? [])];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets()));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets()));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    const state = loadKitState(statePath);
    const steps = planTeardown(state, { envNames: publishEnvironmentNames(env) });
    if (!args.yes) {
      out(`Dry run: npm run kit:teardown -- --yes would do the following.\n${describeTeardown(steps, state)}`);
      if (steps.some((s) => s.kind === "check-containers")) {
        let cma = deps.cma;
        try { cma ??= makeCma(env); } catch { cma = null; }
        if (cma) for (const w of await dryRunWarnings(state, cma)) out(w);
        else out("Warning: couldn't check the kit's content types and folders for other content (set CONTENTSTACK_API_KEY and CONTENTSTACK_MANAGEMENT_TOKEN); --yes checks before deleting any of them.");
      }
      out(LYTICS_LIMITS_NOTE);
      out("Nothing was changed. Run again with --yes to delete.");
      return 0;
    }
    out(LYTICS_LIMITS_NOTE);
    const d = buildDeps(steps, state, env, deps, getCreds);
    try {
      await runTeardown({ steps, state, deps: d, save: (s) => saveKitState(s, statePath), log: out });
    } catch (e) {
      if (e instanceof KitError && e.details?.remaining) {
        err([e.message, e.hint].filter(Boolean).join("\n"));
        if (e.details.failedKind === "audience-delete") err(MODELS_FIRST);
        err(`Still to do (${e.details.remaining.length}):\n${e.details.remaining.map((l) => `  - ${l}`).join("\n")}`);
        const manual = describeManual(steps);
        if (manual) err(manual);
        err("Fix the error and re-run npm run kit:teardown -- --yes; finished steps are skipped.");
        return e.code;
      }
      throw e;
    }
    out("Teardown done.");
    const manual = describeManual(steps);
    if (manual) out(manual.replace(/^By hand:/, "Still to do by hand:"));
    if (allDone(steps, state) && Object.keys(state.tornDown ?? {}).length) {
      const archived = archiveKitState(statePath);
      out(`Moved ${statePath} to ${archived}, so a fresh setup starts clean.`);
    }
    return 0;
  } catch (e) {
    if (e instanceof KitError) {
      err([e.message, e.hint].filter(Boolean).join("\n"));
      return e.code;
    }
    err(`Error: ${e?.stack ?? e}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
