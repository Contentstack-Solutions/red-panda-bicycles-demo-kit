import Link from "next/link";
import { cslp } from "@/lib/contentstack-client";
import { renderAccentText, resolvePageHref, stripHtml } from "@/utils/text";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

// Scalloped "sticker" outline for the badge, built from alternating outer/inner
// points around a circle (12 points -> 24 vertices).
function burstPoints(cx, cy, points, outerR, innerR) {
  const step = Math.PI / points;
  const vertices = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    vertices.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return vertices.join(" ");
}

const BADGE_BURST_POINTS = burstPoints(48, 48, 12, 48, 40);

function Badge({ text, editTags }) {
  return (
    <div className="badge-sticker absolute -right-3 -top-3 z-10 h-24 w-24" {...editTags}>
      <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full drop-shadow-md">
        <polygon points={BADGE_BURST_POINTS} className="fill-accent" />
        <circle cx="48" cy="48" r="34" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="3 4" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-semibold leading-tight text-white">
        {text}
      </div>
    </div>
  );
}

// Category image always comes from the commerce platform (falling back to a
// dummy placeholder only if the picked item itself has no image). Title and
// description prefer the Contentstack fields and fall back to the commerce
// item's own copy when the editor hasn't overridden them. The card's href is
// always the commerce category's own slug, under /plp/.
function resolveCategoryCard(category, locale) {
  const commerceItem = category?.product_item?.items?.[0];
  const slug = commerceItem?.url;

  return {
    href: slug ? `/${locale}/plp/${slug}` : `/${locale}/plp`,
    image: commerceItem?.image || "/dummy/category-placeholder.svg",
    title: category?.title || commerceItem?.name || "",
    description: category?.description || stripHtml(commerceItem?.description),
    badge: category?.badge,
  };
}

export default function CategoryBanner({ data, locale = "en" }) {
  const categories = data?.category ?? [];
  const viewAllHref = resolvePageHref(data?.link_page, locale, "/bikes");
  return (
    <section className={`${sectionBackgroundClass(data?.background_color)} px-6 py-20`}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light" {...data?.$?.eyebrow_text}>
              {data?.eyebrow_text}
            </p>
            <h2 key={data?.title ?? ""} className="mt-3 font-serif text-4xl font-semibold text-ink" {...data?.$?.title}>
              {renderAccentText(data?.title)}
            </h2>
          </div>
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 border-b border-ink pb-0.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <span {...data?.$?.link_text}>{data?.link_text}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        </div>

        {categories.length === 0 && (
          <div className="visual-builder__empty-block-parent mt-6 h-40" {...data?.$?.category} />
        )}
        <div className="mt-6 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8" {...data?.$?.category}>
          {categories.map((category, index) => {
            const card = resolveCategoryCard(category, locale);
            return (
              <Link
                key={category._metadata?.uid || index}
                href={card.href}
                className="group block"
                {...cslp(data, "category__", index)}
              >
                <div className="relative">
                  <div className="aspect-3/2 w-full overflow-hidden bg-cream-dark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.image}
                      alt={card.title}
                      width={600}
                      height={400}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {card.badge && <Badge text={card.badge} editTags={category?.$?.badge} />}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-ink" {...category?.$?.title}>
                    {card.title}
                  </h3>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-ink transition-transform group-hover:translate-x-1"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </div>
                <p className="mt-1 text-sm text-ink-light" {...category?.$?.description}>
                  {card.description}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
