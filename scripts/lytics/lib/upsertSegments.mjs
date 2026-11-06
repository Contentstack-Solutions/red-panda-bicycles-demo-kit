// Creates each audience by slug, or updates it when its definition changed. After every
// audience it emits a JSON line {"audience": slug, "action": "created"|"updated"|"unchanged"}
// on stdout, as it goes, so the kit's Lytics phase can record which audiences it created
// (and may tear down) and which already existed, even when the step fails partway.
//
// Ruling R35: an audience with the same slug that the kit didn't create (`created` lists the
// slugs the kit did) is never overwritten. Same definition (whitespace aside): adopted as it is,
// with no write. Different definition: exit 3 before anything is written.
import { KitError } from "../../kit/lib/env.mjs";

/** segment_ql with whitespace runs collapsed, for comparing definitions. */
export const normalizeQl = (ql) => String(ql ?? "").replace(/\s+/g, " ").trim();

/** The slugs after `--created` (comma-separated; empty or absent means none). */
export function createdFromArgs(args) {
  const i = args.indexOf("--created");
  const v = i >= 0 ? args[i + 1] : "";
  return String(v && !v.startsWith("--") ? v : "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function upsertSegments({ client, defs, created = [], dryRun = false, log = console.log }) {
  const existing = (await client.getSegments()).data;
  const ours = new Set(created);
  const find = (slug) => existing.find((s) => s.slug_name === slug);

  const conflicts = defs.filter((def) => {
    const found = find(def.slug_name);
    return found && !ours.has(def.slug_name) && normalizeQl(found.segment_ql) !== normalizeQl(def.segment_ql);
  });
  if (conflicts.length) {
    const names = conflicts.map((d) => d.slug_name);
    throw new KitError(
      `${names.join(", ")}: an audience with this slug already exists with a different definition; rename or delete it, then re-run.`,
      { code: 3, hint: "The kit didn't create it, so it never overwrites it. Nothing was changed.", details: { conflicts: names } },
    );
  }

  const result = { created: [], updated: [], unchanged: [] };
  for (const def of defs) {
    // save_hist makes Lytics track the size over time (and show it in the UI).
    const body = { table: "user", is_public: false, save_hist: true, ...def };
    const found = find(def.slug_name);
    const sameQl = found && normalizeQl(found.segment_ql) === normalizeQl(def.segment_ql);
    let action;
    if (found && ((sameQl && !ours.has(def.slug_name)) || (sameQl && found.is_public === body.is_public && found.save_hist))) {
      log(`✓ ${def.slug_name}`);
      action = "unchanged";
    } else {
      if (!dryRun) {
        if (found) await client.request("PUT", `/api/segment/${found.id}`, { ...body, id: found.id });
        else await client.createSegment(body);
      }
      log(`${found ? "~" : "+"} ${def.slug_name}: ${def.segment_ql}`);
      action = found ? "updated" : "created";
    }
    result[action].push(def.slug_name);
    if (!dryRun) log(JSON.stringify({ audience: def.slug_name, action }));
  }
  return result;
}

/** The {"audience", "action"} lines from the audiences step's stdout. */
export function parseAudienceActions(stdout) {
  const out = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o?.audience === "string" && ["created", "updated", "unchanged"].includes(o.action)) out.push(o);
    } catch { /* not ours */ }
  }
  return out;
}
