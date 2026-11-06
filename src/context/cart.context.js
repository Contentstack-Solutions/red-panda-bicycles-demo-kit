"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePersonalize } from "@/context/personalize.context";
import { settle, trackCheckoutStarted } from "@/lib/analytics";

const CartContext = createContext(null);

const COMMERCE_ORIGIN = (process.env.RED_PANDA_COMMERCE_API_URL || "").replace(/\/$/, "");
const STORE_ID = process.env.RED_PANDA_COMMERCE_STPRE_ID || "";
const STORE_TOKEN = process.env.RED_PANDA_COMMERCE_STPRE_TOKEN || "";

function sessionStorageKey() {
  return `rpc_cart_session_${STORE_ID}`;
}

function readOrCreateSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(sessionStorageKey());
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(sessionStorageKey(), created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}

export default function CartProvider({ children, memberEmail = null }) {
  const personalize = usePersonalize();
  const [sessionId, setSessionId] = useState(null);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const configured = Boolean(COMMERCE_ORIGIN && STORE_ID && STORE_TOKEN);

  useEffect(() => {
    if (!configured) return;
    setSessionId(readOrCreateSessionId());
  }, [configured]);

  const cartFetch = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${COMMERCE_ORIGIN}/api/public/store/${STORE_ID}/cart${path}`, {
        ...options,
        headers: {
          Authorization: STORE_TOKEN,
          "Cart-Session-Id": sessionId,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Cart request failed (${res.status})`);
      }
      return data;
    },
    [sessionId]
  );

  const refreshCart = useCallback(async () => {
    if (!configured || !sessionId) return;
    try {
      setLoading(true);
      const data = await cartFetch("");
      setCart(data.cart);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cartFetch, configured, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const addItem = useCallback(
    async (productId, quantity = 1, locale = "en") => {
      if (!configured || !sessionId || !productId) return false;
      setError(null);
      const data = await cartFetch("/items", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, quantity, locale }),
      });
      setCart(data.cart);
      setDrawerOpen(true);
      return true;
    },
    [cartFetch, configured, sessionId]
  );

  const removeItem = useCallback(
    async (itemId) => {
      const data = await cartFetch(`/items/${itemId}`, { method: "DELETE" });
      setCart(data.cart);
    },
    [cartFetch]
  );

  const updateQuantity = useCallback(
    async (itemId, quantity) => {
      if (quantity <= 0) {
        await removeItem(itemId);
        return;
      }
      const data = await cartFetch(`/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      setCart(data.cart);
    },
    [cartFetch, removeItem]
  );

  const clear = useCallback(async () => {
    await cartFetch("", { method: "DELETE" });
    await refreshCart();
  }, [cartFetch, refreshCart]);

  const getCheckoutUrl = useCallback(() => {
    if (!configured || !sessionId || typeof window === "undefined") return null;
    const params = new URLSearchParams({
      storeId: STORE_ID,
      sessionId,
      siteOrigin: window.location.origin,
    });
    if (memberEmail) params.set("prefillEmail", memberEmail);
    const url = new URL(`${COMMERCE_ORIGIN}/embed/checkout?${params.toString()}`);
    url.hash = `token=${encodeURIComponent(STORE_TOKEN)}`;
    return url.toString();
  }, [configured, sessionId, memberEmail]);

  const goToCheckout = useCallback(async () => {
    const url = getCheckoutUrl();
    if (!url) return;
    await settle(trackCheckoutStarted(personalize, cart?.items, cart?.subtotal));
    window.location.href = url;
  }, [getCheckoutUrl, personalize, cart]);

  const value = useMemo(
    () => ({
      items: cart?.items ?? [],
      totalCount: cart?.item_count ?? 0,
      totalPrice: cart?.subtotal ?? 0,
      currencySymbol: cart?.currency_symbol ?? "",
      loading,
      error,
      addItem,
      removeItem,
      updateQuantity,
      clear,
      goToCheckout,
      drawerOpen,
      openDrawer,
      closeDrawer,
    }),
    [cart, loading, error, addItem, removeItem, updateQuantity, clear, goToCheckout, drawerOpen, openDrawer, closeDrawer]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
