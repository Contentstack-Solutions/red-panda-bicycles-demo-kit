"use client";

import { useMemo, useState } from "react";
import ProductCard from "./ProductCard";
import FilterPanel from "./FilterPanel";

function isInFilter(product, filter) {
  if (filter.length === 0) return true;

  const tagFilters = filter.filter((f) => f.startsWith("tag_")).map((f) => parseInt(f.replace("tag_", ""), 10));
  const brandFilters = filter.filter((f) => f.startsWith("brand_")).map((f) => f.replace("brand_", ""));

  if (tagFilters.length > 0) {
    const productTagIds = product.tags?.map((tag) => tag.id) ?? [];
    if (!tagFilters.some((id) => productTagIds.includes(id))) return false;
  }

  if (brandFilters.length > 0) {
    const brand = product.brand;
    if (!brandFilters.some((name) => brand && name.toLowerCase() === String(brand).toLowerCase())) return false;
  }

  return true;
}

function sortProducts(products, sortBy) {
  const sorted = [...products];
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    case "price_low_high":
      return sorted.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
    case "price_high_low":
      return sorted.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
    default:
      return sorted;
  }
}

export default function PLPGrid({ products, filters, locale = "en" }) {
  const [filter, setFilter] = useState([]);
  const [sortBy, setSortBy] = useState("top_sellers");
  const [panelOpen, setPanelOpen] = useState(false);

  const handleFilterChange = (item, isOn) => {
    setFilter((prev) => (isOn ? [...prev, item] : prev.filter((f) => f !== item)));
  };

  const handleResetAll = () => {
    setFilter([]);
    setSortBy("top_sellers");
  };

  const visibleProducts = useMemo(() => {
    const filtered = (products ?? []).filter((product) => isInFilter(product, filter));
    return sortProducts(filtered, sortBy);
  }, [products, filter, sortBy]);

  return (
    <section className="mx-auto max-w-7xl px-6 pb-24 pt-8">
      <div className="flex items-center justify-between border-b border-ink/10 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">
          {visibleProducts.length} {visibleProducts.length === 1 ? "result" : "results"}
        </p>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Filter &amp; Sort
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      </div>

      {visibleProducts.length === 0 ? (
        <p className="py-24 text-center text-sm text-ink-light">No products match your filters yet.</p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id || product.url} product={product} locale={locale} />
          ))}
        </div>
      )}

      <FilterPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        sortBy={sortBy}
        setSortBy={setSortBy}
        selectedFilters={filter}
        onFilterChange={handleFilterChange}
        onResetAll={handleResetAll}
        categoryFilters={filters}
      />
    </section>
  );
}
