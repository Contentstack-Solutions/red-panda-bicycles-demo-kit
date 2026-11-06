import { distanceBand } from "@/lib/geo";

// Lytics tracking for Trip Planner selections. Coordinates are never sent.
export const TRIP_STREAM = "trip_planner";

export function buildTripEvent({ attraction, km, thresholdKm, bikes, originSource }) {
  return {
    event: "trip_attraction_selected",
    trip_attraction: attraction,
    trip_distance_km: km,
    trip_distance_band: distanceBand(km, thresholdKm),
    trip_recommended_bikes: (bikes ?? []).map((bike) => bike.title),
    trip_origin: originSource,
  };
}

// A click on a recommended bike. Leaves out trip_distance_band on purpose: the
// trip_planner mapping for long_trip_selections has no event guard, so sending
// the band here would count the same trip twice.
export function buildBikeClickEvent({ attraction, bike }) {
  return {
    event: "bike_recommendation_clicked",
    trip_attraction: attraction,
    bike_clicked: bike?.title,
  };
}

// No-op unless the Lytics tag (window.jstag) is present, e.g. LYTICS_TAG unset locally.
export function trackTripSelection(payload) {
  const jstag = typeof window !== "undefined" ? window?.jstag : undefined;
  if (typeof jstag?.send !== "function") return false;
  try {
    jstag.send(TRIP_STREAM, payload);
    return true;
  } catch {
    return false;
  }
}
