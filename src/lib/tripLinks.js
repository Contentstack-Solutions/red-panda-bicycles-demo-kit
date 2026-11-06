import { resolvePageHref, slugify } from "@/utils/text";
import { applyOverlay } from "@/lib/pdpOverlay";

// Trip Planner bike cards link to whatever entry the CMS references (a PLP, or a
// PDP such as the Roam). Without a reference, derive the PLP route from the
// title ("City Bikes" -> /plp/city-bikes).
export function bikeHref(bike, locale) {
  return resolvePageHref(bike?.link_page, locale, `/plp${slugify(bike?.title)}`);
}

// What a bike card shows. A card linking to a PDP shows that product, merged the
// same way the PDP page merges it (CMS overlay over the cached commerce snapshot),
// so the card and the page it opens always agree. Otherwise the card's own fields.
export function bikeCard(bike) {
  const linked = bike?.link_page?.[0];
  if (linked?._content_type_uid !== "pdp") {
    return { title: bike?.title, image: bike?.image?.url, fromProduct: false };
  }
  const product = applyOverlay(linked.product?.items?.[0] ?? {}, linked);
  return {
    title: product.name || bike?.title,
    image: product.media?.[0]?.path || product.image || bike?.image?.url,
    fromProduct: true,
  };
}
