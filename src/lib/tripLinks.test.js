import { describe, expect, it } from "vitest";
import { bikeCard, bikeHref } from "./tripLinks";

describe("bikeHref", () => {
  it("uses the referenced PLP entry's url when one is linked", () => {
    const bike = { title: "E-Bikes", link_page: [{ url: "/plp/e-bikes" }] };
    expect(bikeHref(bike, "en")).toBe("/en/plp/e-bikes");
  });

  it("uses a referenced PDP entry's url", () => {
    const bike = { title: "E-Bikes", link_page: [{ url: "/pdp/roam-e-bike", _content_type_uid: "pdp" }] };
    expect(bikeHref(bike, "en")).toBe("/en/pdp/roam-e-bike");
  });

  it("falls back to the PLP route built from the bike title", () => {
    expect(bikeHref({ title: "City Bikes", link_page: [] }, "en")).toBe("/en/plp/city-bikes");
  });

  it("falls back when link_page is missing entirely", () => {
    expect(bikeHref({ title: "E-Bikes" }, "de")).toBe("/de/plp/e-bikes");
  });
});

describe("bikeCard", () => {
  const cmsBike = { title: "E-Bikes", image: { url: "https://cms/ebike.avif" }, link_page: [{ _content_type_uid: "e_bikes", url: "/plp/e-bikes" }] };
  const snapshot = { name: "Volt Trail E-MTB", image: "https://shop/explorer.avif", media: [{ id: 1, path: "https://shop/explorer.avif" }, { id: 2, path: "https://shop/explorer1.avif" }] };
  const roamPdp = { _content_type_uid: "pdp", title: "Roam Explorer", product_name: "Roam Explorer", url: "/pdp/roam-e-bike", images: [], product: { items: [snapshot] } };

  it("uses the card's own CMS title and image when it links to a PLP", () => {
    expect(bikeCard(cmsBike)).toEqual({ title: "E-Bikes", image: "https://cms/ebike.avif", fromProduct: false });
  });

  it("uses the linked PDP's product name and first image, as the PDP itself shows them", () => {
    expect(bikeCard({ ...cmsBike, link_page: [roamPdp] })).toEqual({ title: "Roam Explorer", image: "https://shop/explorer.avif", fromProduct: true });
  });

  it("prefers the PDP entry's own images over the commerce snapshot", () => {
    const pdp = { ...roamPdp, images: [{ uid: "a1", url: "https://cms/roam-hero.avif" }] };
    expect(bikeCard({ ...cmsBike, link_page: [pdp] }).image).toBe("https://cms/roam-hero.avif");
  });

  it("falls back to the commerce name, then the card's CMS fields, when the PDP leaves them empty", () => {
    expect(bikeCard({ ...cmsBike, link_page: [{ ...roamPdp, product_name: "" }] }).title).toBe("Volt Trail E-MTB");
    const bare = { _content_type_uid: "pdp", url: "/pdp/x", product_name: "", images: [] };
    expect(bikeCard({ ...cmsBike, link_page: [bare] })).toEqual({ title: "E-Bikes", image: "https://cms/ebike.avif", fromProduct: true });
  });
});
