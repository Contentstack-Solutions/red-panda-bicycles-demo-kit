import { cslp } from "@/lib/contentstack-client";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

export default function TrustStrip({ data }) {
  const items = data?.items ?? [];

  return (
    <section className={`border-y border-ink/10 ${sectionBackgroundClass(data?.background_color, "bg-white")}`}>
      {items.length === 0 && (
        <div className="visual-builder__empty-block-parent h-40" {...data?.$?.items} />
      )}
      <div className="mx-auto flex max-w-7xl flex-col items-start sm:flex-row" {...data?.$?.items}>
        {items.map((item, index) => (
          <div
            key={item._metadata?.uid || index}
            className="relative flex w-full flex-1 flex-col items-center gap-4 px-6 py-6 text-center"
            {...cslp(data, "items__", index)}
          >
            {index > 0 && (
              <>
                <span className="absolute inset-x-6 top-0 h-px bg-ink/10 sm:hidden" />
                <span className="absolute inset-y-6 left-0 hidden w-px bg-ink/10 sm:block" />
              </>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image?.url} alt="" width={48} height={48} className="h-12 w-12" {...item?.$?.image} />
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
    </section>
  );
}
