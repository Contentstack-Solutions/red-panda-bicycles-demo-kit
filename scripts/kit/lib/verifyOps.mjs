// Checks that the demo works: the homepage hero is personalized for the persona's audience
// (and only for it), the persona is in that audience in Lytics, and the audience counts are
// within ±5% of the counts measured during setup. Every network call is injectable.
import { KitError } from "./env.mjs";
import { EXPECTED_SLUGS, withinTolerance } from "./lyticsPhase.mjs";

export const MEMBER_AUDIENCE = "volt_owners_commuting";
export const PERSONA_UID = "seed-sam";
// The Lytics tag writes the visitor's audiences to this cookie as "|slug_a|slug_b|".
const AUDIENCE_COOKIE = "cs-lytics-audiences";

/**
 * The text that marks the personalized hero, read from the seed: the variant's eyebrow_text
 * ("For riders who've put in the miles"), or its first two headline lines joined by a space.
 */
export function variantMarker(seed) {
  for (const exp of seed?.experiences ?? []) {
    for (const v of exp.variants ?? []) {
      const f = v.entry?.fields ?? {};
      const eyebrow = String(f.eyebrow_text ?? "").trim();
      if (eyebrow) return eyebrow;
      const lines = String(f.headline ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2);
      if (lines.length) return lines.join(" ");
    }
  }
  throw new KitError("seed/personalize/experiences.json has no variant eyebrow or headline to check for.");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
// HTML text → plain text for matching: entities decoded, tags dropped, whitespace collapsed.
export function pageText(html) {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ");
}
const shows = (html, marker) => pageText(html).includes(marker.replace(/\s+/g, " "));

async function fetchHtml(url, headers, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { method: "GET", cache: "no-store", headers });
  } catch (e) {
    throw new KitError(`GET ${url} failed: ${e?.message ?? e}`, { code: 1, hint: "Is the site running? Use --site <url> (http://localhost:3000 for npm run dev)." });
  }
  if (!res.ok) throw new KitError(`GET ${url} returned ${res.status}`, { code: 1 });
  return res.text();
}

/**
 * Fetches `${siteUrl}/en` as an anonymous visitor and as a member of the persona's audience.
 * @returns {Promise<{anonymous: boolean, member: boolean}>} anonymous: the default hero shows;
 *   member: the personalized hero shows.
 */
export async function verifySite({ siteUrl, headline, fetchImpl = fetch }) {
  const url = `${String(siteUrl).replace(/\/+$/, "")}/en`;
  const anon = await fetchHtml(url, {}, fetchImpl);
  const member = await fetchHtml(url, { Cookie: `${AUDIENCE_COOKIE}=${encodeURIComponent(`|${MEMBER_AUDIENCE}|`)}` }, fetchImpl);
  return { anonymous: !shows(anon, headline), member: shows(member, headline) };
}

/** True when the persona's Lytics profile is in the personalized audience. */
export async function verifySam({ lyticsCid, uid = PERSONA_UID, fetchImpl = fetch }) {
  const url = `https://c.lytics.io/api/personalize/${encodeURIComponent(lyticsCid)}/user/_uid/${encodeURIComponent(uid)}?fields=`;
  let res;
  try {
    res = await fetchImpl(url, { method: "GET", cache: "no-store" });
  } catch (e) {
    throw new KitError(`Lytics personalize lookup failed: ${e?.message ?? e}`);
  }
  if (res.status === 404) return false;
  if (!res.ok) throw new KitError(`Lytics personalize lookup returned ${res.status}`, { hint: "Check LYTICS_TAG (your Lytics account ID)." });
  const body = await res.json();
  const segments = body?.data?.segments ?? body?.segments ?? [];
  return Array.isArray(segments) && segments.includes(MEMBER_AUDIENCE);
}

/** Each expected count against the audience's current size. A missing size fails. */
export async function verifyCounts(sizeFn, expected) {
  if (!expected || !Object.keys(expected).length) {
    throw new KitError("No measured counts in .kit/state.json.", { code: 2, hint: "Run npm run kit:lytics first; it measures your counts." });
  }
  const rows = [];
  for (const [name, want] of Object.entries(expected)) {
    const actual = await sizeFn(EXPECTED_SLUGS[name] ?? name);
    rows.push({ name, actual, expected: want, ok: typeof actual === "number" && withinTolerance(actual, want) });
  }
  return rows;
}

const mark = (ok) => (ok ? "✓" : "✗");

export function formatCounts(rows) {
  const w = Math.max(8, ...rows.map((r) => r.name.length));
  const lines = [`${"audience".padEnd(w)}  ${"current".padStart(8)}  ${"expected".padStart(8)}  ±5%`];
  for (const r of rows) {
    lines.push(`${r.name.padEnd(w)}  ${String(r.actual ?? "missing").padStart(8)}  ${String(r.expected).padStart(8)}  ${mark(r.ok)}`);
  }
  return lines.join("\n");
}

export function formatChecks(checks) {
  const w = Math.max(5, ...checks.map((c) => c.label.length));
  return checks.map((c) => `${c.label.padEnd(w)}  ${mark(c.ok)}`).join("\n");
}
