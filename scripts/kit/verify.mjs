// verify: checks the demo works. The homepage shows the personalized hero to a member of the
// persona's audience and the default hero to everyone else, the persona is in that audience in
// Lytics, and the audience counts are within ±5% of the counts measured during setup.
// Usage: npm run kit:verify [-- --site <url>] [-- --counts]
//   --site    the site to check (default SITE_URL; http://localhost:3000 for npm run dev)
//   --counts  only the audience counts table
// Reads only; changes nothing. Exit codes: 0 all ✓ · 1 any ✗ or error · 2 missing input or credential.
import { fileURLToPath } from "node:url";
import { KitError } from "./lib/env.mjs";
import { loadKitState } from "./lib/state.mjs";
import { audienceSize } from "./lib/lyticsPhase.mjs";
import { loadPersonalizeSeed } from "./lib/personalizePhase.mjs";
import { MEMBER_AUDIENCE, PERSONA_UID, formatChecks, formatCounts, variantMarker, verifyCounts, verifySam, verifySite } from "./lib/ops.mjs";
import { redact } from "../../.claude/skills/red-panda-customer-insights/scripts/rp.mjs";

const USAGE = "Usage: npm run kit:verify -- [--site <url>] [--counts]";

export function parseArgs(argv) {
  const out = { counts: false, site: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--counts") out.counts = true;
    else if (a === "--site") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new KitError("--site needs a URL", { code: 2, hint: USAGE });
      out.site = v;
    } else throw new KitError(`Unknown argument "${a}"`, { code: 2, hint: USAGE });
  }
  return out;
}

const need = (env, name, hint) => {
  const v = String(env[name] ?? "").trim();
  if (!v) throw new KitError(`${name} is not set`, { code: 2, hint });
  return v;
};

export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const secrets = [env.LYTICS_ACCESS_TOKEN, env.CONTENTSTACK_MANAGEMENT_TOKEN, env.CONTENTSTACK_AUTHTOKEN, env.CONTENTSTACK_DELIVERY_TOKEN];
  const out = (s) => (deps.out ?? console.log)(redact(s, secrets));
  const err = (s) => (deps.err ?? console.error)(redact(s, secrets));
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const args = parseArgs(argv);
    const state = loadKitState(deps.statePath ?? ".kit/state.json");
    if (!state.expected) throw new KitError("No measured counts in .kit/state.json.", { code: 2, hint: "Run npm run kit:lytics first; it measures your counts." });
    const token = need(env, "LYTICS_ACCESS_TOKEN", "Add it to .env.local (see .env.example).");
    const sizeFn = deps.sizeFn ?? ((slug) => audienceSize(slug, { token, fetchImpl }));

    const checks = [];
    if (!args.counts) {
      const siteUrl = args.site ?? need(env, "SITE_URL", `Set SITE_URL in .env.local or pass --site <url>. ${USAGE}`);
      const cid = need(env, "LYTICS_TAG", "Set LYTICS_TAG (your Lytics account ID, the one the site's tag uses) in .env.local.");
      const headline = variantMarker(loadPersonalizeSeed(deps.seedPath));
      out(`Checking ${siteUrl}/en`);
      const site = await verifySite({ siteUrl, headline, fetchImpl });
      checks.push({ label: `site: an anonymous visitor gets the default hero`, ok: site.anonymous });
      checks.push({ label: `site: a ${MEMBER_AUDIENCE} member gets the "${headline}" hero`, ok: site.member });
      checks.push({ label: `lytics: ${PERSONA_UID} is in ${MEMBER_AUDIENCE}`, ok: await verifySam({ lyticsCid: cid, fetchImpl }) });
      out(formatChecks(checks));
    }
    const rows = await verifyCounts(sizeFn, state.expected);
    out(formatCounts(rows));
    const failed = [...checks.filter((c) => !c.ok), ...rows.filter((r) => !r.ok)].length;
    out(failed ? `${failed} check(s) failed.` : "All checks passed.");
    return failed ? 1 : 0;
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
