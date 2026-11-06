// A reference field resolves to the whole linked entry, but a link only ever renders
// the target's url. Left alone, every page ships the content of every page it links
// to - the header's nav pages, the hero's CTA page, a Trip Planner bike's PLP - which
// both bloats the HTML and puts other pages' copy where a reader (or an agent) can
// mistake it for this page's own.

const LINK_FIELDS = ["page", "link_page"];

// Trip Planner bike cards (see lib/tripLinks) render the linked product itself, so a
// `pdp` target keeps the fields that card merges; everything else keeps just the link.
const PDP_CARD_FIELDS = ["product", "product_name", "images", "price", "description", "tags", "eyebrow_text", "button_text", "promo_banner"];

function slimLink(entry) {
  if (!entry || typeof entry !== "object") return entry;

  const slim = {};
  for (const field of ["uid", "_content_type_uid", "title", "url", "locale", "$"]) {
    if (entry[field] !== undefined) slim[field] = entry[field];
  }
  if (entry._content_type_uid === "pdp") {
    for (const field of PDP_CARD_FIELDS) if (entry[field] !== undefined) slim[field] = entry[field];
  }
  return slim;
}

// Returns a copy with every linked entry reduced to what the link renders.
export function slimLinkedPages(node) {
  if (Array.isArray(node)) return node.map(slimLinkedPages);
  if (!node || typeof node !== "object") return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = LINK_FIELDS.includes(key) && Array.isArray(value) ? value.map(slimLink) : slimLinkedPages(value);
  }
  return out;
}
