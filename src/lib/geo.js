// Distance and bike-recommendation logic for the Trip Planner block.
// Everything here is pure so it can be unit tested without a browser.

export const DEFAULT_THRESHOLD_KM = 5;

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Straight-line ("as the crow flies") distance between two {lat, lng} points.
export function haversineKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roundKm(km) {
  return Math.round(km * 10) / 10;
}

export function formatKm(km) {
  if (km >= 100) return `${Math.round(km).toLocaleString("en-US")} km`;
  return `${roundKm(km).toFixed(1)} km`;
}

// Callers pass the displayed (rounded) distance so the label and the rule agree.
export function distanceBand(km, thresholdKm) {
  return km > (thresholdKm ?? DEFAULT_THRESHOLD_KM) ? "long" : "short";
}

// Long trips get only "any distance" bikes; short trips get every bike.
export function recommendBikes(bikes, km, thresholdKm) {
  const list = bikes ?? [];
  if (distanceBand(km, thresholdKm) === "short") return list;
  return list.filter((bike) => (bike?.best_for ?? "any") === "any");
}

// Turns referenced attraction entries into map points, dropping any without
// usable coordinates (e.g. an editor left latitude empty).
export function normalizeAttractions(entries) {
  return (entries ?? [])
    .filter((entry) => Number.isFinite(entry?.latitude) && Number.isFinite(entry?.longitude))
    .map((entry, index) => ({
      uid: entry.uid,
      title: entry.title,
      blurb: entry.blurb,
      lat: entry.latitude,
      lng: entry.longitude,
      number: index + 1,
      $: entry.$,
    }));
}
