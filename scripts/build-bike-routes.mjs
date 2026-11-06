// Bundles cycling routes from the Trip Planner's fallback origin to every
// published attraction into src/data/bike-routes.json, so the map shows them
// without calling the router at runtime. Re-run after adding or moving an
// attraction (an unbundled route still works; it's just fetched live).
// Usage: node --env-file=.env.local scripts/build-bike-routes.mjs

import { writeFile } from "node:fs/promises";
import { parseRouteResponse, routeKey, routeUrl } from "../src/lib/bikeRoutes.js";

const API = "https://api.contentstack.io/v3";
const OUT = new URL("../src/data/bike-routes.json", import.meta.url);
// Keep in step with DEFAULT_FALLBACK in src/components/TripPlanner.jsx.
const ORIGIN = { lat: 52.3791, lng: 4.9003 };

const headers = {
  api_key: process.env.CONTENTSTACK_API_KEY,
  authorization: process.env.CONTENTSTACK_MANAGEMENT_TOKEN,
};
if (!headers.api_key || !headers.authorization) {
  throw new Error("CONTENTSTACK_API_KEY and CONTENTSTACK_MANAGEMENT_TOKEN must be set");
}

const res = await fetch(`${API}/content_types/attraction/entries?locale=en&limit=100`, { headers });
if (!res.ok) throw new Error(`attraction entries -> ${res.status}`);
const { entries } = await res.json();

const routes = {};
for (const entry of entries) {
  const to = { lat: entry.latitude, lng: entry.longitude };
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) continue;
  const route = parseRouteResponse(await (await fetch(routeUrl(ORIGIN, to))).json());
  if (!route) {
    console.warn(`! no route to ${entry.title}`);
    continue;
  }
  routes[routeKey(ORIGIN, to)] = route;
  console.log(`✓ ${entry.title}: ${route.km} km`);
  // The public router asks for gentle use.
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

await writeFile(OUT, `${JSON.stringify(routes, null, 2)}\n`);
console.log(`Wrote ${Object.keys(routes).length} routes to src/data/bike-routes.json`);
