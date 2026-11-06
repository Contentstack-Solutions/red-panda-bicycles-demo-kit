// Ruling R37: the site reads the Personalize project UID from CONTENTSTACK_PERSONALIZATION.
// When that's unset or "true" (an older .env.example meant it as an on/off switch), it falls
// back to CONTENTSTACK_PERSONALIZE_PROJECT_UID, the name the setup scripts use.
// Pass the values explicitly: Next.js only inlines literal `process.env.NAME` reads.
const NOT_A_UID = new Set(["", "true", "null", "undefined"]);

const clean = (v) => String(v ?? "").trim();

/** @returns {string|null} the Personalize project UID, or null when none is configured */
export function personalizeProjectUid(env = {}) {
  const primary = clean(env.CONTENTSTACK_PERSONALIZATION);
  if (!NOT_A_UID.has(primary.toLowerCase())) return primary;
  const fallback = clean(env.CONTENTSTACK_PERSONALIZE_PROJECT_UID);
  return NOT_A_UID.has(fallback.toLowerCase()) ? null : fallback;
}
