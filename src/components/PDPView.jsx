"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/cart.context";
import { usePersonalize } from "@/context/personalize.context";
import { trackAddToCart } from "@/lib/analytics";
import { ContentstackClient } from "@/lib/contentstack-client";
import { applyOverlay, recommendedAccessories } from "@/lib/pdpOverlay";
import PromoBanner from "@/components/PromoBanner";
import AccessoryCarousel from "@/components/AccessoryCarousel";

export default function PDPView({ commerceProduct, initialOverlayEntries, slug, locale = "en", category }) {
  const [overlayEntries, setOverlayEntries] = useState(initialOverlayEntries ?? []);

  useEffect(() => {
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByUrl("pdp", `/pdp/${slug}`, locale, initialOverlayEntries);
      setOverlayEntries(data ?? []);
    };
    ContentstackClient.onEntryChange(fetchData);
  }, [locale, slug, initialOverlayEntries]);

  const product = useMemo(
    () => applyOverlay(commerceProduct, overlayEntries?.[0] ?? null),
    [commerceProduct, overlayEntries]
  );

  const accessories = useMemo(() => recommendedAccessories(overlayEntries?.[0] ?? null), [overlayEntries]);

  const media = product.media?.length > 0 ? product.media : product.image ? [{ id: "primary", path: product.image }] : [];
  const [activeImage, setActiveImage] = useState(0);
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);
  const { addItem } = useCart();
  const personalize = usePersonalize();

  const outOfStock = product.available === false || (typeof product.stock_quantity === "number" && product.stock_quantity <= 0);

  const handleAddToCart = async () => {
    if (outOfStock || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      // Track only real adds (addItem returns false when the cart isn't set up).
      if (await addItem(product.id, 1, locale)) trackAddToCart(personalize, product);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <PromoBanner text={product.promoBanner} editTags={overlayEntries?.[0]?.$?.promo_banner} />
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Link
          href={category?.url ? `/${locale}/plp/${category.url}` : `/${locale}/plp/bikes`}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-light transition-colors hover:text-accent"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to {category?.name || "shop"}
        </Link>

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <div className="w-full overflow-hidden">
              {media[activeImage]?.path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media[activeImage].path} alt={product.name} className="h-auto w-full object-contain" />
              )}
            </div>

            {media.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {media.map((image, index) => (
                  <button
                    key={image.id ?? index}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={`h-20 w-20 shrink-0 overflow-hidden border-2 transition-colors ${
                      index === activeImage ? "border-ink" : "border-transparent"
                    }`}
                    aria-label={`Show image ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.path} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {(product.eyebrowText || product.brand) && (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">{product.eyebrowText || product.brand}</p>
            )}
            <h1 className="mt-2 font-serif text-3xl font-semibold text-ink md:text-4xl">{product.name}</h1>

            {product.price != null && product.price !== "" && (
              <p className="mt-4 text-2xl font-semibold text-ink">
                {product.currency_symbol}
                {Number(product.price).toLocaleString()}
              </p>
            )}

            {product.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-cream-dark px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-light"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={outOfStock || adding}
              className="mt-8 w-full rounded-full bg-ink py-4 text-sm font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-ink/30 sm:w-auto sm:px-12"
            >
              {outOfStock ? "Out of stock" : adding ? "Adding…" : product.buttonText || "Buy Now"}
            </button>
            {addError && <p className="mt-3 text-sm text-accent">{addError}</p>}

            {product.description && (
              <div className="mt-10 border-t border-ink/10 pt-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">Description</h2>
                <div
                  className="mt-3 text-sm leading-relaxed text-ink [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <AccessoryCarousel items={accessories} entry={overlayEntries?.[0]} locale={locale} />
    </>
  );
}
