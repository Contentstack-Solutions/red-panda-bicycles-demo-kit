// 12-point starburst, the same shape as the product badge stickers, at glyph size
const BURST_POINTS = Array.from({ length: 24 }, (_, i) => {
  const angle = (Math.PI * i) / 12;
  const radius = i % 2 === 0 ? 12 : 9;
  return `${(12 + radius * Math.sin(angle)).toFixed(2)},${(12 - radius * Math.cos(angle)).toFixed(2)}`;
}).join(" ");

// Full-width offer strip for the top of a page. The dashed rules echo the stickers'
// perforated ring so it reads as a coupon rather than a site notice.
export default function PromoBanner({ text, editTags }) {
  if (!text) return null;

  return (
    <aside aria-label="Promotion" className="bg-accent py-1 text-white">
      <div className="border-y border-dashed border-white/40">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-6 py-2.5">
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <polygon points={BURST_POINTS} className="fill-cream" />
            </svg>
            Offer
          </span>
          <span className="h-4 w-px shrink-0 bg-white/40" aria-hidden="true" />
          <p className="text-sm font-medium leading-snug" {...editTags}>
            {text}
          </p>
        </div>
      </div>
    </aside>
  );
}
