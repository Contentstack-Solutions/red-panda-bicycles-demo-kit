import Link from "next/link";
import { renderAccentText, resolvePageHref } from "@/utils/text";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

const DARK_BACKGROUND = "#0D3B34";

export default function TextAndImage({ data, locale = "en" }) {
  const imageRight = Boolean(data?.image_right);
  const href = resolvePageHref(data?.page, locale, "/our-story");
  const textWhite = Boolean(data?.text_white);

  return (
    <section
      className={textWhite ? "" : sectionBackgroundClass(data?.background_color)}
      style={textWhite ? { backgroundColor: DARK_BACKGROUND } : undefined}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data?.image?.url}
          alt={data?.image?.title || ""}
          width={data?.image?.dimension?.width}
          height={data?.image?.dimension?.height}
          className={`h-80 w-full object-cover md:h-full ${imageRight ? "md:order-2" : ""}`}
          {...data?.$?.image}
        />

        <div className={`relative flex flex-col justify-center gap-6 px-8 py-16 md:px-16 ${imageRight ? "md:order-1" : ""}`}>
          <div className="max-w-md">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.2em] ${textWhite ? "text-cream/70" : "text-ink-light"}`}
              {...data?.$?.eyebrow_text}
            >
              {data?.eyebrow_text}
            </p>
            <h2
              key={data?.headline ?? ""}
              className={`mt-3 font-serif text-4xl font-semibold ${textWhite ? "text-white" : "text-ink"}`}
              {...data?.$?.headline}
            >
              {renderAccentText(data?.headline)}
            </h2>
            <p
              className={`mt-6 text-base leading-relaxed ${textWhite ? "text-cream/85" : "text-ink-light"}`}
              {...data?.$?.body}
            >
              {data?.body}
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
          </div>

          {data?.background_image?.url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.background_image.url}
              alt=""
              width={data.background_image.dimension?.width}
              height={data.background_image.dimension?.height}
              className={`pointer-events-none absolute bottom-0 hidden lg:block lg:w-44 xl:w-52 ${imageRight ? "left-0" : "right-0"}`}
              style={textWhite ? { backgroundColor: DARK_BACKGROUND } : undefined}
              {...data?.$?.background_image}
            />
          )}
        </div>
      </div>
    </section>
  );
}
