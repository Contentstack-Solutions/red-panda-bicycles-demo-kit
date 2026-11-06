import { cache } from "react";
import { headers } from "next/headers";
import ContentstackServer from "@/lib/cstack";
import { articleCards, livePreviewParams } from "@/lib/blog";
import BlogIndex from "@/components/BlogIndex";

const fetchBlog = cache(async (locale, livePreview) => {
  const variantParam = (await headers()).get("x-personalize-variants");
  const safe = (promise, label) =>
    promise.catch((error) => {
      console.error(`Failed to fetch ${label}`, error);
      return [];
    });
  const [page, articles] = await Promise.all([
    safe(ContentstackServer.getElementByType("blog_page", locale, livePreview, variantParam), "blog_page"),
    safe(ContentstackServer.getElementByType("blog_article", locale, livePreview, variantParam), "blog articles"),
  ]);
  // The index only renders cards, so no article body belongs in its HTML.
  return { page: page ?? [], articles: articleCards(articles) };
});

export async function generateMetadata({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;
  const { page } = await fetchBlog(locale, livePreviewParams(sp));
  const title = `${page[0]?.eyebrow_text || "The Journal"} | Red Panda Bicycles`;
  const description = page[0]?.intro;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function BlogPage({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;
  const { page, articles } = await fetchBlog(locale, livePreviewParams(sp));
  return <BlogIndex locale={locale} initialPage={page} initialArticles={articles} />;
}
