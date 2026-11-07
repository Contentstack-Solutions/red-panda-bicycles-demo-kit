import { describe, expect, it, vi } from "vitest";
import { commerceMessage, isPreorderButton, preorderItems, relayLyticsEvent } from "./checkoutEmbed";

describe("commerceMessage", () => {
  const origin = "https://store.example";
  it("accepts RP_ messages from the store's origin", () => {
    expect(commerceMessage({ origin, data: { type: "RP_CHECKOUT_COMPLETE", orderNumber: "A1" } }, origin)).toEqual({ type: "RP_CHECKOUT_COMPLETE", orderNumber: "A1" });
  });
  it("ignores other origins, other message types and empty data", () => {
    expect(commerceMessage({ origin: "https://evil.example", data: { type: "RP_CHECKOUT_COMPLETE" } }, origin)).toBeNull();
    expect(commerceMessage({ origin, data: { type: "webpackHot" } }, origin)).toBeNull();
    expect(commerceMessage({ origin, data: null }, origin)).toBeNull();
  });
});

describe("isPreorderButton", () => {
  it("is true for pre-order button text, in any common spelling", () => {
    for (const t of ["Pre-order", "PREORDER", "Pre order now", "Reserve: pre-order"]) expect(isPreorderButton(t)).toBe(true);
  });
  it("is false otherwise", () => {
    for (const t of ["Buy now", "", undefined, "Order"]) expect(isPreorderButton(t)).toBe(false);
  });
});

describe("preorderItems", () => {
  it("returns the cart items whose product was added from a pre-order button", () => {
    const items = [{ product_id: "roam" }, { product_id: "lock" }];
    expect(preorderItems(items, new Set(["roam"]))).toEqual([{ product_id: "roam" }]);
    expect(preorderItems(null, new Set(["roam"]))).toEqual([]);
  });
});

describe("relayLyticsEvent", () => {
  it("sends to the stream, or without one, through the site's tag", () => {
    const jstag = { send: vi.fn(), identify: vi.fn(), pageView: vi.fn() };
    expect(relayLyticsEvent({ command: "send", stream: "rp_orders", payload: { a: 1 } }, jstag)).toBe(true);
    expect(jstag.send).toHaveBeenCalledWith("rp_orders", { a: 1 });
    relayLyticsEvent({ payload: { b: 2 } }, jstag);
    expect(jstag.send).toHaveBeenLastCalledWith({ b: 2 });
    relayLyticsEvent({ command: "identify", payload: { email: "x@example.com" } }, jstag);
    expect(jstag.identify).toHaveBeenCalledWith({ email: "x@example.com" });
  });
  it("is a no-op without a tag or with an unknown command", () => {
    expect(relayLyticsEvent({ payload: {} }, undefined)).toBe(false);
    expect(relayLyticsEvent({ command: "drop", payload: {} }, { send: vi.fn() })).toBe(false);
  });
});
