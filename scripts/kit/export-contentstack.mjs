// export-contentstack: maintainer tool. Reads a source stack through the CMA and writes
// the snapshot to seed/contentstack/ (the old contents are deleted first).
// Usage: node scripts/kit/export-contentstack.mjs [--env-file .env.source] [--out seed/contentstack]
// --out must be seed/contentstack (or another seed/**/contentstack), or a new or empty folder;
// anything else exits 2 before anything is deleted.
// Exit codes: 0 ok, 1 error, 2 missing input or credential. Never prints token values.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KitError } from "./lib/env.mjs";
import { createCma } from "./lib/cma.mjs";
import { exportStack } from "./lib/export-stack.mjs";

export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

export function loadSourceEnv(file) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch {
    throw new KitError(`Cannot read env file ${file}`, { code: 2, hint: "Create it with CONTENTSTACK_API_KEY and CONTENTSTACK_MANAGEMENT_TOKEN for the source stack." });
  }
  const env = parseEnvFile(text);
  const missing = ["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN"].filter((k) => !env[k]);
  if (missing.length) throw new KitError(`${file} is missing ${missing.join(", ")}`, { code: 2 });
  return env;
}

async function main(argv) {
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
  try {
    const env = loadSourceEnv(opt("--env-file", ".env.source"));
    const cma = createCma({
      apiKey: env.CONTENTSTACK_API_KEY,
      managementToken: env.CONTENTSTACK_MANAGEMENT_TOKEN,
      host: env.CONTENTSTACK_MANAGEMENT_HOST || "api.contentstack.io",
      branch: env.CONTENTSTACK_BRANCH || "main",
    });
    const outDir = path.resolve(opt("--out", "seed/contentstack"));
    const counts = await exportStack({ cma, outDir });
    console.log(`Exported to ${outDir}`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  } catch (e) {
    console.error(e instanceof KitError ? `${e.message}${e.hint ? `\n${e.hint}` : ""}` : e);
    process.exit(e instanceof KitError ? e.code : 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
