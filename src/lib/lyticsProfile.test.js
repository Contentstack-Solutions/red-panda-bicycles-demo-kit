import { describe, expect, it } from "vitest";
import { describeAttributes, humanizeKey, lookalikeMatches, ordinal, toList } from "./lyticsProfile";

describe("toList", () => {
  it("passes arrays through and drops empty values", () => {
    expect(toList(["RP Volt", "", null, "Red Panda Metro Hybrid"])).toEqual(["RP Volt", "Red Panda Metro Hybrid"]);
  });

  it("wraps a single string", () => {
    expect(toList("RP Volt")).toEqual(["RP Volt"]);
  });

  it("returns an empty list for missing values", () => {
    expect(toList(undefined)).toEqual([]);
    expect(toList("")).toEqual([]);
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
    [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [98, "98th"], [100, "100th"],
  ])("%i → %s", (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });

  it("rounds numeric strings", () => {
    expect(ordinal("97.6")).toBe("98th");
  });
});

describe("lookalikeMatches", () => {
  it("sorts models by percentile and drops the Lookalike suffix from the label", () => {
    expect(lookalikeMatches({ "Roam Pre-order Lookalike": 40, "Roam Intent Lookalike": 98 })).toEqual([
      { model: "Roam Intent Lookalike", label: "Roam Intent", percentile: 98 },
      { model: "Roam Pre-order Lookalike", label: "Roam Pre-order", percentile: 40 },
    ]);
  });

  it("ignores non-numeric entries and handles a missing map", () => {
    expect(lookalikeMatches({ Broken: "n/a" })).toEqual([]);
    expect(lookalikeMatches(undefined)).toEqual([]);
  });
});

describe("humanizeKey", () => {
  it.each([
    ["_id", "Lytics ID"],
    ["segments", "Audiences"],
    ["score_propensity", "Propensity score"],
    ["home_city", "Home city"],
  ])("%s → %s", (key, label) => {
    expect(humanizeKey(key)).toBe(label);
  });
});

describe("describeAttributes", () => {
  const byKey = (user) => Object.fromEntries(describeAttributes(user).map((row) => [row.key, row]));

  it("shows scores as plain numbers and strings as text", () => {
    const rows = byKey({ score_frequency: "61", club_membership: "Amsterdam Bike Club" });
    expect(rows.score_frequency).toMatchObject({ label: "Frequency score", kind: "text", value: "61" });
    expect(rows.club_membership).toMatchObject({ kind: "text", value: "Amsterdam Bike Club" });
  });

  it("marks empty values", () => {
    const rows = byKey({ flows_step_slugs: {}, segments: [], trade_in: "" });
    expect(Object.values(rows).map((row) => row.kind)).toEqual(["empty", "empty", "empty"]);
  });

  it("lists arrays", () => {
    expect(byKey({ products_owned: ["RP Volt", "Red Panda Metro Hybrid"] }).products_owned).toMatchObject({
      kind: "list",
      value: ["RP Volt", "Red Panda Metro Hybrid"],
    });
  });

  it("shows content affinities as percentages, highest first", () => {
    const { value } = byKey({ lytics_content: { Amstel: 0.0726, Battery: 0.9993 } }).lytics_content;
    expect(value).toEqual([
      { name: "Battery", display: "100%", pct: expect.closeTo(99.93) },
      { name: "Amstel", display: "7%", pct: expect.closeTo(7.26) },
    ]);
  });

  it("shows lookalike scores as percentiles", () => {
    const { value } = byKey({ segment_prediction_percentile: { "Roam Intent Lookalike": 100 } }).segment_prediction_percentile;
    expect(value).toEqual([{ name: "Roam Intent Lookalike", display: "100th percentile", pct: 100 }]);
  });
});
