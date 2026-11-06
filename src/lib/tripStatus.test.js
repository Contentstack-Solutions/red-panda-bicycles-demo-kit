import { describe, expect, it } from "vitest";
import { statusMessage } from "./tripStatus";

const LABEL = "Amsterdam Centraal";

describe("statusMessage", () => {
  it.each([
    [{ state: "idle" }, "Distances from Amsterdam Centraal"],
    [{ state: "locating" }, "Finding you…"],
    [{ state: "device" }, "Distances from your location"],
    [{ state: "far", km: 6120.4 }, "You're 6,120 km away — showing distances from Amsterdam Centraal."],
    [{ state: "denied" }, "Location blocked — showing distances from Amsterdam Centraal."],
    [{ state: "error" }, "Couldn't find you — showing distances from Amsterdam Centraal."],
  ])("%o", (status, expected) => {
    expect(statusMessage(status, LABEL)).toBe(expected);
  });

  it("falls back to the idle message for unknown states", () => {
    expect(statusMessage({ state: "weird" }, LABEL)).toBe("Distances from Amsterdam Centraal");
  });
});
