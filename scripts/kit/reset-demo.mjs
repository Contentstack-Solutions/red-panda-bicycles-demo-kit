// reset-demo: undoes what a live demo run creates. Lists the Lytics audiences and Personalize
// experiences created after a point in time that aren't the kit's own, and with --yes deletes
// them (Personalize first: entry variants unpublished and deleted, then the experience; then
// Lytics). Objects with no creation time are listed for you to check and never deleted.
// Usage:
//   npm run kit:reset -- --mark                 record "now" before a demo
//   npm run kit:reset [-- --since <ISO>] [-- --dry-run]   list (default since: the last --mark)
//   npm run kit:reset -- [--since <ISO>] --yes  delete what it lists
// Exit codes: 0 ok · 1 error · 2 missing input or credential (e.g. an expired authtoken).
import { fileURLToPath } from "node:url";
import { KitError, publishEnvironmentNames, requireEnv } from "./lib/env.mjs";
import { createCma } from "./lib/cma.mjs";
import { loadKitState, saveKitState } from "./lib/state.mjs";
import { LOGIN_HINT } from "./lib/personalizePhase.mjs";
import { asKitError, describeReset, planReset, runReset } from "./lib/ops.mjs";
import { clients, createCredentials, redact, runCommand } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

const USAGE = "Usage: npm run kit:reset -- [--mark | --since <ISO>] [--yes | --dry-run]";

export function parseArgs(argv) {
  const out = { mark: false, since: null, yes: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mark") out.mark = true;
    else if (a === "--yes") out.yes = true;
    else if (a === "--dry-run") out.dryRun = true; // list only, the same as leaving out --yes
    else if (a === "--since") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new KitError("--since needs an ISO date, e.g. 2026-11-05T09:00:00Z", { code: 2, hint: USAGE });
      out.since = v;
    } else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: USAGE });
  }
  if (out.yes && out.dryRun) throw new KitError("--yes and --dry-run can't be combined", { code: 2, hint: USAGE });
  if (out.mark && (out.since || out.yes || out.dryRun)) throw new KitError("--mark can't be combined with --since, --yes or --dry-run", { code: 2, hint: USAGE });
  return out;
}

export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  let creds = deps.creds ?? null;
  const secrets = () => [env.LYTICS_ACCESS_TOKEN, env.CONTENTSTACK_MANAGEMENT_TOKEN, env.CONTENTSTACK_AUTHTOKEN, ...(creds?.secrets?.() ?? [])];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets()));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets()));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    const state = loadKitState(statePath);
    if (args.mark) {
      state.lastMark = (deps.now?.() ?? new Date()).toISOString();
      saveKitState(state, statePath);
      out(`Marked ${state.lastMark}. After the demo, run npm run kit:reset to list what it created.`);
      return 0;
    }
    const since = args.since ?? state.lastMark;
    if (!since) throw new KitError("No --since given and no mark recorded.", { code: 2, hint: "Run npm run kit:reset -- --mark before a demo, or pass --since <ISO>." });

    const getRp = () => {
      creds ??= createCredentials();
      requireEnv(["CONTENTSTACK_PERSONALIZE_PROJECT_UID"], env);
      if (!creds.has("CONTENTSTACK_AUTHTOKEN")) throw new KitError("No Contentstack authtoken is stored for the kit.", { code: 2, hint: LOGIN_HINT.replace("kit:personalize", "kit:reset") });
      return clients(creds);
    };
    const listAudiences = deps.listAudiences ?? (async () => getRp().lytics("GET", "/api/segment", { query: { table: "user" } }));
    const listExperiences = deps.listExperiences ?? (async () => getRp().personalize("GET", "/experiences"));
    let audiences;
    let experiences;
    try {
      experiences = (await listExperiences()) ?? [];
      audiences = (await listAudiences()) ?? [];
    } catch (e) {
      throw asKitError(e, "list");
    }
    const plan = planReset({ since, audiences, experiences, state });
    out(describeReset(plan, since));
    if (!plan.audiences.length && !plan.experiences.length) {
      out("Nothing to delete.");
      return 0;
    }
    if (!args.yes) {
      out(`${args.dryRun ? "Dry run: nothing" : "Nothing"} was changed. Run again with --yes to delete the objects listed above.`);
      return 0;
    }
    const cma = deps.cma ?? (() => {
      const v = requireEnv(["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN"], env);
      return createCma({ apiKey: v.CONTENTSTACK_API_KEY, managementToken: v.CONTENTSTACK_MANAGEMENT_TOKEN, host: env.CONTENTSTACK_MANAGEMENT_HOST || "api.contentstack.io", branch: env.CONTENTSTACK_BRANCH || "main" });
    })();
    const run = deps.runCommand ?? (getRp(), (name, opts) => runCommand(name, opts, creds));
    await runReset({ plan, state, runCommand: run, cma, envNames: publishEnvironmentNames(env), log: out });
    out("Reset done. Run npm run kit:verify to re-check the persona's audience and the counts.");
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
