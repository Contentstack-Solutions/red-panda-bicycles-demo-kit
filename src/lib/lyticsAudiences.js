// The Lytics tag's entitySync writes the visitor's audiences to this cookie as
// "|slug_a|slug_b|"; the Personalize Edge SDK forwards it to the edge.
export const AUDIENCE_COOKIE = "cs-lytics-audiences";

export function readCookie(cookieString, name) {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAudiences(value) {
  if (!value) return [];
  return safeDecode(value)
    .split("|")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

export function hasAudience(cookieString, slug) {
  return parseAudiences(readCookie(cookieString, AUDIENCE_COOKIE)).includes(slug);
}
