import { renderAccentText } from "@/utils/text";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

export default function Newsletter({ data }) {
  return (
    <section className={`${sectionBackgroundClass(data?.background_color)} px-6 py-16`}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
        <h2 key={data?.title ?? ""} className="font-serif text-3xl font-semibold text-ink" {...data?.$?.title}>
          {renderAccentText(data?.title)}
        </h2>
        <form className="flex w-full max-w-md">
          <input
            type="email"
            placeholder={data?.placeholder}
            className="w-full border border-ink/15 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-light/60 focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            <span {...data?.$?.button_text}>{data?.button_text}</span>
          </button>
        </form>
      </div>
    </section>
  );
}
