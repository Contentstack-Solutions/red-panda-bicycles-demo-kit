import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["RED_PANDA_COMMERCE_API_URL", "RED_PANDA_COMMERCE_STPRE_ID", "RED_PANDA_COMMERCE_STPRE_TOKEN"];

async function load(env) {
  vi.resetModules();
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  return import("./rpcommerce");
}

describe("RPCommerce", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("makes no requests and returns empty results when the store isn't configured", async () => {
    const { default: RPCommerce, commerceConfigured } = await load({});
    expect(commerceConfigured).toBe(false);
    expect(await RPCommerce.getCategoryByURL("e-bikes")).toBeNull();
    expect(await RPCommerce.getProductByUrl("rp-roam")).toBeNull();
    expect(await RPCommerce.getProductsByCategory("1")).toBeNull();
    expect(await RPCommerce.getCategoryById("1")).toBeNull();
    expect(await RPCommerce.getCategoryFilters("1")).toBeNull();
    expect(await RPCommerce.getAllProducts()).toEqual([]);
    expect(await RPCommerce.getAllCategories()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty result instead of throwing when the store is unreachable", async () => {
    const { default: RPCommerce } = await load({ RED_PANDA_COMMERCE_API_URL: "https://store.example", RED_PANDA_COMMERCE_STPRE_ID: "s1" });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await RPCommerce.getProductByUrl("rp-roam")).toBeNull();
    expect(await RPCommerce.getAllProducts()).toEqual([]);
  });

  it("calls the store when configured", async () => {
    const { default: RPCommerce, commerceConfigured } = await load({
      RED_PANDA_COMMERCE_API_URL: "https://store.example/",
      RED_PANDA_COMMERCE_STPRE_ID: "s1",
      RED_PANDA_COMMERCE_STPRE_TOKEN: "t",
    });
    expect(commerceConfigured).toBe(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ products: [{ id: "p1" }] }) });
    expect(await RPCommerce.getProductByUrl("rp-roam")).toEqual([{ id: "p1" }]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/store\.example\/api\/public\/store\/s1\/products\?/);
  });
});
