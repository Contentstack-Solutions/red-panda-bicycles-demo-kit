import { cache } from "react";
import { headers } from "next/headers";
import ContentstackServer from "@/lib/cstack";
import { fetchHomepageEntry } from "@/lib/homepageEntry";
import { articleCards, latestArticles } from "@/lib/blog";
import HomePage from "@/components/HomePage";

// Article Previews shows the newest articles, not a hand-picked list, so fetch them
// here on the server; the first render is already in the right order.
const fetchLatestArticles = cache(async (locale) => {
  const variantParam = (await headers()).get("x-personalize-variants");
  try {
    return articleCards(latestArticles(await ContentstackServer.getElementByType("blog_article", locale, {}, variantParam)));
  } catch (error) {
    console.error("Failed to fetch latest articles", error);
    return [];
  }
});

export default async function Home({ params }) {
  const { locale } = await params;
  const [entry, articles] = await Promise.all([fetchHomepageEntry(locale), fetchLatestArticles(locale)]);
  return <HomePage locale={locale} initialData={entry} latestArticles={articles} />;
}
