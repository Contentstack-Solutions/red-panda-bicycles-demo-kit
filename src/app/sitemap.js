import { headers } from "next/headers";
import ContentstackServer from "@/lib/cstack";
import RPCommerce from "@/lib/rpcommerce";

// sitemap.js runs server-side only (build/request time) — there's no
// `window` here. The closest equivalent is the incoming request's Host
// header, so the origin tracks whatever domain actually served the request.
// Regenerate on every request rather than at build time, since Contentstack
// and commerce entries can change without a redeploy.
export const dynamic = "force-dynamic";

const FALLBACK_BASE_URL = process.env.SITE_URL || "http://localhost:3000";
const LOCALES = ["en", "es", "fr", "de"];

async function resolveBaseUrl() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) return FALLBACK_BASE_URL;
  const proto = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function safeList(promise) {
  try {
    const result = await promise;
    return result ?? [];
  } catch {
    return [];
  }
}

function withLeadingSlash(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

export default async function sitemap() {
  const BASE_URL = await resolveBaseUrl();
  const entries = [];

  for (const locale of LOCALES) {
    entries.push({
      url: `${BASE_URL}/${locale}`,
      changeFrequency: "daily",
      priority: locale === "en" ? 1 : 0.9,
    });
    entries.push({
      url: `${BASE_URL}/${locale}/blog`,
      changeFrequency: "weekly",
      priority: 0.6,
    });

    const [articles, pages, products, categories] = await Promise.all([
      safeList(ContentstackServer.getElementByType("blog_article", locale, {}, undefined)),
      safeList(ContentstackServer.getElementByType("page", locale, {}, undefined)),
      safeList(RPCommerce.getAllProducts(locale)),
      safeList(RPCommerce.getAllCategories(locale)),
    ]);

    for (const article of articles) {
      if (!article?.url) continue;
      entries.push({
        url: `${BASE_URL}/${locale}${withLeadingSlash(article.url)}`,
        lastModified: article.updated_at ? new Date(article.updated_at) : undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }

    for (const page of pages) {
      if (!page?.url) continue;
      entries.push({
        url: `${BASE_URL}/${locale}${withLeadingSlash(page.url)}`,
        lastModified: page.updated_at ? new Date(page.updated_at) : undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }

    for (const category of categories) {
      if (!category?.url) continue;
      entries.push({
        url: `${BASE_URL}/${locale}/plp/${category.url}`,
        lastModified: category.updated_at ? new Date(category.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const product of products) {
      if (!product?.url) continue;
      entries.push({
        url: `${BASE_URL}/${locale}/pdp/${product.url}`,
        lastModified: product.updated_at ? new Date(product.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
