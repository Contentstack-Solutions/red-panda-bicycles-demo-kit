import { describe, expect, it } from "vitest";
import { cartoTileUrl } from "./mapTiles";

describe("cartoTileUrl", () => {
  it("adds the API key as a key parameter", () => {
    expect(cartoTileUrl("abc123")).toBe(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=abc123"
    );
  });

  it("URL-encodes the key", () => {
    expect(cartoTileUrl("a b&c")).toMatch(/\?key=a%20b%26c$/);
  });

  it("omits the key parameter when no key is configured", () => {
    expect(cartoTileUrl(undefined)).toBe("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png");
    expect(cartoTileUrl("  ")).not.toContain("key=");
  });
});
