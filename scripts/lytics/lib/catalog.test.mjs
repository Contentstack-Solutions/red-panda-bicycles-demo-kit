import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("catalog DOMAIN", () => {
  it("is the SITE_URL host", async () => {
    vi.stubEnv("SITE_URL", "https://my-red-panda.contentstackapps.com");
    vi.resetModules();
    const { DOMAIN, pageUrl } = await import("./catalog.mjs");
    expect(DOMAIN).toBe("my-red-panda.contentstackapps.com");
    expect(pageUrl("/en")).toBe("https://my-red-panda.contentstackapps.com/en");
  });

  it("falls back to red-panda.example.com when SITE_URL is unset or invalid", async () => {
    for (const v of ["", "not a url"]) {
      vi.stubEnv("SITE_URL", v);
      vi.resetModules();
      const { DOMAIN } = await import("./catalog.mjs");
      expect(DOMAIN).toBe("red-panda.example.com");
    }
  });
});
