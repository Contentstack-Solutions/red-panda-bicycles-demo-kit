import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import RPCommerce from "@/lib/rpcommerce";
import ContentstackServer from "@/lib/cstack";
import { applyOverlay } from "@/lib/pdpOverlay";
import PDPView from "@/components/PDPView";

const FETCH_OPTIONS = { next: { revalidate: 300 } };

function stripHtml(html) {
  if (!html) return undefined;
  return html.replace(/<[^>]*>/g, "").trim() || undefined;
}

const fetchOverlay = cache(async (locale, slug) => {
  const variantParam = (await headers()).get("x-personalize-variants");
  try {
    return (await ContentstackServer.getElementByUrl("pdp", `/pdp/${slug}`, locale, {}, variantParam)) ?? [];
  } catch (error) {
    console.error("Failed to fetch pdp overlay entry", error);
    return [];
  }
});

// Resolves both halves independently and lets the client re-merge on every Live Preview
// edit (see PDPView), rather than baking one merged product into the server response.
const resolveProduct = cache(async (locale, slug) => {
  const overlayEntries = await fetchOverlay(locale, slug);
  const overlay = overlayEntries?.[0] ?? null;

  const commerceSlug = overlay ? overlay.product?.items?.[0]?.url : slug;
  const products = commerceSlug ? await RPCommerce.getProductByUrl(commerceSlug, locale, FETCH_OPTIONS) : null;
  const commerceProduct = products?.[0] ?? null;

  if (!overlay && !commerceProduct) return null;

  const categoryId = commerceProduct?.categories?.[0]?.id;
  const category = categoryId ? await RPCommerce.getCategoryById(categoryId, locale, FETCH_OPTIONS) : null;

  return { commerceProduct, overlayEntries, category };
});

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const result = await resolveProduct(locale, slug);

  if (!result) {
    return { title: "Not Found | Red Panda Bicycles" };
  }

  const product = applyOverlay(result.commerceProduct, result.overlayEntries?.[0] ?? null);
  return {
    title: product.custom_data?.seo_title || `${product.name} | Red Panda Bicycles`,
    description: product.custom_data?.seo_description || stripHtml(product.description),
    openGraph: {
      title: product.custom_data?.seo_title || product.name,
      description: product.custom_data?.seo_description || stripHtml(product.description),
      images: product.image ? [product.image] : undefined,
    },
  };
}

export default async function PDPPage({ params }) {
  const { locale, slug } = await params;
  const result = await resolveProduct(locale, slug);

  if (!result) {
    notFound();
  }

  return (
    <PDPView
      commerceProduct={result.commerceProduct}
      initialOverlayEntries={result.overlayEntries}
      slug={slug}
      category={result.category}
      locale={locale}
    />
  );
}
