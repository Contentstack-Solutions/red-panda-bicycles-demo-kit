// configure-lytics: applies Lytics account settings, runs the seeder steps, waits for
// audiences and lookalike models, and records your measured audience counts.
// Usage: npm run kit:lytics [-- --dry-run] [-- --now <ISO>]
// Resumable: progress is saved to .kit/state.json; re-running skips completed steps.
// Never passes --repin or --resend to the seeder.
// Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 needs a person's decision.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KitError, requireEnv } from "./lib/env.mjs";
import { assertNotTornDown, loadKitState, saveKitState } from "./lib/state.mjs";
import { LYTICS_STEPS, applyAccountSettings, assertSiteUrl, audienceSize, runLyticsPhase, spawnSeeder } from "./lib/lyticsPhase.mjs";
import { redact } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

export function parseArgs(argv) {
  const out = { dryRun: false, now: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--now") {
      const v = argv[++i];
      if (!v || v.startsWith("--") || Number.isNaN(Date.parse(v))) throw new KitError("--now needs an ISO timestamp", { code: 2 });
      out.now = v;
    } else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: "Usage: npm run kit:lytics -- [--dry-run] [--now <ISO>]" });
  }
  return out;
}

export async function main(argv, deps = {}) {
  const env = process.env;
  const secrets = [env.LYTICS_ACCESS_TOKEN];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    assertNotTornDown(loadKitState(statePath), statePath); // ruling R25
    assertSiteUrl(env.SITE_URL);
    const { LYTICS_ACCESS_TOKEN: token } = requireEnv(["LYTICS_ACCESS_TOKEN"]);
    if (args.dryRun) {
      out(`Dry run: would apply Lytics account settings, then run ${LYTICS_STEPS.join(" → ")}${args.now ? ` (load --now ${args.now})` : ""}, wait for audiences and models, and record your counts. Nothing was changed.`);
      return 0;
    }
    const settings = JSON.parse(readFileSync(deps.settingsPath ?? "seed/lytics/account-settings.json", "utf8"));
    const state = loadKitState(statePath);
    await runLyticsPhase({
      runStep: deps.runStep ?? spawnSeeder,
      sizeFn: deps.sizeFn ?? ((slug) => audienceSize(slug, { token })),
      applySettings: (opts) => applyAccountSettings({ token, settings, ...opts }),
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      clock: deps.clock ?? (() => Date.now()),
      siteUrl: env.SITE_URL,
      state,
      save: (s) => saveKitState(s, statePath),
      log: out,
      warn: (m) => out(`Warning: ${m}`),
      nowIso: args.now,
    });
    out(`Done. Lytics phase complete; your measured counts are saved in ${statePath}.`);
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
