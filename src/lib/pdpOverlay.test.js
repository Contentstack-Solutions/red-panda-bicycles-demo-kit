import { describe, expect, it } from "vitest";
import { applyOverlay, recommendedAccessories } from "./pdpOverlay";

const commerceProduct = { id: "p1", name: "Roam", price: 2499 };

describe("applyOverlay promo banner", () => {
  it("exposes the entry's promo_banner text as promoBanner", () => {
    const product = applyOverlay(commerceProduct, { promo_banner: "Trade in your Volt for €400 off" });
    expect(product.promoBanner).toBe("Trade in your Volt for €400 off");
  });

  it("trims surrounding whitespace", () => {
    expect(applyOverlay(commerceProduct, { promo_banner: "  Free saddlebag  " }).promoBanner).toBe("Free saddlebag");
  });

  it("leaves promoBanner undefined when the field is empty or whitespace", () => {
    expect(applyOverlay(commerceProduct, { promo_banner: "" }).promoBanner).toBeUndefined();
    expect(applyOverlay(commerceProduct, { promo_banner: "   " }).promoBanner).toBeUndefined();
    expect(applyOverlay(commerceProduct, {}).promoBanner).toBeUndefined();
  });

  it("has no promo banner without an overlay entry", () => {
    expect(applyOverlay(commerceProduct, null).promoBanner).toBeUndefined();
  });
});

describe("recommendedAccessories", () => {
  const pannier = { id: "p", name: "Commuter Pannier 20L", url: "commuter-pannier-20l", price: 99 };
  const lock = { id: "l", name: "Fortress U-Lock", url: "fortress-u-lock", price: 79 };
  const pick = (item) => ({ product_item: { selectedIds: [item.id], items: [item] } });

  it("returns the picked commerce products in CMS order, with their group index", () => {
    expect(recommendedAccessories({ recommended_accessories: [pick(pannier), pick(lock)] })).toEqual([
      { product: pannier, index: 0 },
      { product: lock, index: 1 },
    ]);
  });

  it("skips empty pickers and products without a url, keeping the original index", () => {
    const overlay = { recommended_accessories: [{ product_item: { selectedIds: [], items: [] } }, { product_item: null }, pick({ id: "x", name: "No slug" }), pick(lock)] };
    expect(recommendedAccessories(overlay)).toEqual([{ product: lock, index: 3 }]);
  });

  it("returns nothing without an overlay or the field", () => {
    expect(recommendedAccessories(null)).toEqual([]);
    expect(recommendedAccessories({})).toEqual([]);
  });
});
