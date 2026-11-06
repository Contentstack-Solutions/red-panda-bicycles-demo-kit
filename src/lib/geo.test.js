import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD_KM,
  distanceBand,
  formatKm,
  haversineKm,
  normalizeAttractions,
  recommendBikes,
  roundKm,
} from "./geo";

const CENTRAAL = { lat: 52.3791, lng: 4.9003 };
const DAM = { lat: 52.3731, lng: 4.8926 };
const HAARLEM = { lat: 52.3812, lng: 4.6363 };

const EBIKE = { title: "E-Bikes", best_for: "any" };
const CITY = { title: "City Bikes", best_for: "short" };

describe("haversineKm", () => {
  it("measures known Amsterdam distances", () => {
    expect(roundKm(haversineKm(CENTRAAL, DAM))).toBe(0.8);
    expect(roundKm(haversineKm(CENTRAAL, HAARLEM))).toBe(17.9);
  });

  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(CENTRAAL, CENTRAAL)).toBe(0);
    expect(haversineKm(DAM, HAARLEM)).toBeCloseTo(haversineKm(HAARLEM, DAM), 10);
  });
});

describe("roundKm / formatKm", () => {
  it("rounds to one decimal", () => {
    expect(roundKm(5.04)).toBe(5);
    expect(roundKm(5.05)).toBe(5.1);
  });

  it("formats short distances with one decimal", () => {
    expect(formatKm(1.23)).toBe("1.2 km");
    expect(formatKm(5)).toBe("5.0 km");
    expect(formatKm(17.94)).toBe("17.9 km");
  });

  it("formats long distances as whole numbers with separators", () => {
    expect(formatKm(6120.4)).toBe("6,120 km");
    expect(formatKm(100)).toBe("100 km");
  });
});

describe("distanceBand", () => {
  it("is short at or below the threshold and long above it", () => {
    expect(distanceBand(4.9, 5)).toBe("short");
    expect(distanceBand(5.0, 5)).toBe("short");
    expect(distanceBand(5.1, 5)).toBe("long");
  });

  it("defaults the threshold to 5 km", () => {
    expect(DEFAULT_THRESHOLD_KM).toBe(5);
    expect(distanceBand(5.1)).toBe("long");
    expect(distanceBand(5.1, null)).toBe("long");
  });
});

describe("recommendBikes", () => {
  const bikes = [EBIKE, CITY];

  it("recommends every bike for short trips", () => {
    expect(recommendBikes(bikes, 4.9, 5)).toEqual([EBIKE, CITY]);
    expect(recommendBikes(bikes, 5.0, 5)).toEqual([EBIKE, CITY]);
  });

  it("recommends only any-distance bikes for long trips", () => {
    expect(recommendBikes(bikes, 5.1, 5)).toEqual([EBIKE]);
  });

  it("preserves bike object identity", () => {
    expect(recommendBikes(bikes, 20, 5)[0]).toBe(EBIKE);
  });

  it("treats a bike without best_for as any distance", () => {
    const plain = { title: "Plain" };
    expect(recommendBikes([plain, CITY], 12, 5)).toEqual([plain]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(recommendBikes([CITY], 12, 5)).toEqual([]);
    expect(recommendBikes(undefined, 12, 5)).toEqual([]);
  });

  it("uses the displayed distance at the threshold", () => {
    // 5.04 km displays as "5.0 km", so it must behave as a short trip
    expect(recommendBikes(bikes, roundKm(5.04), 5)).toEqual([EBIKE, CITY]);
    expect(distanceBand(roundKm(5.04), 5)).toBe("short");
  });
});

describe("normalizeAttractions", () => {
  it("maps CMS entries to map points numbered from 1", () => {
    const result = normalizeAttractions([
      { uid: "a", title: "Dam Square", blurb: "Heart", latitude: 52.3731, longitude: 4.8926 },
      { uid: "b", title: "Haarlem", blurb: "West", latitude: 52.3812, longitude: 4.6363 },
    ]);
    expect(result).toEqual([
      { uid: "a", title: "Dam Square", blurb: "Heart", lat: 52.3731, lng: 4.8926, number: 1, $: undefined },
      { uid: "b", title: "Haarlem", blurb: "West", lat: 52.3812, lng: 4.6363, number: 2, $: undefined },
    ]);
  });

  it("skips entries with missing or invalid coordinates and unresolved references", () => {
    const result = normalizeAttractions([
      { uid: "a", title: "No lat", latitude: null, longitude: 4.9 },
      { uid: "b", _content_type_uid: "attraction" },
      null,
      { uid: "c", title: "OK", latitude: 52.37, longitude: 4.89 },
    ]);
    expect(result.map((a) => [a.uid, a.number])).toEqual([["c", 1]]);
  });

  it("returns an empty list for undefined input", () => {
    expect(normalizeAttractions(undefined)).toEqual([]);
  });
});
