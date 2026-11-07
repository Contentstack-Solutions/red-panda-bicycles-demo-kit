// Merges a commerce product with an optional CMS `pdp` overlay entry. Pure and
// framework-agnostic so it can run both server-side (initial fetch, metadata) and
// client-side (re-applied on every Live Preview edit, before publish).

function firstNonEmpty(value) {
  if (Array.isArray(value)) return value.length ? value : undefined;
  return value != null && value !== "" ? value : undefined;
}

function mapCmsTags(tags) {
  if (!tags?.length) return undefined;
  return tags.map((tag) =>
    typeof tag === "string" ? { id: tag, name: tag } : { id: tag.uid ?? tag.id ?? tag.name, name: tag.title ?? tag.name ?? String(tag) }
  );
}

function normalizeAsset(asset, index) {
  return typeof asset === "string" ? { id: index, path: asset } : { id: asset.uid ?? index, name: asset.filename, path: asset.url };
}

// `images` is a multi-file field; handles a lone asset object too in case it's ever
// reconfigured as single-file. Normalizes into the array shape PDPView's media list expects.
function mapCmsImages(images) {
  if (!images) return undefined;
  if (Array.isArray(images)) return images.length ? images.map(normalizeAsset) : undefined;
  return [normalizeAsset(images, 0)];
}

// The CMS entry's `product` field caches the commerce product it was pointed at (id + a
// snapshot of its fields, including the commerce product's own url slug). The caller
// re-fetches that product by slug to get live commerce data; this only merges the two.
export function applyOverlay(product, overlay) {
  if (!overlay) return product;

  const media = firstNonEmpty(mapCmsImages(overlay.images));
  return {
    ...product,
    name: firstNonEmpty(overlay.product_name) ?? product?.name,
    price: firstNonEmpty(overlay.price) ?? product?.price,
    description: firstNonEmpty(overlay.description) ?? product?.description,
    tags: firstNonEmpty(mapCmsTags(overlay.tags)) ?? product?.tags,
    media: media ?? product?.media,
    image: media ? undefined : product?.image,
    eyebrowText: firstNonEmpty(overlay.eyebrow_text),
    buttonText: firstNonEmpty(overlay.button_text),
    // CMS-only: commerce has no promo, so there's nothing to fall back to.
    promoBanner: firstNonEmpty(overlay.promo_banner?.trim()),
  };
}

// `recommended_accessories` is a repeatable group, each holding one commerce product
// picked with the RP Commerce picker (a cached snapshot, like `product`). Returns the
// snapshots that can link to a PDP, keeping each group's index for Live Preview tags.
export function recommendedAccessories(overlay) {
  return (overlay?.recommended_accessories ?? [])
    .map((group, index) => ({ product: group?.product_item?.items?.[0], index }))
    .filter(({ product }) => Boolean(product?.url));
}

// The commerce product cached in the entry's `product` field when it was picked (id, name,
// image, media, url, description, price, currency). Used when the store isn't set up or
// doesn't return the product, so the PDP still renders from the CMS alone.
export function snapshotProduct(overlay) {
  return overlay?.product?.items?.[0] ?? null;
}

// Grid products built from `pdp` entries, for PLPs when the store isn't set up: each entry's
// cached snapshot with its CMS overlay applied, linked to the entry's own PDP url.
export function cmsCatalogProducts(entries) {
  return (entries ?? [])
    .filter((entry) => snapshotProduct(entry))
    .map((entry) => ({
      ...applyOverlay(snapshotProduct(entry), entry),
      url: String(entry.url ?? "").replace(/^\/pdp\//, ""),
    }));
}
