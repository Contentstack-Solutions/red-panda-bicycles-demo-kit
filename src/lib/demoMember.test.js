import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("demoMember", () => {
  it("uses DEMO_PERSONA_EMAIL", async () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", " Pat.Lee@Acme.com ");
    vi.resetModules();
    const { DEMO_MEMBER } = await import("./demoMember.js");
    expect(DEMO_MEMBER.email).toBe("pat.lee@acme.com");
  });
  it("falls back to the example address", async () => {
    vi.stubEnv("DEMO_PERSONA_EMAIL", "");
    vi.resetModules();
    const { DEMO_MEMBER } = await import("./demoMember.js");
    expect(DEMO_MEMBER.email).toBe("sam.parker@example.com");
  });
});
