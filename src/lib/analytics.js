// Browser analytics: Lytics events (window.jstag) and Personalize events
// (the Edge SDK instance from usePersonalize). Every call is a no-op when its
// SDK is missing, so tracking can never break the page.

export const CART_STREAM = "rp_cart";
// Same stream (and mappings) the seeded order history uses.
export const ORDER_STREAM = "rp_orders";

// Event keys to create in Personalize (Events) so conversions can be reported.
export const PERSONALIZE_EVENTS = {
  bikeRecommendationClicked: "bike_recommendation_clicked",
  addToCart: "add_to_cart",
  checkoutStarted: "checkout_started",
  preorderCompleted: "preorder_completed",
};

// Resolves once the tag reports the send (or straight away without the tag).
export function sendLytics(stream, payload) {
  const jstag = typeof window !== "undefined" ? window?.jstag : undefined;
  if (typeof jstag?.send !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      jstag.send(stream, payload, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

// Resolves to whether the event was accepted; an unknown event key never throws.
export function triggerPersonalizeEvent(sdk, eventKey) {
  if (typeof sdk?.triggerEvent !== "function") return Promise.resolve(false);
  return Promise.resolve()
    .then(() => sdk.triggerEvent(eventKey))
    .then(() => true, () => false);
}

// Waits for tracking to finish before a page change, but never longer than maxMs.
export function settle(promise, maxMs = 800) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, maxMs))]);
}

export function buildAddToCartEvent({ product, quantity = 1 }) {
  return {
    event: "add_to_cart",
    product: product?.name,
    product_id: product?.id,
    quantity,
    unit_price: product?.price,
  };
}

export function buildCheckoutEvent({ items, subtotal }) {
  return {
    event: "checkout_started",
    products: (items ?? []).map((item) => item.name),
    item_count: (items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0),
    cart_subtotal: subtotal,
  };
}

// Matches the seeded rp_orders records, so roam_preorder_ts and trade_in map as before.
export function buildPreorderEvent({ product = "RP Roam", tradeIn } = {}) {
  return {
    action: "preorder",
    product,
    product_kind: "ebike",
    ...(tradeIn ? { trade_in: tradeIn } : {}),
  };
}

export function trackAddToCart(sdk, product, quantity = 1) {
  return Promise.all([
    sendLytics(CART_STREAM, buildAddToCartEvent({ product, quantity })),
    triggerPersonalizeEvent(sdk, PERSONALIZE_EVENTS.addToCart),
  ]);
}

export function trackCheckoutStarted(sdk, items, subtotal) {
  return Promise.all([
    sendLytics(CART_STREAM, buildCheckoutEvent({ items, subtotal })),
    triggerPersonalizeEvent(sdk, PERSONALIZE_EVENTS.checkoutStarted),
  ]);
}

// For the pre-order checkout (F5): moves the roam_preorder count and marks the
// conversion. Await it (via settle) before navigating away.
export function trackPreorder(sdk, { product, tradeIn } = {}) {
  return Promise.all([
    sendLytics(ORDER_STREAM, buildPreorderEvent({ product, tradeIn })),
    triggerPersonalizeEvent(sdk, PERSONALIZE_EVENTS.preorderCompleted),
  ]);
}

// Personalize variant aliases (cs_personalize_<experience>_<variant>) applied to an entry.
export function impressionAliases(entry) {
  const applied = entry?._applied_variants;
  if (!applied || typeof applied !== "object") return [];
  return [...new Set(Object.values(applied).filter((alias) => typeof alias === "string" && alias.startsWith("cs_personalize_")))];
}

export function trackImpressions(sdk, entry) {
  const aliases = impressionAliases(entry);
  if (!aliases.length || typeof sdk?.triggerImpressions !== "function") return false;
  Promise.resolve()
    .then(() => sdk.triggerImpressions({ aliases }))
    .catch(() => {});
  return true;
}
