// Amsterdam Centraal, the reference point for "within 50 miles of Amsterdam".
export const AMSTERDAM = { lat: 52.3791, lng: 4.9003 };
export const FIFTY_MILES_KM = 80.5;

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;

// Same haversine as src/lib/geo.js; duplicated so plain-Node scripts don't
// import an untyped ESM file from the app (Node warns on every run).
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
