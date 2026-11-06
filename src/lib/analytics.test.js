import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CART_STREAM,
  ORDER_STREAM,
  PERSONALIZE_EVENTS,
  buildAddToCartEvent,
  buildCheckoutEvent,
  buildPreorderEvent,
  impressionAliases,
  sendLytics,
  settle,
  trackCheckoutStarted,
  trackImpressions,
  trackPreorder,
  triggerPersonalizeEvent,
} from "./analytics";

afterEach(() => vi.unstubAllGlobals());

describe("event builders", () => {
  it("builds add to cart from a product", () => {
    expect(buildAddToCartEvent({ product: { id: "p1", name: "Touring Saddlebag", price: 89 }, quantity: 2 })).toEqual({
      event: "add_to_cart",
      product: "Touring Saddlebag",
      product_id: "p1",
      quantity: 2,
      unit_price: 89,
    });
  });

  it("builds checkout from cart items", () => {
    const items = [
      { name: "RP Volt", quantity: 1 },
      { name: "Touring Saddlebag", quantity: 2 },
    ];
    expect(buildCheckoutEvent({ items, subtotal: 2578 })).toEqual({
      event: "checkout_started",
      products: ["RP Volt", "Touring Saddlebag"],
      item_count: 3,
      cart_subtotal: 2578,
    });
  });

  it("builds a pre-order in the rp_orders shape, with the trade-in only when given", () => {
    expect(buildPreorderEvent({ tradeIn: "RP Volt" })).toEqual({ action: "preorder", product: "RP Roam", product_kind: "ebike", trade_in: "RP Volt" });
    expect(buildPreorderEvent()).toEqual({ action: "preorder", product: "RP Roam", product_kind: "ebike" });
  });
});

describe("sendLytics", () => {
  it("sends to the named stream and resolves when the tag reports the send", async () => {
    const send = vi.fn((stream, payload, done) => done());
    vi.stubGlobal("window", { jstag: { send } });
    await expect(sendLytics(CART_STREAM, { a: 1 })).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith("rp_cart", { a: 1 }, expect.any(Function));
  });

  it("is a no-op without the tag, and never throws", async () => {
    vi.stubGlobal("window", {});
    await expect(sendLytics(CART_STREAM, {})).resolves.toBe(false);
    vi.stubGlobal("window", { jstag: { send: () => { throw new Error("blocked"); } } });
    await expect(sendLytics(CART_STREAM, {})).resolves.toBe(false);
  });

  it("settle gives up after the cap when the tag never answers", async () => {
    vi.stubGlobal("window", { jstag: { send: () => {} } });
    await expect(settle(sendLytics(CART_STREAM, {}), 10)).resolves.toBeUndefined();
  });
});

describe("Personalize", () => {
  it("triggers an event and turns a rejection into false", async () => {
    const triggerEvent = vi.fn().mockRejectedValue(new Error("unknown event"));
    await expect(triggerPersonalizeEvent({ triggerEvent }, "add_to_cart")).resolves.toBe(false);
    expect(triggerEvent).toHaveBeenCalledWith("add_to_cart");
  });

  it("does nothing without an SDK", async () => {
    await expect(triggerPersonalizeEvent(null, "add_to_cart")).resolves.toBe(false);
  });

  it("reads unique variant aliases from _applied_variants", () => {
    const entry = { _applied_variants: { headline: "cs_personalize_0_1", image: "cs_personalize_0_1", eyebrow_text: "cs_personalize_2_0", other: 5 } };
    expect(impressionAliases(entry)).toEqual(["cs_personalize_0_1", "cs_personalize_2_0"]);
    expect(impressionAliases({})).toEqual([]);
  });

  it("triggers impressions only when a variant was applied", async () => {
    const triggerImpressions = vi.fn().mockResolvedValue();
    expect(trackImpressions({ triggerImpressions }, { title: "base only" })).toBe(false);
    expect(trackImpressions({ triggerImpressions }, { _applied_variants: { headline: "cs_personalize_0_1" } })).toBe(true);
    await new Promise((r) => setTimeout(r));
    expect(triggerImpressions).toHaveBeenCalledWith({ aliases: ["cs_personalize_0_1"] });
  });
});

describe("combined trackers", () => {
  it("sends checkout to Lytics and Personalize", async () => {
    const send = vi.fn((stream, payload, done) => done());
    vi.stubGlobal("window", { jstag: { send } });
    const triggerEvent = vi.fn().mockResolvedValue();
    await trackCheckoutStarted({ triggerEvent }, [{ name: "RP Volt", quantity: 1 }], 2400);
    expect(send).toHaveBeenCalledWith("rp_cart", expect.objectContaining({ event: "checkout_started" }), expect.any(Function));
    expect(triggerEvent).toHaveBeenCalledWith(PERSONALIZE_EVENTS.checkoutStarted);
  });

  it("sends a pre-order to rp_orders and marks the conversion", async () => {
    const send = vi.fn((stream, payload, done) => done());
    vi.stubGlobal("window", { jstag: { send } });
    const triggerEvent = vi.fn().mockResolvedValue();
    await trackPreorder({ triggerEvent }, { tradeIn: "RP Volt" });
    expect(send).toHaveBeenCalledWith(ORDER_STREAM, { action: "preorder", product: "RP Roam", product_kind: "ebike", trade_in: "RP Volt" }, expect.any(Function));
    expect(triggerEvent).toHaveBeenCalledWith("preorder_completed");
  });
});
