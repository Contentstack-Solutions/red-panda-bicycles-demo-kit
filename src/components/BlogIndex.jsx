"use client";
import { useEffect, useState } from "react";
import { ContentstackClient } from "@/lib/contentstack-client";
import { publishedArticles, sortByPublishDate } from "@/lib/blog";
import { renderAccentText, renderMultilineText } from "@/utils/text";
import ArticleCard from "@/components/ArticleCard";

export default function BlogIndex({ locale, initialPage, initialArticles }) {
  const [page, setPage] = useState(initialPage?.[0] ?? null);
  const [articles, setArticles] = useState(initialArticles ?? []);

  useEffect(() => {
    const fetchData = async () => {
      const [pageData, articleData] = await Promise.all([
        ContentstackClient.getElementByType("blog_page", locale, initialPage),
        ContentstackClient.getElementByType("blog_article", locale, initialArticles),
      ]);
      setPage(pageData?.[0] ?? null);
      setArticles(articleData ?? []);
    };
    ContentstackClient.onEntryChange(fetchData);
  }, [locale, initialPage, initialArticles]);

  const [featured, ...rest] = sortByPublishDate(publishedArticles(articles));

  return (
    <div className="bg-cream px-6 pb-20 pt-16">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light" {...page?.$?.eyebrow_text}>
          {page?.eyebrow_text}
        </p>
        <h1 key={page?.headline ?? ""} className="mt-3 font-serif text-5xl font-semibold leading-[1.05] text-ink md:text-6xl" {...page?.$?.headline}>
          {renderAccentText(page?.headline)}
        </h1>
        {page?.intro && (
          <p key={page.intro} className="mt-5 max-w-2xl text-lg leading-snug text-ink-light" {...page?.$?.intro}>
            {renderMultilineText(page.intro)}
          </p>
        )}

        {featured && (
          <div className="mt-14">
            <ArticleCard article={featured} locale={locale} featured />
          </div>
        )}
        {rest.length > 0 && (
          <div className="mt-16 grid grid-cols-1 gap-10 border-t border-ink/10 pt-12 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article) => (
              <ArticleCard key={article.uid} article={article} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
