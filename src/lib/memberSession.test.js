import { describe, expect, it } from "vitest";
import {
  MEMBER_COOKIE,
  SIGN_OUT_COOKIES,
  decodeMember,
  encodeMember,
  expireCookies,
  memberCookie,
  safeReturnTo,
  signOutCookieStrings,
} from "./memberSession";

describe("member cookie", () => {
  it("round-trips the first name", () => {
    expect(decodeMember(encodeMember({ firstName: "Sam", email: "x@y.z" }))).toEqual({ firstName: "Sam" });
  });

  it("only stores display data", () => {
    expect(decodeURIComponent(encodeMember({ firstName: "Sam", email: "sam.parker@example.com" }))).not.toContain("@");
  });

  it("returns null for missing, malformed or empty values", () => {
    expect(decodeMember(undefined)).toBeNull();
    expect(decodeMember("")).toBeNull();
    expect(decodeMember("%E0%A4%A")).toBeNull();
    expect(decodeMember(encodeURIComponent("not json"))).toBeNull();
    expect(decodeMember(encodeURIComponent(JSON.stringify({ firstName: "" })))).toBeNull();
  });

  it("builds a site-wide, lax, 30-day cookie", () => {
    const cookie = memberCookie({ firstName: "Sam" });
    expect(cookie.startsWith(`${MEMBER_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 30}`);
  });
});

describe("expireCookies", () => {
  it("expires only the host-only cookie on dot-less hosts", () => {
    expect(expireCookies("seerid", "localhost")).toEqual(["seerid=; Path=/; Max-Age=0"]);
  });

  it("also expires host and parent-domain variants", () => {
    expect(expireCookies("seerid", "demo.example.com")).toEqual([
      "seerid=; Path=/; Max-Age=0",
      "seerid=; Path=/; Max-Age=0; Domain=demo.example.com",
      "seerid=; Path=/; Max-Age=0; Domain=example.com",
    ]);
  });

  it("does not duplicate the domain for a two-label host", () => {
    expect(expireCookies("seerid", "example.com")).toEqual([
      "seerid=; Path=/; Max-Age=0",
      "seerid=; Path=/; Max-Age=0; Domain=example.com",
    ]);
  });
});

describe("signOutCookieStrings", () => {
  it("covers the member, Lytics and Personalize cookies", () => {
    expect(SIGN_OUT_COOKIES).toEqual([
      "rp_bc_member",
      "seerid",
      "seerses",
      "cs-lytics-audiences",
      "cs-lytics-flows",
      "cs-personalize-user-uid",
      "cs-personalize-manifest",
    ]);
    const strings = signOutCookieStrings("localhost");
    for (const name of SIGN_OUT_COOKIES) {
      expect(strings).toContain(`${name}=; Path=/; Max-Age=0`);
    }
  });
});

describe("safeReturnTo", () => {
  it("keeps same-site paths", () => {
    expect(safeReturnTo("/en", "en")).toBe("/en");
    expect(safeReturnTo("/en/blog/best-biking-day-trips-around-amsterdam", "en")).toBe(
      "/en/blog/best-biking-day-trips-around-amsterdam"
    );
    expect(safeReturnTo("/en/plp/e-bikes?color=red", "en")).toBe("/en/plp/e-bikes?color=red");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "  //evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", ""]) {
      expect(safeReturnTo(bad, "en")).toBe("/en");
    }
  });

  it("falls back for non-strings and control characters", () => {
    expect(safeReturnTo(undefined, "en")).toBe("/en");
    expect(safeReturnTo(["/en/a", "/en/b"], "en")).toBe("/en");
    expect(safeReturnTo("/en\n/x", "en")).toBe("/en");
  });

  it("never returns to the login page itself", () => {
    expect(safeReturnTo("/en/login", "en")).toBe("/en");
    expect(safeReturnTo("/en/login?returnTo=/en", "en")).toBe("/en");
  });
});
