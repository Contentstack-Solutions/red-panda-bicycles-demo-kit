import { describe, it, expect } from "vitest";
import { slimLinkedPages } from "@/lib/slimReferences";

describe("slimLinkedPages", () => {
  it("keeps a linked page's url but drops the content that page owns", () => {
    const entry = {
      title: "Homepage",
      hero: [{ headline: "Bikes for\nBrighter\nDays.", page: [{ uid: "blt1", _content_type_uid: "page", title: "Explore our e-bikes", url: "/page/explore-our-e-bikes", modular_blocks: [{ text_and_image: { headline: "Another page's copy" } }], hero: { headline: "Another page's hero" } }] }],
    };

    const slim = slimLinkedPages(entry);
    const linked = slim.hero[0].page[0];

    expect(linked).toEqual({ uid: "blt1", _content_type_uid: "page", title: "Explore our e-bikes", url: "/page/explore-our-e-bikes" });
    expect(JSON.stringify(slim)).not.toContain("Another page's");
    expect(slim.hero[0].headline).toBe("Bikes for\nBrighter\nDays.");
  });

  it("keeps the product fields a Trip Planner bike card renders from a pdp link", () => {
    const bike = {
      link_page: [{
        uid: "blt2", _content_type_uid: "pdp", url: "/pdp/roam-e-bike",
        product_name: "Roam Explorer", images: [{ url: "https://example.test/roam.avif" }],
        product: { items: [{ name: "RP Roam", price: 3299 }] },
        promo_banner: "Trade in your Volt",
      }],
    };

    const linked = slimLinkedPages(bike).link_page[0];

    expect(linked.product_name).toBe("Roam Explorer");
    expect(linked.product.items[0].name).toBe("RP Roam");
    expect(linked.images).toHaveLength(1);
    expect(linked.promo_banner).toBe("Trade in your Volt");
  });

  it("walks nested blocks and leaves non-link data alone", () => {
    const entry = {
      modular_blocks: [
        { trip_planner: { attractions: [{ title: "A'DAM Lookout", blurb: "keep me" }], bikes: [{ title: "City Bikes", link_page: [{ uid: "blt3", _content_type_uid: "e_bikes", url: "/plp/city-bikes", modular_blocks: [{ drop: "me" }] }] }] } },
      ],
    };

    const slim = slimLinkedPages(entry);
    const tp = slim.modular_blocks[0].trip_planner;

    expect(tp.attractions[0]).toEqual({ title: "A'DAM Lookout", blurb: "keep me" });
    expect(tp.bikes[0].link_page[0]).toEqual({ uid: "blt3", _content_type_uid: "e_bikes", url: "/plp/city-bikes" });
  });

  it("does not mutate the entry it is given", () => {
    const entry = { page: [{ uid: "blt4", url: "/page/x", modular_blocks: [{ keep: "original" }] }] };

    slimLinkedPages(entry);

    expect(entry.page[0].modular_blocks).toEqual([{ keep: "original" }]);
  });
});
