"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cslp } from "@/lib/contentstack-client";
import ProductCard from "@/components/ProductCard";

function ArrowButton({ direction, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-label={direction === "prev" ? "Previous accessories" : "Next accessories"}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 text-ink transition-colors hover:border-ink hover:bg-ink hover:text-cream disabled:pointer-events-none disabled:opacity-30"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {direction === "prev" ? <path d="M19 12H5M12 19l-7-7 7-7" /> : <path d="M5 12h14M12 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

// Horizontal, swipeable row of accessory cards. `items` come from
// recommendedAccessories(); `entry` is the pdp overlay entry, for Live Preview tags.
export default function AccessoryCarousel({ items, entry, locale = "en" }) {
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdges({ atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, items.length]);

  if (!items.length) return null;

  const scrollByPage = (sign) => {
    const el = trackRef.current;
    el?.scrollBy({ left: sign * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const overflows = !(edges.atStart && edges.atEnd);

  return (
    <section aria-labelledby="recommended-accessories" className="border-t border-ink/10 px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">Complete the ride</p>
            <h2 id="recommended-accessories" className="mt-3 font-serif text-3xl font-semibold text-ink md:text-4xl">
              Recommended Accessories
            </h2>
          </div>
          {overflows && (
            <div className="flex shrink-0 gap-2">
              <ArrowButton direction="prev" disabled={edges.atStart} onClick={() => scrollByPage(-1)} />
              <ArrowButton direction="next" disabled={edges.atEnd} onClick={() => scrollByPage(1)} />
            </div>
          )}
        </div>

        <ul
          ref={trackRef}
          className="scrollbar-hide mt-8 flex snap-x snap-mandatory gap-8 overflow-x-auto"
          {...entry?.$?.recommended_accessories}
        >
          {items.map(({ product, index }) => (
            <li key={product.id ?? index} className="w-64 shrink-0 snap-start sm:w-72" {...cslp(entry, "recommended_accessories__", index)}>
              <ProductCard product={product} locale={locale} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
