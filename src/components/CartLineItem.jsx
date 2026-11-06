"use client";

import Link from "next/link";
import { useState } from "react";

export default function CartLineItem({ item, locale, onUpdateQuantity, onRemove, onNavigate, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [lineError, setLineError] = useState(null);

  const withBusy = (fn) => async (...args) => {
    setBusy(true);
    setLineError(null);
    try {
      await fn(...args);
    } catch (err) {
      setLineError(err.message || "Could not update this item. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const productUrl = item.product_snapshot?.url;
  const href = productUrl ? `/${locale}/pdp/${productUrl}` : null;
  const thumbSize = compact ? "h-16 w-16" : "h-20 w-20";
  const qtyButtonSize = compact ? "h-7 w-7" : "h-8 w-8";
  const priceWidth = compact ? "w-16" : "w-24";

  const thumb = (
    <div className={`${thumbSize} shrink-0 overflow-hidden bg-cream-dark`}>
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
      )}
    </div>
  );

  const details = (
    <div className="min-w-0 flex-1">
      <p className={`truncate font-serif font-semibold text-ink ${compact ? "text-sm" : "text-lg"}`}>{item.name}</p>
      {item.unit_price != null && (
        <p className="mt-1 text-sm text-ink-light">
          {item.currency_symbol}
          {Number(item.unit_price).toLocaleString()}
        </p>
      )}
      {item.available === false && (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">No longer available</p>
      )}
    </div>
  );

  return (
    <div className={`border-b border-ink/10 last:border-b-0 ${compact ? "py-4" : "py-6"}`}>
      <div className={`flex items-center ${compact ? "gap-3" : "gap-4"}`}>
        {href ? (
          <Link
            href={href}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
          >
            {thumb}
            {details}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {thumb}
            {details}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={busy}
            onClick={() => withBusy(onUpdateQuantity)(item.id, item.quantity - 1)}
            className={`flex ${qtyButtonSize} items-center justify-center border border-ink/15 text-ink transition-colors hover:bg-cream-dark disabled:opacity-50`}
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-medium text-ink">{item.quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={busy}
            onClick={() => withBusy(onUpdateQuantity)(item.id, item.quantity + 1)}
            className={`flex ${qtyButtonSize} items-center justify-center border border-ink/15 text-ink transition-colors hover:bg-cream-dark disabled:opacity-50`}
          >
            +
          </button>
        </div>

        <p className={`${priceWidth} shrink-0 text-right text-sm font-semibold text-ink`}>
          {item.currency_symbol}
          {Number(item.line_total).toLocaleString()}
        </p>

        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          disabled={busy}
          onClick={() => withBusy(onRemove)(item.id)}
          className="shrink-0 text-ink-light transition-colors hover:text-accent disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {lineError && (
        <p role="alert" className="mt-2 text-xs font-medium text-accent">
          {lineError}
        </p>
      )}
    </div>
  );
}
