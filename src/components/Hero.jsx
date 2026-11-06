import Link from "next/link";
import { cslp } from "@/lib/contentstack-client";
import { renderAccentText, renderMultilineText, resolvePageHref } from "@/utils/text";
import VariantImpressions from "@/components/VariantImpressions";

export default function Hero({ data, locale = "en" }) {
  const href = resolvePageHref(data?.page, locale);
  const trustStrip = data?.trust_strip;
  const trustItems = trustStrip?.items ?? [];

  return (
    <section className="relative isolate overflow-hidden">
      <VariantImpressions entry={data} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data?.image?.url}
        alt={data?.image?.title || ""}
        {...data?.$?.image}
        className="h-[560px] w-full object-cover object-right sm:object-center md:h-160"
      />

      <div className="absolute inset-y-0 left-0 w-full bg-linear-to-r from-cream via-cream/85 to-transparent md:w-3/5 md:via-cream/78" />

      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light" {...data?.$?.eyebrow_text}>
              {data?.eyebrow_text}
            </p>
            <h1 key={data?.headline ?? ""} className="mt-4 font-serif text-5xl font-semibold leading-[1.05] text-ink md:text-6xl" {...data?.$?.headline}>
              {renderAccentText(data?.headline)}
            </h1>
            <p key={data?.description ?? ""} className="mt-6 max-w-md text-lg leading-tight tracking-tight text-ink-light" {...data?.$?.description}>
              {renderMultilineText(data?.description)}
            </p>
            <Link
              href={href}
              className="mt-8 inline-flex items-center gap-2 bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
            >
              <span {...data?.$?.button_text}>{data?.button_text}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>

            {trustItems.length > 0 && (
              <div className="mt-10 flex flex-nowrap gap-6" {...trustStrip?.$?.items}>
                {trustItems.map((item, index) => (
                  <div
                    key={item._metadata?.uid || index}
                    className="flex items-start gap-3"
                    {...cslp(trustStrip, "items__", index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image?.url}
                      alt=""
                      width={24}
                      height={24}
                      className="mt-0.5 h-6 w-6 shrink-0"
                      {...item?.$?.image}
                    />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink" {...item?.$?.title}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-ink-light" {...item?.$?.description}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
