import { beforeAll, describe, expect, it } from "vitest";
import { generatePopulation, owns, isLocal } from "./population.mjs";

const NOW = new Date("2026-09-24T12:00:00Z");
const YEAR_MS = 365 * 24 * 3600 * 1000;
let people;

beforeAll(() => {
  people = generatePopulation({ seed: 20261014, size: 25000, now: NOW });
});

const within = (value, target, tolerance) => Math.abs(value - target) <= target * tolerance;
const localVoltOwners = () =>
  people.filter((p) => isLocal(p) && p.bikes.some((b) => b.product === "RP Volt" && NOW - new Date(b.purchasedAt) > YEAR_MS));

describe("generatePopulation", () => {
  it("is deterministic", () => {
    const again = generatePopulation({ seed: 20261014, size: 200, now: NOW });
    const first = generatePopulation({ seed: 20261014, size: 200, now: NOW });
    expect(again).toEqual(first);
  });

  it("generates the requested size with unique ids", () => {
    expect(people).toHaveLength(25000);
    expect(new Set(people.map((p) => p.uid)).size).toBe(25000);
    expect(new Set(people.map((p) => p.email)).size).toBe(25000);
  });

  it("only uses non-deliverable example.com emails", () => {
    expect(people.every((p) => p.email.endsWith("@example.com"))).toBe(true);
  });

  it("hits the funnel: ~18k local → ~5k Volt owners (>1 yr) → ~3.5k commuters", () => {
    const local = people.filter(isLocal).length;
    const volt = localVoltOwners();
    const commuters = volt.filter((p) => p.commuter).length;
    expect(within(local, 18000, 0.05)).toBe(true);
    expect(within(volt.length, 5000, 0.07)).toBe(true);
    expect(within(commuters, 3500, 0.07)).toBe(true);
  });

  it("has exactly 63 Roam pre-orderers, mostly local Volt-owning commuters", () => {
    const pre = people.filter((p) => p.preorder);
    expect(pre).toHaveLength(63);
    const core = pre.filter((p) => isLocal(p) && owns(p, "RP Volt") && p.commuter).length;
    expect(core).toBeGreaterThanOrEqual(50);
    expect(core).toBeLessThan(63); // a few outliers so the model generalises
    for (const p of pre) expect(NOW - new Date(p.preorder.at)).toBeLessThanOrEqual(45 * 24 * 3600 * 1000);
  });

  it("makes saddlebags the top accessory in the commuter audience", () => {
    const counts = {};
    for (const p of localVoltOwners().filter((q) => q.commuter)) {
      for (const a of new Set(p.accessories.map((x) => x.product))) counts[a] = (counts[a] ?? 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("Touring Saddlebag");
  });

  it("never dates purchases in the future", () => {
    for (const p of people) {
      for (const item of [...p.bikes, ...p.accessories]) expect(new Date(item.purchasedAt) < NOW).toBe(true);
    }
  });
});
