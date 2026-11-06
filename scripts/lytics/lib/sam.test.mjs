import { afterEach, describe, expect, it, vi } from "vitest";
import { KitError } from "../../kit/lib/env.mjs";
import { SAM, samEmail } from "./sam.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("samEmail", () => {
  it("falls back to sam.parker@example.com when unset, without throwing at import", () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", "");
    expect(samEmail()).toBe("sam.parker@example.com");
    expect(SAM.email).toBe("sam.parker@example.com");
  });

  it("normalizes the env value", () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", "  Sam@Example.com ");
    expect(SAM.email).toBe("sam@example.com");
  });

  it("throws KitError code 2 when set but invalid", () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", "sam+demo@example.com");
    expect(() => samEmail()).toThrow(KitError);
    try { samEmail(); } catch (e) { expect(e.code).toBe(2); }
  });
});
