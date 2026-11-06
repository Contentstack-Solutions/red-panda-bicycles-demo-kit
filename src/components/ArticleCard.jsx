import Link from "next/link";
import { articleHref, categoryLabel, readingMinutes } from "@/lib/blog";

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

// Shared Journal card: homepage previews, blog landing and "Keep reading".
export default function ArticleCard({ article, locale, featured = false, cslpProps = {} }) {
  const cover = article?.cover_image;
  const category = categoryLabel(article?.category);

  return (
    <Link
      href={articleHref(article, locale)}
      className={`group block ${featured ? "lg:grid lg:grid-cols-5 lg:items-center lg:gap-12" : ""}`}
      {...cslpProps}
    >
      <div className={`aspect-3/2 w-full overflow-hidden bg-cream-dark ${featured ? "lg:col-span-3" : ""}`}>
        {cover?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover.url}
            alt=""
            width={1200}
            height={800}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            {...article?.$?.cover_image}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">
            {category}
          </div>
        )}
      </div>
      <div className={featured ? "mt-6 lg:col-span-2 lg:mt-0" : "mt-5"}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent" {...article?.$?.category}>
          {category}
        </p>
        <h3
          className={featured ? "mt-3 font-serif text-3xl font-semibold leading-tight text-ink md:text-4xl" : "mt-2 text-lg font-semibold text-ink"}
          {...article?.$?.title}
        >
          {article?.title}
        </h3>
        {article?.excerpt && (
          <p className={featured ? "mt-3 text-lg leading-snug text-ink-light" : "mt-2 text-sm text-ink-light"} {...article?.$?.excerpt}>
            {article.excerpt}
          </p>
        )}
        <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-ink">
          {article?.reading_minutes ?? readingMinutes(article?.body)} min read <Arrow />
        </p>
      </div>
    </Link>
  );
}
