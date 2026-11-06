// Resolves the page-link references nested inside the plp entry's modular
// blocks. The top-level "hero" field is an inline group (headline,
// description, image), not a reference, so it needs no include path.
export const PLP_REFERENCES = [
  "modular_blocks.text_and_image.page",
  "modular_blocks.product_banner.link_page",
  "modular_blocks.trip_planner.attractions",
  "modular_blocks.trip_planner.bikes.link_page",
];
