import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ContentstackServer from "@/lib/cstack";
import { PLP_REFERENCES } from "@/lib/plpReferences";
import { slimLinkedPages } from "@/lib/slimReferences";
import RPCommerce from "@/lib/rpcommerce";
import DataContextProvider from "@/context/data.context";

const FETCH_OPTIONS = { next: { revalidate: 300 } };

function stripHtml(html) {
  if (!html) return undefined;
  return html.replace(/<[^>]*>/g, "").trim() || undefined;
}

// Category URLs in the commerce catalog are flat single segments even for
// nested categories, so only the last path segment resolves the category -
// earlier segments just express the browsing trail, e.g. /plp/bikes/e-bikes.
const resolveCommerce = cache(async (locale, slugSegments) => {
  const categorySlug = slugSegments[slugSegments.length - 1];
  const category = await RPCommerce.getCategoryByURL(categorySlug, locale, true, 2, FETCH_OPTIONS);
  if (!category?.id) return null;

  const [products, filters] = await Promise.all([
    RPCommerce.getProductsByCategory(category.id, locale, FETCH_OPTIONS),
    RPCommerce.getCategoryFilters(category.id, locale, FETCH_OPTIONS),
  ]);

  return { category, products: products ?? [], filters };
});

const fetchPlpEntry = cache(async (locale, slugSegments) => {
  const headersList = await headers();
  const variantParam = headersList.get("x-personalize-variants");
  const url = `/plp/${slugSegments.join("/")}`;
  try {
    return slimLinkedPages(await ContentstackServer.getElementByUrlWithRefs("e_bikes", url, locale, PLP_REFERENCES, {}, variantParam));
  } catch (error) {
    console.error("Failed to fetch plp entry", error);
    return null;
  }
});

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const [entryData, commerce] = await Promise.all([fetchPlpEntry(locale, slug), resolveCommerce(locale, slug)]);
  const entry = entryData?.[0];
  const category = commerce?.category;

  if (!entry && !category) {
    return { title: "Not Found | Red Panda Bicycles" };
  }

  return {
    title: entry?.seo?.title || `${category?.name} | Red Panda Bicycles`,
    description:
      entry?.seo?.description || stripHtml(category?.description) || `Shop the ${category?.name} collection from Red Panda Bicycles.`,
    robots: entry?.seo
      ? { index: !entry.seo.no_index, follow: !entry.seo.no_follow }
      : undefined,
    openGraph: {
      title: entry?.seo?.og_meta_tags?.title || entry?.title || category?.name,
      description: entry?.seo?.og_meta_tags?.description || stripHtml(category?.description),
      images: entry?.seo?.og_meta_tags?.image || category?.image ? [entry?.seo?.og_meta_tags?.image || category?.image] : undefined,
    },
  };
}

export default async function PLPLayout({ children, params }) {
  const { locale, slug } = await params;
  const [entryData, commerce] = await Promise.all([fetchPlpEntry(locale, slug), resolveCommerce(locale, slug)]);

  if (!commerce) {
    notFound();
  }

  return (
    <DataContextProvider data={entryData} plpCommercePrefetch={commerce}>
      {children}
    </DataContextProvider>
  );
}
