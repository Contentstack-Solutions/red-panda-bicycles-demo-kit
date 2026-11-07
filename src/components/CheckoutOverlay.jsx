"use client";

import { useEffect, useRef } from "react";
import { commerceMessage, relayLyticsEvent } from "@/lib/checkoutEmbed";

// The RP Commerce checkout in a full-screen iframe over the site. Keeping the shopper on the site
// lets it answer the checkout's messages (see lib/checkoutEmbed.js) and record the order.
export default function CheckoutOverlay({ url, commerceOrigin, profile, onComplete, onClose }) {
  const frameRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const onMessage = (event) => {
      const data = commerceMessage(event, commerceOrigin);
      if (!data) return;
      if (data.type === "RP_CHECKOUT_REQUEST_PROFILE" && profile) {
        frameRef.current?.contentWindow?.postMessage({ type: "RP_CHECKOUT_PREFILL", profile }, commerceOrigin);
      } else if (data.type === "RP_LYTICS_EVENT") {
        relayLyticsEvent(data, window.jstag);
      } else if (data.type === "RP_CHECKOUT_COMPLETE" && !completedRef.current) {
        completedRef.current = true;
        onComplete?.({ orderId: data.orderId, orderNumber: data.orderNumber });
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [commerceOrigin, profile, onComplete, onClose]);

  // The confirmation's "Continue shopping" link loads this site inside the frame. Once the frame
  // is same-origin again, close the overlay instead of showing the site within itself.
  const handleLoad = () => {
    try {
      if (frameRef.current?.contentWindow?.location?.origin === window.location.origin) onClose?.();
    } catch {
      // still on the store's origin
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-cream" role="dialog" aria-modal="true" aria-label="Checkout">
      <div className="flex items-center justify-between border-b border-ink/10 px-6 py-3">
        <p className="font-serif text-lg font-semibold text-ink">Checkout</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Close
        </button>
      </div>
      <iframe ref={frameRef} src={url} title="Checkout" onLoad={handleLoad} className="w-full flex-1 border-0" allow="payment" />
    </div>
  );
}
