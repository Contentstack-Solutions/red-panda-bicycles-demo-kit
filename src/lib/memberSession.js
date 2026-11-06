// Site-side record of the signed-in Amsterdam BC member. It carries display
// data only; the member's identity lives in Lytics.
export const MEMBER_COOKIE = "rp_bc_member";
const MEMBER_MAX_AGE_S = 60 * 60 * 24 * 30;

// Everything that makes this browser "Sam": clearing these returns it to a
// brand-new anonymous visitor, ready for the next demo run.
export const SIGN_OUT_COOKIES = [
  MEMBER_COOKIE,
  "seerid",
  "seerses",
  "cs-lytics-audiences",
  "cs-lytics-flows",
  "cs-personalize-user-uid",
  "cs-personalize-manifest",
];

export function encodeMember(member) {
  return encodeURIComponent(JSON.stringify({ firstName: member.firstName }));
}

export function decodeMember(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    return typeof parsed?.firstName === "string" && parsed.firstName ? { firstName: parsed.firstName } : null;
  } catch {
    return null;
  }
}

export function memberCookie(member) {
  return `${MEMBER_COOKIE}=${encodeMember(member)}; Path=/; Max-Age=${MEMBER_MAX_AGE_S}; SameSite=Lax`;
}

// A cookie set with a Domain attribute is only removed by an expiry with the
// same Domain, so cover host-only, host and parent-domain variants.
export function expireCookies(name, hostname) {
  const base = `${name}=; Path=/; Max-Age=0`;
  if (!hostname || !hostname.includes(".")) return [base];
  const domains = [hostname];
  const parent = hostname.split(".").slice(-2).join(".");
  if (parent !== hostname) domains.push(parent);
  return [base, ...domains.map((domain) => `${base}; Domain=${domain}`)];
}

export function signOutCookieStrings(hostname) {
  return SIGN_OUT_COOKIES.flatMap((name) => expireCookies(name, hostname));
}

// Only same-site paths; "/\" is treated like "//" by browsers.
export function safeReturnTo(value, locale) {
  const fallback = `/${locale}`;
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (path !== value || !path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  const login = `/${locale}/login`;
  if (path === login || path.startsWith(`${login}?`) || path.startsWith(`${login}/`)) return fallback;
  return path;
}
