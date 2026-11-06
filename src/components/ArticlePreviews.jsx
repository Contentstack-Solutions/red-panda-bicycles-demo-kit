import Link from "next/link";
import { cslp } from "@/lib/contentstack-client";
import { renderAccentText } from "@/utils/text";
import ArticleCard from "@/components/ArticleCard";
import { previewArticles } from "@/lib/blog";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

// Shows the block's hand-picked `articles` references, newest first. If none resolve,
// the newest published articles (`latestArticles`, fetched by the homepage route).
export default function ArticlePreviews({ data, locale = "en", latestArticles = [] }) {
  const picked = previewArticles(data?.articles, latestArticles);
  const automatic = picked[0]?.index === null;
  const cards = picked.map(({ article, index }) => ({
    article,
    cslpProps: automatic ? {} : cslp(data, "articles__", index),
  }));

  return (
    <section className={`border-b border-ink/10 ${sectionBackgroundClass(data?.background_color, "bg-blue-gray")} px-6 py-20`}>
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
            href={`/${locale}/blog`}
            className="inline-flex items-center gap-1 border-b border-ink pb-0.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <span {...data?.$?.link_text}>{data?.link_text}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        </div>

        {cards.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8" {...(automatic ? {} : data?.$?.articles)}>
            {cards.map(({ article, cslpProps }) => (
              <ArticleCard key={article.uid} article={article} locale={locale} cslpProps={cslpProps} />
            ))}
          </div>
        ) : (
          <div className="visual-builder__empty-block-parent mt-8 h-40" {...data?.$?.articles} />
        )}
      </div>
    </section>
  );
}
