import { describe, expect, it } from "vitest";
import { AUDIENCE_COOKIE, hasAudience, parseAudiences, readCookie } from "./lyticsAudiences";

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("a=1; cs-lytics-audiences=|x|; b=2", AUDIENCE_COOKIE)).toBe("|x|");
  });

  it("keeps '=' inside values and returns null when absent", () => {
    expect(readCookie("t=a=b", "t")).toBe("a=b");
    expect(readCookie("a=1", AUDIENCE_COOKIE)).toBeNull();
    expect(readCookie("", AUDIENCE_COOKIE)).toBeNull();
    expect(readCookie(undefined, AUDIENCE_COOKIE)).toBeNull();
  });

  it("does not match a cookie whose name only ends with the target", () => {
    expect(readCookie("xcs-lytics-audiences=|x|", AUDIENCE_COOKIE)).toBeNull();
  });
});

describe("parseAudiences", () => {
  it("splits the pipe-delimited list", () => {
    expect(parseAudiences("|smt_new|volt_owners_commuting|")).toEqual(["smt_new", "volt_owners_commuting"]);
  });

  it("decodes URL-encoded values", () => {
    expect(parseAudiences("%7Csmt_new%7Cvolt_owners_commuting%7C")).toEqual(["smt_new", "volt_owners_commuting"]);
  });

  it("tolerates empty and malformed values", () => {
    expect(parseAudiences("")).toEqual([]);
    expect(parseAudiences(null)).toEqual([]);
    expect(parseAudiences("||")).toEqual([]);
    expect(parseAudiences("%E0%A4%A|a|")).toEqual(["%E0%A4%A", "a"]);
  });
});

describe("hasAudience", () => {
  const cookies = "seerid=abc; cs-lytics-audiences=%7Csmt_new%7Cvolt_owners_commuting_old%7C";

  it("matches whole slugs only", () => {
    expect(hasAudience(cookies, "smt_new")).toBe(true);
    expect(hasAudience(cookies, "volt_owners_commuting")).toBe(false);
    expect(hasAudience(cookies, "volt_owners_commuting_old")).toBe(true);
  });

  it("is false when the cookie is missing", () => {
    expect(hasAudience("seerid=abc", "smt_new")).toBe(false);
  });
});
