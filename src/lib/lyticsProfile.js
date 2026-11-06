// Formatting for Lytics profile fields in the dev tools panel. The public
// Personalization API returns only fields on the account's api_whitelist_fields,
// so every field here can be missing.

// "[]string" fields can arrive as a single string when one value is set.
export function toList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => typeof item === "string" && item !== "");
}

export function ordinal(value) {
  const n = Math.round(Number(value));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

// segment_prediction_percentile maps lookalike model name → percentile (0-100).
export function lookalikeMatches(percentiles) {
  return Object.entries(percentiles ?? {})
    .map(([model, value]) => ({ model, label: model.replace(/\s+lookalike$/i, ""), percentile: Number(value) }))
    .filter((match) => Number.isFinite(match.percentile))
    .sort((a, b) => b.percentile - a.percentile);
}

// Readable names for the fields the Attributes tab shows. Anything not listed
// falls back to humanizeKey.
const ATTRIBUTE_LABELS = {
  _id: "Lytics ID",
  _uid: "Browser ID",
  club_membership: "Cycling club",
  flows_step_slugs: "Flow steps",
  lytics_content: "Content interests",
  products_owned: "Bikes owned",
  recommended_bike: "Recommended bike",
  segment_prediction_percentile: "Lookalike match",
  segments: "Audiences",
  trade_in: "Trade-in",
  volt_review_text: "RP Volt review",
};

// "score_propensity" → "Propensity score", "club_membership" → "Club membership".
export function humanizeKey(key) {
  if (ATTRIBUTE_LABELS[key]) return ATTRIBUTE_LABELS[key];
  const score = key.match(/^score_(.+)$/);
  const words = (score ? `${score[1]} score` : key).replace(/^_+/, "").replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatScalar(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// Turns a map of name → number into rows. Lookalike maps read as percentiles,
// maps of 0-1 decimals (content affinities) as percentages; both get a bar.
function formatMap(key, map) {
  const entries = Object.entries(map);
  const numeric = entries.every(([, value]) => Number.isFinite(Number(value)) && value !== "" && typeof value !== "boolean");
  if (!numeric) return entries.map(([name, value]) => ({ name, display: formatScalar(value) ?? "—" }));

  const values = entries.map(([, value]) => Number(value));
  const fractional = values.every((value) => value >= 0 && value <= 1) && values.some((value) => !Number.isInteger(value));
  return entries
    .map(([name], i) => {
      const value = values[i];
      if (key === "segment_prediction_percentile") return { name, display: `${ordinal(value)} percentile`, pct: value };
      if (fractional) return { name, display: `${Math.round(value * 100)}%`, pct: value * 100 };
      return { name, display: formatScalar(value) };
    })
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}

// Every profile field as a readable row: { key, label, kind, value }, where kind
// is "text" (value is a string), "list" (string[]), "map" (rows) or "empty".
export function describeAttributes(user) {
  return Object.entries(user ?? {}).map(([key, raw]) => {
    const label = humanizeKey(key);
    if (Array.isArray(raw)) {
      const items = raw.map(formatScalar).filter(Boolean);
      return items.length ? { key, label, kind: "list", value: items } : { key, label, kind: "empty" };
    }
    if (raw && typeof raw === "object") {
      return Object.keys(raw).length ? { key, label, kind: "map", value: formatMap(key, raw) } : { key, label, kind: "empty" };
    }
    // Lytics returns scores as numeric strings ("81"); show them as plain numbers.
    const value = formatScalar(key.startsWith("score_") && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw);
    return value ? { key, label, kind: "text", value } : { key, label, kind: "empty" };
  });
}
