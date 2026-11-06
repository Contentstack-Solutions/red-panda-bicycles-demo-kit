"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { jsonToHTML } from "@contentstack/utils";
import { ContentstackClient } from "@/lib/contentstack-client";
import { BLOG_ARTICLE_REFERENCES } from "@/lib/blogReferences";
import { bylineParts, categoryLabel, hasTripPlanner, pickRelated } from "@/lib/blog";
import { renderAccentText } from "@/utils/text";
import ArticleCard from "@/components/ArticleCard";
import TripPlanner from "@/components/TripPlanner";

// jsonToHTML mutates the entry it is given, so render from a copy.
function bodyHtml(article) {
  if (!article?.body) return "";
  const copy = { uid: article.uid, body: structuredClone(article.body) };
  jsonToHTML({ entry: copy, paths: ["body"] });
  return typeof copy.body === "string" ? copy.body : "";
}

export default function ArticleView({ locale, initialArticle, allArticles }) {
  const [article, setArticle] = useState(initialArticle?.[0] ?? null);

  useEffect(() => {
    const url = initialArticle?.[0]?.url;
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByUrlWithRefs("blog_article", url, locale, BLOG_ARTICLE_REFERENCES, initialArticle);
      setArticle(data?.[0] ?? null);
    };
    ContentstackClient.onEntryChange(fetchData);
  }, [locale, initialArticle]);

  const html = useMemo(() => bodyHtml(article), [article]);
  if (!article) return null;

  const related = pickRelated(allArticles, article.uid, 2);
  const cover = article.cover_image;

  return (
    <>
      <article className="bg-cream px-6 pb-20 pt-12">
        <div className="mx-auto max-w-3xl">
          <Link href={`/${locale}/blog`} className="text-sm font-medium text-ink-light transition-colors hover:text-accent">
            ← The Journal
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-accent" {...article.$?.category}>
            {categoryLabel(article.category)}
          </p>
          <h1 key={article.title ?? ""} className="mt-3 font-serif text-4xl font-semibold leading-[1.1] text-ink md:text-5xl" {...article.$?.title}>
            {renderAccentText(article.title)}
          </h1>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-light">
            {bylineParts(article).map((part, index) => (
              <span key={part.key} className="contents">
                {index > 0 && <span aria-hidden="true">·</span>}
                {part.key === "author_name" && (
                  <span className="font-semibold text-ink" {...article.$?.author_name}>{part.text}</span>
                )}
                {part.key === "author_role" && <span {...article.$?.author_role}>{part.text}</span>}
                {part.key === "publish_date" && (
                  <time dateTime={article.publish_date} {...article.$?.publish_date}>{part.text}</time>
                )}
                {part.key === "reading_time" && <span>{part.text}</span>}
              </span>
            ))}
          </p>
        </div>

        <figure className="mx-auto mt-10 max-w-5xl">
          <div className="aspect-video w-full overflow-hidden bg-cream-dark">
            {cover?.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cover.url} alt={article.title} width={1600} height={900} className="h-full w-full object-cover" {...article.$?.cover_image} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] text-ink-light">
                {categoryLabel(article.category)}
              </div>
            )}
          </div>
        </figure>

        <div className="article-body mx-auto mt-12 max-w-[680px]" {...article.$?.body} dangerouslySetInnerHTML={{ __html: html }} />
      </article>

      {hasTripPlanner(article.trip_planner) && <TripPlanner data={article.trip_planner} locale={locale} />}

      {related.length > 0 && (
        <section className="border-t border-ink/10 bg-cream px-6 py-16">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-serif text-3xl font-semibold text-ink">
              Keep reading<span className="text-accent">.</span>
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ArticleCard key={item.uid} article={item} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
