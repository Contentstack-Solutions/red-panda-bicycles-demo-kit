// setup-personalize: builds the persona's personalized homepage hero in your Personalize
// project and stack. Makes the Lytics audience public, waits for it in Personalize, creates and
// activates the experience, writes and publishes the hero entry variant, and creates the event keys.
// Usage: npm run kit:personalize [-- --dry-run]
// Needs a Contentstack authtoken stored by `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login`
// (run it in Terminal; it goes to the keychain or ~/.red-panda/credentials.env, not .env.local). Resumable: progress is saved to .kit/state.json; re-running skips completed steps.
// Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 needs a person's decision.
import { fileURLToPath } from "node:url";
import { KitError, requireEnv } from "./lib/env.mjs";
import { assertNotTornDown, loadKitState, saveKitState } from "./lib/state.mjs";
import { LOGIN_HINT, PERSONALIZE_STEPS, loadPersonalizeSeed, planPersonalize, runPersonalizePhase } from "./lib/personalizePhase.mjs";
import { DEFAULTS, createCredentials, redact, runCommand } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

// The authtoken is not here: it comes from rp.mjs's credential store (ruling R17).
const REQUIRED = ["CONTENTSTACK_API_KEY", "CONTENTSTACK_PERSONALIZE_PROJECT_UID", "LYTICS_ACCESS_TOKEN"];

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: "Usage: npm run kit:personalize -- [--dry-run]" });
  }
  return out;
}

export function describePlan(plan, state) {
  const done = (s) => (state.personalize?.steps?.[s]?.done ? "done" : "to do");
  const lines = [
    `1. Make Lytics audience ${plan.audiences.join(", ")} public [${done("makePublic")}]`,
    `2. Wait up to 5 min for it to appear in Personalize [${done("audienceSync")}]`,
    ...plan.experiences.map((e) => `3. Create and activate experience "${e.name}" with variant(s) ${e.variants.map((v) => `"${v.name}" → ${v.audience}`).join(", ")} on ${e.content_types.join(", ")} [${done("experience")}]`),
    ...plan.variants.map((v) => `4. Write variant "${v.variant}" on ${v.content_type} entry ${v.entry}: ${Object.keys(v.fields).join(", ")} [${done("variant")}]`),
    `5. Publish it to ${DEFAULTS.environments.join(", ")} [${done("publish")}]`,
    `6. Create event keys ${plan.events.map((e) => e.key).join(", ")} [${done("events")}]`,
  ];
  return lines.join("\n");
}

export async function main(argv, deps = {}) {
  const env = process.env;
  const creds = deps.creds ?? createCredentials();
  const secrets = () => [env.CONTENTSTACK_AUTHTOKEN, env.CONTENTSTACK_MANAGEMENT_TOKEN, env.LYTICS_ACCESS_TOKEN, ...creds.secrets()];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets()));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets()));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    assertNotTornDown(loadKitState(statePath), statePath); // ruling R25
    const seed = loadPersonalizeSeed(deps.seedPath);
    const state = loadKitState(statePath);
    const plan = planPersonalize(seed, state);
    if (args.dryRun) {
      out(`Dry run: npm run kit:personalize would:\n${describePlan(plan, state)}\nNothing was changed.`);
      return 0;
    }
    requireEnv(REQUIRED);
    if (!creds.has("CONTENTSTACK_AUTHTOKEN")) {
      throw new KitError("No Contentstack authtoken is stored for the kit.", { code: 2, hint: LOGIN_HINT });
    }
    await runPersonalizePhase({
      runCommand: deps.runCommand ?? ((name, opts) => runCommand(name, opts, creds)),
      seed,
      state,
      save: (s) => saveKitState(s, statePath),
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      clock: deps.clock ?? (() => Date.now()),
      log: out,
      warn: (m) => out(`Warning: ${m}`),
    });
    out(`Done. ${PERSONALIZE_STEPS.length} Personalize steps complete; progress saved in ${statePath}.`);
    return 0;
  } catch (e) {
    if (e instanceof KitError) {
      const details = e.details && e.code === 3 ? `\n${JSON.stringify(e.details, null, 2)}` : "";
      err([e.message + details, e.hint].filter(Boolean).join("\n"));
      return e.code;
    }
    err(`Error: ${e?.stack ?? e}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
