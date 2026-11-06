import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ContentstackServer from "@/lib/cstack";
import { BLOG_ARTICLE_REFERENCES } from "@/lib/blogReferences";
import { articleCards, livePreviewParams } from "@/lib/blog";
import { slimLinkedPages } from "@/lib/slimReferences";
import ArticleView from "@/components/ArticleView";

const variant = async () => (await headers()).get("x-personalize-variants");

const fetchArticle = cache(async (locale, slug, livePreview) => {
  try {
    const entries = await ContentstackServer.getElementByUrlWithRefs("blog_article", `/blog/${slug}`, locale, BLOG_ARTICLE_REFERENCES, livePreview, await variant());
    return slimLinkedPages(entries ?? []);
  } catch (error) {
    console.error("Failed to fetch blog article", error);
    return [];
  }
});

const fetchAllArticles = cache(async (locale) => {
  try {
    // Only used for the "Keep reading" cards, so drop every other article's body.
    return articleCards(await ContentstackServer.getElementByType("blog_article", locale, {}, await variant()));
  } catch (error) {
    console.error("Failed to fetch blog articles", error);
    return [];
  }
});

export async function generateMetadata({ params, searchParams }) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const article = (await fetchArticle(locale, slug, livePreviewParams(sp)))[0];
  if (!article) return { title: "Not Found | Red Panda Bicycles" };
  return {
    title: `${article.title} | Red Panda Bicycles`,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      images: article.cover_image?.url ? [article.cover_image.url] : undefined,
    },
  };
}

export default async function ArticlePage({ params, searchParams }) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const [article, allArticles] = await Promise.all([fetchArticle(locale, slug, livePreviewParams(sp)), fetchAllArticles(locale)]);
  if (!article.length) notFound();
  return <ArticleView key={slug} locale={locale} initialArticle={article} allArticles={allArticles} />;
}
