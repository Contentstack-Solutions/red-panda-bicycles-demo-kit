import { hasAudience } from "@/lib/lyticsAudiences";
import { expireCookies, memberCookie } from "@/lib/memberSession";
import { waitFor } from "@/lib/waitFor";

const MANIFEST_COOKIE = "cs-personalize-manifest";

// Signs the demo member in: records them for the header, identifies the
// browser to Lytics, then waits until entitySync has written the target
// audience to the cookie the Personalize edge reads. Never throws.
export async function signInMember({
  getJstag,
  member,
  audience,
  timeoutMs,
  getCookies,
  setCookie,
  hostname,
  refreshEveryMs = 2000,
  tagReadyMs = 1000,
  intervalMs = 250,
  now,
  sleep,
  warn = console.warn,
}) {
  // The client Personalize SDK would otherwise keep the pre-login manifest.
  for (const cookie of expireCookies(MANIFEST_COOKIE, hostname)) setCookie(cookie);
  setCookie(memberCookie(member));

  if (typeof getJstag()?.send !== "function") {
    warn("Lytics tag unavailable; signing in without identify.");
    return { identified: false, matched: false };
  }
  // Until the real tag loads, window.jstag is the snippet's queue stub (no
  // loadEntity). If it hasn't loaded after a short grace it's blocked, and a
  // queued identify would be lost on navigation anyway.
  const tagReady = await waitFor(() => typeof getJstag()?.loadEntity === "function", {
    timeoutMs: tagReadyMs,
    intervalMs,
    now,
    sleep,
  });
  if (!tagReady) {
    warn("Lytics tag did not load; signing in without identify.");
    return { identified: false, matched: false };
  }
  const jstag = getJstag();
  try {
    jstag.send({ email: member.email, amsterdam_bc_member: true });
  } catch (error) {
    warn("Lytics identify failed.", error);
    return { identified: false, matched: false };
  }

  // The tag doesn't re-fetch the profile after identify, so ask it to.
  let lastRefresh = 0;
  const matched = await waitFor(
    (elapsed) => {
      if (elapsed - lastRefresh >= refreshEveryMs) {
        lastRefresh = elapsed;
        try {
          jstag.loadEntity();
        } catch {
          // Keep waiting on the cookie; a later refresh or the timeout ends it.
        }
      }
      return hasAudience(getCookies(), audience);
    },
    { timeoutMs, intervalMs, now, sleep }
  );
  return { identified: true, matched };
}
