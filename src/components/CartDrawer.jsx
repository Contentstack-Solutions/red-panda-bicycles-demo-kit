"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/context/cart.context";
import CartLineItem from "@/components/CartLineItem";

export default function CartDrawer({ locale = "en" }) {
  const {
    items,
    updateQuantity,
    removeItem,
    clear,
    totalPrice,
    currencySymbol,
    loading,
    error,
    goToCheckout,
    drawerOpen,
    closeDrawer,
  } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, closeDrawer]);

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
    <div
      aria-hidden={!drawerOpen}
      className={`fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`}
    >
      <div
        onClick={closeDrawer}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className={`absolute right-0 top-0 flex h-full w-full flex-col bg-cream shadow-xl transition-transform duration-300 ease-out sm:w-[420px] ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-ink">Your Cart</h2>
          <button
            type="button"
            aria-label="Close cart"
            onClick={closeDrawer}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-cream-dark"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {error && <p className="mt-4 text-sm text-accent">{error}</p>}

          {loading ? null : items.length === 0 ? (
            <div className="mt-10 text-center">
              <p className="text-ink-light">Your cart is empty.</p>
              <Link
                href={`/${locale}/plp/bikes`}
                onClick={closeDrawer}
                className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-accent"
              >
                Continue shopping
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between py-4">
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
              {items.map((item) => (
                <CartLineItem
                  key={item.id}
                  item={item}
                  locale={locale}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeItem}
                  onNavigate={closeDrawer}
                  compact
                />
              ))}
            </>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-5">
            <div className="flex items-center justify-between text-sm text-ink">
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
              className="mt-4 block w-full rounded-full bg-ink py-4 text-center text-sm font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-80"
            >
              {checkingOut ? "Redirecting…" : "Checkout"}
            </button>
            <Link
              href={`/${locale}/cart`}
              onClick={closeDrawer}
              className="mt-3 block text-center text-xs font-medium text-ink-light underline decoration-ink/30 underline-offset-4 transition-colors hover:text-accent"
            >
              View full cart
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
