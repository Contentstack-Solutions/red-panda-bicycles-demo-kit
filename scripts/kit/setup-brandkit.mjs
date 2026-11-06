// setup-brandkit: fills your Brand Kit with the Red Panda Knowledge Vault (11 brand documents plus
// 4 items regenerated from the imported CMS content) and creates two voice profiles.
// Usage: npm run kit:brandkit [-- --dry-run]
// Needs BRAND_KIT_UID and CONTENTSTACK_ORGANIZATION_UID in .env.local, and an authtoken stored by
// `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login`, or an OAuth token stored as
// CONTENTSTACK_OAUTH_TOKEN (sent as Authorization: Bearer; see docs/manual-steps.md step 11).
// Resumable and idempotent.
// Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 needs a person's decision.
import { fileURLToPath } from "node:url";
import { KitError, requireEnv } from "./lib/env.mjs";
import { assertNotTornDown, loadKitState, saveKitState } from "./lib/state.mjs";
import { loadSnapshot } from "./lib/importPlan.mjs";
import { brandkitAuth, buildCmsItems, loadBrandkitSeed, runBrandkitPhase } from "./lib/brandkitPhase.mjs";
import { createCredentials, redact } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

export const LOGIN_HINT = "Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it stores a fresh token for the kit), then re-run npm run kit:brandkit.";

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: "Usage: npm run kit:brandkit -- [--dry-run]" });
  }
  return out;
}

export async function main(argv, deps = {}) {
  const creds = deps.creds ?? createCredentials();
  let token;
  const out = (s) => (deps.out ?? console.log)(redact(s, [token, ...creds.secrets()]));
  const err = (s) => (deps.err ?? console.error)(redact(s, [token, ...creds.secrets()]));
  const statePath = deps.statePath ?? ".kit/state.json";
  try {
    const args = parseArgs(argv);
    assertNotTornDown(loadKitState(statePath), statePath); // ruling R25
    const seed = loadBrandkitSeed(deps.seedDir);
    const cmsItems = buildCmsItems(deps.snapshot ?? loadSnapshot(deps.snapshotDir));
    const state = loadKitState(statePath);
    if (args.dryRun) {
      const lines = [
        `Dry run: npm run kit:brandkit would create (skipping any that already exist):`,
        `- ${seed.vault.length + cmsItems.length} Knowledge Vault items: ${[...seed.vault, ...cmsItems].map((i) => i.title).join("; ")}`,
        `- ${seed.profiles.length} voice profiles: ${seed.profiles.map((p) => p.name).join(", ")}`,
        "Nothing was changed.",
      ];
      out(lines.join("\n"));
      return 0;
    }
    const env = requireEnv(["BRAND_KIT_UID", "CONTENTSTACK_ORGANIZATION_UID"]);
    const auth = brandkitAuth(creds, { organizationUid: env.CONTENTSTACK_ORGANIZATION_UID, brandKitUid: env.BRAND_KIT_UID });
    if (!auth) {
      throw new KitError("No Contentstack authtoken is stored for the kit.", { code: 2, hint: LOGIN_HINT });
    }
    token = auth.token;
    await runBrandkitPhase({
      fetch: deps.fetch ?? globalThis.fetch,
      headers: auth.headers,
      brandKitUid: env.BRAND_KIT_UID,
      seed,
      cmsItems,
      state,
      save: (s) => saveKitState(s, statePath),
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      clock: deps.clock ?? (() => Date.now()),
      log: out,
    });
    out(`Done. Brand Kit filled; progress saved in ${statePath}.`);
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
