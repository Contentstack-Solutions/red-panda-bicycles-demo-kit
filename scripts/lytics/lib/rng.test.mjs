import { describe, expect, it } from "vitest";
import { createRng } from "./rng.mjs";
import { PAGES, PRODUCTS, TOPICS, TOWNS } from "./catalog.mjs";
import { AMSTERDAM, distanceKm } from "./geo.mjs";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("differs across seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("keeps int within inclusive bounds", () => {
    const rng = createRng(7);
    const values = Array.from({ length: 2000 }, () => rng.int(3, 6));
    expect(Math.min(...values)).toBe(3);
    expect(Math.max(...values)).toBe(6);
  });

  it("roughly respects weights", () => {
    const rng = createRng(9);
    let a = 0;
    for (let i = 0; i < 10000; i++) if (rng.weighted([["a", 3], ["b", 1]]) === "a") a++;
    expect(a / 10000).toBeGreaterThan(0.72);
    expect(a / 10000).toBeLessThan(0.78);
  });

  it("shuffles without losing items", () => {
    const rng = createRng(3);
    expect([...rng.shuffle([1, 2, 3, 4, 5])].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("catalog", () => {
  it("only uses known topics on pages", () => {
    for (const page of PAGES) {
      for (const topic of Object.keys(page.topics)) expect(TOPICS).toContain(topic);
    }
  });

  it("has towns both inside and outside 50 miles of Amsterdam", () => {
    const inside = TOWNS.filter((t) => distanceKm(t, AMSTERDAM) <= 80.5);
    const outside = TOWNS.filter((t) => distanceKm(t, AMSTERDAM) > 80.5);
    expect(inside.length).toBeGreaterThan(5);
    expect(outside.length).toBeGreaterThan(5);
  });

  it("includes the story products", () => {
    const names = PRODUCTS.map((p) => p.name);
    for (const name of ["RP Volt", "RP Roam", "Touring Saddlebag", "Red Panda Metro Hybrid", "Red Panda Commuter Pannier 20L"]) {
      expect(names).toContain(name);
    }
  });
});
