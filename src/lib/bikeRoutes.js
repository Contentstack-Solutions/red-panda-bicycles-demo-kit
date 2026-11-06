// Cycling routes for the Trip Planner map, from the public OSRM bike router
// run by FOSSGIS on OpenStreetMap data. It follows cycle paths, bridges and
// ferries, so routes never cut across water. Routes from the fallback origin are
// bundled (src/data/bike-routes.json, built by scripts/build-bike-routes.mjs) so
// the map never waits on the network; anything else is fetched on demand.

export const ROUTER_URL = "https://routing.openstreetmap.de/routed-bike/route/v1/driving";
const FETCH_TIMEOUT_MS = 8000;

// 4 decimals is ~10 m: close enough that a bundled route still fits the pins.
export function routeKey(from, to) {
  const point = ({ lat, lng }) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
  return `${point(from)}>${point(to)}`;
}

export function routeUrl(from, to) {
  return `${ROUTER_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline`;
}

// Google's encoded polyline format (precision 5), which OSRM returns by
// default. Returns Leaflet-style [lat, lng] pairs.
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const nextDelta = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += nextDelta();
    lng += nextDelta();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export function parseRouteResponse(json) {
  const route = json?.code === "Ok" ? json.routes?.[0] : null;
  if (!route?.geometry) return null;
  return { polyline: route.geometry, km: Math.round(route.distance / 100) / 10 };
}

// peek() answers from the bundle or earlier fetches without waiting;
// fetch() asks the router and resolves null on any failure (callers keep the
// straight line). Failures aren't cached, so a later selection retries.
export function createRouteLookup({ bundled = {}, fetchImpl = globalThis.fetch } = {}) {
  const decoded = new Map();
  const pending = new Map();

  const toRoute = ({ polyline, km }) => ({ points: decodePolyline(polyline), km });

  function peek(from, to) {
    const key = routeKey(from, to);
    if (!decoded.has(key) && bundled[key]) decoded.set(key, toRoute(bundled[key]));
    return decoded.get(key) ?? null;
  }

  function fetchRoute(from, to) {
    const known = peek(from, to);
    if (known) return Promise.resolve(known);
    const key = routeKey(from, to);
    if (!pending.has(key)) {
      const request = (async () => {
        try {
          const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
          const res = await fetchImpl(routeUrl(from, to), { signal });
          const parsed = res.ok ? parseRouteResponse(await res.json()) : null;
          if (!parsed) return null;
          const route = toRoute(parsed);
          decoded.set(key, route);
          return route;
        } catch {
          return null;
        } finally {
          pending.delete(key);
        }
      })();
      pending.set(key, request);
    }
    return pending.get(key);
  }

  return { peek, fetch: fetchRoute };
}
