import { describe, it, expect } from "vitest";
import { KitError, apiBase, nonUsRegionWithoutHosts, personaEmail, publishEnvironmentNames, requireEnv } from "./env.mjs";

describe("env", () => {
  it("personaEmail rejects plus and normalizes case", () => {
    expect(personaEmail(" Sam.Parker@Acme.com ")).toBe("sam.parker@acme.com");
    for (const bad of ["a+b@x.com", "nope", ""]) {
      try {
        personaEmail(bad);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(KitError);
        expect(e.code).toBe(2);
      }
    }
  });

  it("requireEnv lists all missing", () => {
    const keep = process.env.KIT_A;
    process.env.KIT_A = "x";
    delete process.env.KIT_B;
    delete process.env.KIT_C;
    try {
      requireEnv(["KIT_A", "KIT_B", "KIT_C"]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.code).toBe(2);
      expect(e.message).toContain("KIT_B");
      expect(e.message).toContain("KIT_C");
      expect(e.message).not.toContain("KIT_A");
    }
    expect(requireEnv(["KIT_A"])).toEqual({ KIT_A: "x" });
    if (keep === undefined) delete process.env.KIT_A;
  });
});

describe("publishEnvironmentNames", () => {
  it("uses CONTENTSTACK_PUBLISH_ENVIRONMENTS, trimmed and split", () => {
    expect(publishEnvironmentNames({ CONTENTSTACK_PUBLISH_ENVIRONMENTS: " preview, launch ,", CONTENTSTACK_ENVIRONMENT: "site" })).toEqual(["preview", "launch"]);
  });

  it("falls back to CONTENTSTACK_ENVIRONMENT when no publish environments are set", () => {
    expect(publishEnvironmentNames({ CONTENTSTACK_PUBLISH_ENVIRONMENTS: " ", CONTENTSTACK_ENVIRONMENT: "launch" })).toEqual(["launch"]);
    expect(publishEnvironmentNames({ CONTENTSTACK_ENVIRONMENT: "launch" })).toEqual(["launch"]);
  });

  it("falls back to preview when neither is set", () => {
    expect(publishEnvironmentNames({})).toEqual(["preview"]);
    expect(publishEnvironmentNames({ CONTENTSTACK_PUBLISH_ENVIRONMENTS: "", CONTENTSTACK_ENVIRONMENT: "" })).toEqual(["preview"]);
  });

  it("reads process.env by default", () => {
    const keep = { p: process.env.CONTENTSTACK_PUBLISH_ENVIRONMENTS, e: process.env.CONTENTSTACK_ENVIRONMENT };
    try {
      delete process.env.CONTENTSTACK_PUBLISH_ENVIRONMENTS;
      process.env.CONTENTSTACK_ENVIRONMENT = "launch";
      expect(publishEnvironmentNames()).toEqual(["launch"]);
    } finally {
      for (const [k, v] of [["CONTENTSTACK_PUBLISH_ENVIRONMENTS", keep.p], ["CONTENTSTACK_ENVIRONMENT", keep.e]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
});

describe("apiBase (ruling R34)", () => {
  it("defaults to the US hosts", () => {
    expect(apiBase("personalize", {})).toBe("https://personalize-api.contentstack.com");
    expect(apiBase("brandkit", {})).toBe("https://brand-kits-api.contentstack.com");
    expect(apiBase("ai", {})).toBe("https://ai.contentstack.com");
  });

  it("uses the env overrides, with or without a scheme or trailing slash", () => {
    const env = {
      CONTENTSTACK_PERSONALIZE_API_HOST: " p.example.test ",
      CONTENTSTACK_BRANDKIT_API_HOST: "https://b.example.test/",
      CONTENTSTACK_AI_HOST: "a.example.test",
    };
    expect(apiBase("personalize", env)).toBe("https://p.example.test");
    expect(apiBase("brandkit", env)).toBe("https://b.example.test");
    expect(apiBase("ai", env)).toBe("https://a.example.test");
  });

  it("reads process.env when called, not at import", () => {
    const keep = process.env.CONTENTSTACK_AI_HOST;
    process.env.CONTENTSTACK_AI_HOST = "late.example.test";
    try {
      expect(apiBase("ai")).toBe("https://late.example.test");
    } finally {
      if (keep === undefined) delete process.env.CONTENTSTACK_AI_HOST;
      else process.env.CONTENTSTACK_AI_HOST = keep;
    }
  });

  it("rejects an unknown kind", () => {
    expect(() => apiBase("nope", {})).toThrow(/Unknown API/);
  });
});

describe("nonUsRegionWithoutHosts", () => {
  it("lists the unset host variables for a non-US region", () => {
    expect(nonUsRegionWithoutHosts({ CONTENTSTACK_REGION: "eu", CONTENTSTACK_AI_HOST: "x" })).toEqual([
      "CONTENTSTACK_PERSONALIZE_API_HOST",
      "CONTENTSTACK_BRANDKIT_API_HOST",
    ]);
  });
  it("is empty for us, na, an unset region, or when all three are set", () => {
    expect(nonUsRegionWithoutHosts({ CONTENTSTACK_REGION: "us" })).toEqual([]);
    expect(nonUsRegionWithoutHosts({ CONTENTSTACK_REGION: "NA" })).toEqual([]);
    expect(nonUsRegionWithoutHosts({})).toEqual([]);
    expect(nonUsRegionWithoutHosts({
      CONTENTSTACK_REGION: "azure-eu",
      CONTENTSTACK_PERSONALIZE_API_HOST: "p", CONTENTSTACK_BRANDKIT_API_HOST: "b", CONTENTSTACK_AI_HOST: "a",
    })).toEqual([]);
  });
});
