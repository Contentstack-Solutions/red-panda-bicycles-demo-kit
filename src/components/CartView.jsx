"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/context/cart.context";
import CartLineItem from "@/components/CartLineItem";

export default function CartView({ locale = "en" }) {
  const { items, updateQuantity, removeItem, clear, totalPrice, currencySymbol, loading, error, goToCheckout } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleCheckout = () => {
    setCheckingOut(true);
    goToCheckout();
  };

  const handleClearAll = async () => {
    if (!window.confirm("Remove all items from your cart?")) return;
    setClearing(true);
    try {
      await clear();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold text-ink md:text-4xl">Your Cart</h1>

      {error && <p className="mt-4 text-sm text-accent">{error}</p>}

      {loading ? null : items.length === 0 ? (
        <div className="mt-10 border border-ink/10 bg-white p-10 text-center">
          <p className="text-ink-light">Your cart is empty.</p>
          <Link
            href={`/${locale}/plp/bikes`}
            className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-accent"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="border border-ink/10 bg-white lg:col-span-2">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">
                {items.length} item{items.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className="text-xs font-semibold uppercase tracking-wide text-ink-light underline decoration-ink/30 underline-offset-4 transition-colors hover:text-accent disabled:cursor-wait disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear all"}
              </button>
            </div>
            <div className="px-6">
              {items.map((item) => (
                <CartLineItem key={item.id} item={item} locale={locale} onUpdateQuantity={updateQuantity} onRemove={removeItem} />
              ))}
            </div>
          </div>

          <div className="h-fit border border-ink/10 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">Order Summary</h2>
            <div className="mt-4 flex items-center justify-between text-sm text-ink">
              <span>Subtotal</span>
              <span className="font-semibold">
                {currencySymbol}
                {totalPrice.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-light">Shipping and taxes calculated at checkout.</p>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkingOut}
              className="mt-6 block w-full rounded-full bg-ink py-4 text-center text-sm font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-80"
            >
              {checkingOut ? "Redirecting…" : "Checkout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
