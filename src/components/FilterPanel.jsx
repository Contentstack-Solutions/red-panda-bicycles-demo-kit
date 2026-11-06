"use client";

import { useState } from "react";

const SORT_OPTIONS = [
  { value: "top_sellers", label: "Top sellers" },
  { value: "newest", label: "Newest" },
  { value: "price_low_high", label: "Price: low to high" },
  { value: "price_high_low", label: "Price: high to low" },
];

function FilterSection({ title, expanded, onToggle, children }) {
  return (
    <div className="border-b border-ink/10 py-4">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ink">{title}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {expanded && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

export default function FilterPanel({
  isOpen,
  onClose,
  sortBy,
  setSortBy,
  selectedFilters,
  onFilterChange,
  onResetAll,
  categoryFilters,
}) {
  const [expanded, setExpanded] = useState({ sort: true });
  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const tagGroups = categoryFilters?.filters?.tags?.filter((group) => group.tags?.length > 0) ?? [];
  const brands = categoryFilters?.filters?.brands ?? [];

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-cream shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Filter and sort products"
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
          <h2 className="font-serif text-xl font-semibold text-ink">Filter &amp; Sort</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="text-ink transition-colors hover:text-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          <FilterSection id="sort" title="Sort by" expanded={expanded.sort} onToggle={() => toggle("sort")}>
            {SORT_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
                <input
                  type="radio"
                  name="sort"
                  value={option.value}
                  checked={sortBy === option.value}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                {option.label}
              </label>
            ))}
          </FilterSection>

          {tagGroups.map((group) => (
            <FilterSection
              key={group.id}
              id={`tag_group_${group.id}`}
              title={group.name}
              expanded={!!expanded[`tag_group_${group.id}`]}
              onToggle={() => toggle(`tag_group_${group.id}`)}
            >
              {group.tags.map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selectedFilters.includes(`tag_${tag.id}`)}
                    onChange={(event) => onFilterChange(`tag_${tag.id}`, event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  {tag.name} <span className="text-ink-light">({tag.product_count})</span>
                </label>
              ))}
            </FilterSection>
          ))}

          {brands.length > 0 && (
            <FilterSection id="brands" title="Brand" expanded={!!expanded.brands} onToggle={() => toggle("brands")}>
              {brands.map((brand) => (
                <label key={brand.name} className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selectedFilters.includes(`brand_${brand.name}`)}
                    onChange={(event) => onFilterChange(`brand_${brand.name}`, event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  {brand.name} <span className="text-ink-light">({brand.product_count})</span>
                </label>
              ))}
            </FilterSection>
          )}
        </div>

        <div className="space-y-3 border-t border-ink/10 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-ink py-3 text-sm font-semibold uppercase tracking-wide text-cream transition-colors hover:bg-accent"
          >
            Show results
          </button>
          <button
            type="button"
            onClick={onResetAll}
            className="w-full rounded-full border border-ink/20 py-3 text-sm font-semibold uppercase tracking-wide text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Reset all
          </button>
        </div>
      </div>
    </>
  );
}
