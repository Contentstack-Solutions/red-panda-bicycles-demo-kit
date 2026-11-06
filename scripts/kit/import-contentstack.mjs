// import-contentstack: replays the committed snapshot (seed/contentstack/) into your stack.
// Usage: npm run kit:import [-- --dry-run] [-- --snapshot <dir>]
//   (node --env-file=.env.local scripts/kit/import-contentstack.mjs [--dry-run] [--snapshot <dir>])
// Resumable: progress is saved to .kit/state.json after every object; re-running skips what's done.
// Exit codes: 0 ok · 1 error · 2 missing input or credential (including: no publish environment
// exists, so nothing was published yet) · 3 needs a person's decision (the stack already has
// content the kit didn't create; nothing was changed).
// Never prints token values.
import { fileURLToPath } from "node:url";
import { KitError, requireEnv, publishEnvironmentNames } from "./lib/env.mjs";
import { createCma } from "./lib/cma.mjs";
import { loadSnapshot } from "./lib/importPlan.mjs";
import { runImport } from "./lib/importRun.mjs";
import { assertNotTornDown, loadKitState, saveKitState } from "./lib/state.mjs";
import { redact } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

export function parseArgs(argv) {
  const out = { dryRun: false, snapshot: "seed/contentstack" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--snapshot") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new KitError("--snapshot needs a directory", { code: 2 });
      out.snapshot = v;
    } else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: "Usage: npm run kit:import -- [--dry-run] [--snapshot <dir>]" });
  }
  return out;
}

export function formatSummary(summary) {
  const w = Math.max(5, ...Object.keys(summary).map((p) => p.length));
  const rows = [`${"phase".padEnd(w)}  created  updated  skipped`];
  for (const [phase, c] of Object.entries(summary)) {
    rows.push(`${phase.padEnd(w)}  ${String(c.created).padStart(7)}  ${String(c.updated).padStart(7)}  ${String(c.skipped).padStart(7)}`);
  }
  return rows.join("\n");
}

export function formatError(e) {
  if (!(e instanceof KitError)) return `Error: ${e?.stack ?? e}`;
  const lines = [e.message];
  for (const c of e.details?.conflicts ?? []) lines.push(`  - ${c}`);
  for (const m of e.details?.missing ?? []) lines.push(`  - ${m}`);
  if (e.hint) lines.push(e.hint);
  return lines.join("\n");
}

/**
 * @param {string[]} argv
 * @param {{out?: (s: string) => void, err?: (s: string) => void, cma?: object, statePath?: string, readFile?: Function}} [deps]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, deps = {}) {
  const env = process.env;
  const secrets = [env.CONTENTSTACK_MANAGEMENT_TOKEN, env.CONTENTSTACK_API_KEY, env.CONTENTSTACK_DELIVERY_TOKEN, env.CONTENTSTACK_AUTHTOKEN];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    assertNotTornDown(loadKitState(statePath), statePath); // ruling R25
    const vars = requireEnv(["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN", "SITE_URL"]);
    const envNames = publishEnvironmentNames(env);
    const cma = deps.cma ?? createCma({
      apiKey: vars.CONTENTSTACK_API_KEY,
      managementToken: vars.CONTENTSTACK_MANAGEMENT_TOKEN,
      host: env.CONTENTSTACK_MANAGEMENT_HOST || "api.contentstack.io",
      branch: env.CONTENTSTACK_BRANCH || "main",
    });
    const snapshot = loadSnapshot(args.snapshot);
    const state = loadKitState(statePath);
    out(`${args.dryRun ? "Dry run: checking" : "Importing"} ${snapshot.dir} into stack (publish environments: ${envNames.join(", ")})`);
    const { state: next, summary, deferred = 0 } = await runImport({
      cma,
      snapshot,
      state,
      envNames,
      siteUrl: vars.SITE_URL,
      dryRun: args.dryRun,
      save: (s) => saveKitState(s, statePath),
      log: out,
      ...(deps.readFile ? { readFile: deps.readFile } : {}),
    });
    out(formatSummary(summary));
    if (args.dryRun) {
      out("Dry run: nothing was written. Run without --dry-run to import.");
      return 0;
    }
    if (deferred > 0) {
      // Finding I8: the phase isn't done while anything is left unpublished.
      throw new KitError(
        `Imported, but nothing was published: none of the publish environments (${envNames.join(", ")}) exists in the stack. ${deferred} publish step(s) are waiting.`,
        {
          code: 2,
          hint: "Create the environment in Contentstack (Settings → Environments; see docs/manual-steps.md §2), or set CONTENTSTACK_ENVIRONMENT / CONTENTSTACK_PUBLISH_ENVIRONMENTS to one that exists, then re-run npm run kit:import. It publishes what was skipped; everything else is already done.",
          details: { missing: envNames },
        },
      );
    }
    next.phases.contentstack = { done: true, at: new Date().toISOString() };
    saveKitState(next, statePath);
    out(`Done. Homepage ${next.ids.homepage ?? "?"}, hero banner ${next.ids.heroBanner ?? "?"}. Progress saved to ${statePath}.`);
    return 0;
  } catch (e) {
    err(formatError(e));
    return e instanceof KitError ? e.code : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
