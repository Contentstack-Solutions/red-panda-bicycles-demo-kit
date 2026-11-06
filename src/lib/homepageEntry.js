import { cache } from "react";
import { headers } from "next/headers";
import ContentstackServer from "@/lib/cstack";
import { HOMEPAGE_REFERENCES } from "@/lib/homepageReferences";
import { slimLinkedPages } from "@/lib/slimReferences";
import { articleCards } from "@/lib/blog";

// Cached per request so the locale layout's metadata and the homepage route share
// one fetch. Only the homepage route passes the entry to the client - the layout
// reads it server-side for SEO, which keeps this (large) entry out of every other
// page's payload.
export const fetchHomepageEntry = cache(async (locale) => {
  const variantParam = (await headers()).get("x-personalize-variants");
  const entries = await ContentstackServer.getElementByTypeWithRefs("homepage", locale, HOMEPAGE_REFERENCES, {}, variantParam);

  return (entries ?? []).map((entry) => {
    const slim = slimLinkedPages(entry);
    for (const block of slim.modular_blocks ?? []) {
      if (block.article_previews?.articles) block.article_previews.articles = articleCards(block.article_previews.articles);
    }
    return slim;
  });
});
