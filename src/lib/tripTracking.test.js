import { afterEach, describe, expect, it, vi } from "vitest";
import { TRIP_STREAM, buildBikeClickEvent, buildTripEvent, trackTripSelection } from "./tripTracking";

afterEach(() => vi.unstubAllGlobals());

describe("buildTripEvent", () => {
  it("builds the long-trip e-bike event", () => {
    const event = buildTripEvent({
      attraction: "Haarlem",
      km: 17.9,
      thresholdKm: 5,
      bikes: [{ title: "E-Bikes", image: { url: "x" } }],
      originSource: "device",
    });
    expect(event).toEqual({
      event: "trip_attraction_selected",
      trip_attraction: "Haarlem",
      trip_distance_km: 17.9,
      trip_distance_band: "long",
      trip_recommended_bikes: ["E-Bikes"],
      trip_origin: "device",
    });
  });

  it("marks trips at the threshold as short", () => {
    const event = buildTripEvent({ attraction: "X", km: 5.0, thresholdKm: 5, bikes: [], originSource: "fallback" });
    expect(event.trip_distance_band).toBe("short");
    expect(event.trip_recommended_bikes).toEqual([]);
  });

  it("never includes coordinates", () => {
    const event = buildTripEvent({ attraction: "X", km: 1, bikes: [], originSource: "device", lat: 52.3, lng: 4.9 });
    expect(Object.keys(event).sort()).toEqual([
      "event",
      "trip_attraction",
      "trip_distance_band",
      "trip_distance_km",
      "trip_origin",
      "trip_recommended_bikes",
    ]);
  });
});

describe("trackTripSelection", () => {
  it("sends to the trip_planner stream when jstag is loaded", () => {
    const send = vi.fn();
    vi.stubGlobal("window", { jstag: { send } });
    expect(trackTripSelection({ event: "e" })).toBe(true);
    expect(TRIP_STREAM).toBe("trip_planner");
    expect(send).toHaveBeenCalledWith("trip_planner", { event: "e" });
  });

  it("is a no-op without jstag or without a window", () => {
    vi.stubGlobal("window", {});
    expect(trackTripSelection({ event: "e" })).toBe(false);
    vi.stubGlobal("window", undefined);
    expect(trackTripSelection({ event: "e" })).toBe(false);
  });

  it("swallows errors thrown by jstag", () => {
    vi.stubGlobal("window", { jstag: { send: () => { throw new Error("boom"); } } });
    expect(trackTripSelection({ event: "e" })).toBe(false);
  });
});

describe("buildBikeClickEvent", () => {
  it("records the attraction and the bike, without the distance band", () => {
    const event = buildBikeClickEvent({ attraction: "Marken", bike: { title: "E-Bikes", image: { url: "x" } } });
    expect(event).toEqual({ event: "bike_recommendation_clicked", trip_attraction: "Marken", bike_clicked: "E-Bikes" });
    // long_trip_selections has no event guard in Lytics, so the band must never ride along.
    expect(event).not.toHaveProperty("trip_distance_band");
  });
});
