import Link from "next/link";
import { cslp } from "@/lib/contentstack-client";
import { renderAccentText, resolvePageHref } from "@/utils/text";

// 16-point starburst for the product badge sticker
const STARBURST_POINTS = Array.from({ length: 32 }, (_, i) => {
  const angle = (Math.PI * i) / 16;
  const radius = i % 2 === 0 ? 50 : 42;
  return `${(50 + radius * Math.sin(angle)).toFixed(2)},${(50 - radius * Math.cos(angle)).toFixed(2)}`;
}).join(" ");

function ProductBadge({ product }) {
  return (
    <div className="badge-sticker absolute -right-3 -top-4 z-10 h-24 w-24 drop-shadow-[0_3px_4px_rgba(28,43,61,0.25)]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <polygon points={STARBURST_POINTS} className="fill-accent" />
        <circle cx="50" cy="50" r="35" fill="none" stroke="var(--color-cream)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center px-5 text-center font-serif text-[15px] font-semibold italic leading-[1.05] text-cream"
        {...product?.$?.badge}
      >
        {product.badge}
      </span>
    </div>
  );
}

export default function ProductBanner({ data, locale = "en" }) {
  const products = data?.products ?? [];
  const viewAllHref = resolvePageHref(data?.link_page, locale, "/plp/bikes");
console.info("ProductBanner data", data);
  return (
    <section className="bg-cream px-6 py-20">
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

        {products.length === 0 && (
          <div className="visual-builder__empty-block-parent mt-6 h-40" {...data?.$?.products} />
        )}
        <div className="mt-6 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8" {...data?.$?.products}>
          {products.map((product, index) => {
            const commerceItem = product?.product_item?.items?.[0];
            const image = product.image?.url || commerceItem?.image;
            const features = (product.features ?? []).flatMap((group) => group?.item ?? []);
            const href = commerceItem?.url ? `/${locale}/pdp/${commerceItem.url}` : `/${locale}/pdp`;

            return (
              <Link
                key={product._metadata?.uid || index}
                href={href}
                className="group block"
                {...cslp(data, "products__", index)}
              >
                <div className="relative">
                  <div className="aspect-3/2 w-full overflow-hidden bg-cream-dark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={product.title}
                      width={600}
                      height={400}
                      className="h-full w-full object-cover"
                      {...product?.$?.image}
                    />
                  </div>
                  {product.badge && <ProductBadge product={product} />}
                </div>
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-ink" {...product?.$?.title}>
                    {product.title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-light" {...product?.$?.description}>
                    {product.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <ul className="flex-1 space-y-1.5">
                    {features.map((feature, featureIndex) => (
                      <li
                        key={feature?._metadata?.uid || featureIndex}
                        className="flex items-center gap-2 text-sm text-ink-light"
                      >
                        {feature?.icon?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={feature.icon.url}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0"
                            {...feature?.$?.icon}
                          />
                        ) : (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-light/50" />
                        )}
                        <span {...feature?.$?.title}>{feature?.title}</span>
                      </li>
                    ))}
                  </ul>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-10 shrink-0 text-ink transition-transform group-hover:translate-x-1"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
