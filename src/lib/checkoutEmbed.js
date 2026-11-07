// Helpers for the RP Commerce checkout, which the site opens in an iframe (CheckoutOverlay)
// rather than navigating away, so it can hear the checkout's messages:
//   RP_CHECKOUT_REQUEST_PROFILE → the site replies RP_CHECKOUT_PREFILL with the member's details
//   RP_LYTICS_EVENT             → the site sends the purchase event through its own Lytics tag
//   RP_CHECKOUT_COMPLETE        → the site records any pre-order and starts a fresh cart

// The message's data when it came from the store's origin and is one of the RP_ messages.
export function commerceMessage(event, commerceOrigin) {
  if (!event || !commerceOrigin || event.origin !== commerceOrigin) return null;
  const data = event.data;
  return data && typeof data.type === "string" && data.type.startsWith("RP_") ? data : null;
}

// A product is a pre-order when its PDP's button says so (the pdp entry's button_text).
export function isPreorderButton(text) {
  return /pre[\s-]?order/i.test(String(text ?? ""));
}

export function preorderItems(items, preorderIds) {
  return (items ?? []).filter((item) => preorderIds.has(item.product_id));
}

// Sends an RP_LYTICS_EVENT through the site's tag, as RP Commerce's own embed script does.
export function relayLyticsEvent({ command = "send", stream = "", payload = {} } = {}, jstag) {
  if (!jstag) return false;
  try {
    if (command === "send" && typeof jstag.send === "function") {
      if (stream) jstag.send(stream, payload);
      else jstag.send(payload);
      return true;
    }
    if (command === "identify" && typeof jstag.identify === "function") return jstag.identify(payload), true;
    if (command === "pageView" && typeof jstag.pageView === "function") return jstag.pageView(payload), true;
  } catch {
    // the tag isn't ready; tracking never breaks checkout
  }
  return false;
}

const PREORDER_KEY = "rp_preorder_products";

export function readPreorderIds() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(PREORDER_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function rememberPreorder(productId) {
  const ids = readPreorderIds();
  ids.add(productId);
  try {
    window.localStorage.setItem(PREORDER_KEY, JSON.stringify([...ids]));
  } catch {
    // storage blocked: the pre-order still goes through, it just isn't recorded as one
  }
}

export function forgetPreorders() {
  try {
    window.localStorage.removeItem(PREORDER_KEY);
  } catch {
    // ignore
  }
}
