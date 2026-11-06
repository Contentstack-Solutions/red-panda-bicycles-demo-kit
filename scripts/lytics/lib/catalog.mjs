// Seed catalog: real commerce products (from the live PLPs) plus the story's
// seed-only products, the towns profiles live in, and the site pages visitors
// browse, each with the Lytics topics it carries.
// The site's host, from SITE_URL, so seeded page URLs match what the site reports.
function siteHost() {
  try {
    return new URL(process.env.SITE_URL ?? "").host || "red-panda.example.com";
  } catch {
    return "red-panda.example.com";
  }
}
export const DOMAIN = siteHost();

export const PRODUCTS = [
  { name: "RP Volt", kind: "ebike", price: 2400, seedOnly: true },
  { name: "RP Roam", kind: "ebike", price: 3200, seedOnly: true },
  { name: "Volt Trail E-MTB", kind: "ebike", price: 3800 },
  { name: "Glide E-Commuter", kind: "ebike", price: 2900 },
  { name: "Cargo Cub E-Cargo Bike", kind: "ebike", price: 4200 },
  { name: "Red Panda Heritage Step-Through", kind: "city", price: 850 },
  { name: "Red Panda Metro Hybrid", kind: "city", price: 950 },
  { name: "The Jordaan", kind: "city", price: 790 },
  { name: "Red Panda Bamboo Trail 140 Full Suspension", kind: "lifestyle", price: 2600 },
  { name: "Red Panda Enduro X Carbon", kind: "lifestyle", price: 4100 },
  { name: "Red Panda Ridgeline 29 Hardtail", kind: "lifestyle", price: 1300 },
  { name: "Touring Saddlebag", kind: "accessory", price: 89, seedOnly: true },
  { name: "Red Panda Commuter Pannier 20L", kind: "accessory", price: 79 },
  { name: "Red Panda Explorer Frame Bag", kind: "accessory", price: 49 },
  { name: "Red Panda Fortress U-Lock", kind: "accessory", price: 69 },
  { name: "Red Panda Beacon 1200 Front Light", kind: "accessory", price: 59 },
  { name: "Red Panda Tail Glow Rear Light", kind: "accessory", price: 29 },
  { name: "Red Panda Aero Road Helmet", kind: "accessory", price: 129 },
  { name: "Red Panda Trail Guard MTB Helmet", kind: "accessory", price: 99 },
];

export const productByName = (name) => PRODUCTS.find((p) => p.name === name);

// Weights sum to 100; inside-80.5 km towns carry ~72% of the population.
export const TOWNS = [
  { name: "Amsterdam-Centrum", city: "Amsterdam", lat: 52.3728, lng: 4.8936, weight: 7 },
  { name: "Amsterdam-Oost", city: "Amsterdam", lat: 52.36, lng: 4.94, weight: 7 },
  { name: "Amsterdam-West", city: "Amsterdam", lat: 52.37, lng: 4.86, weight: 6 },
  { name: "Amsterdam-Noord", city: "Amsterdam", lat: 52.39, lng: 4.92, weight: 5 },
  { name: "Amsterdam-Zuid", city: "Amsterdam", lat: 52.345, lng: 4.875, weight: 6 },
  { name: "Amsterdam-Nieuw-West", city: "Amsterdam", lat: 52.36, lng: 4.8, weight: 4 },
  { name: "Amsterdam-Zuidoost", city: "Amsterdam", lat: 52.31, lng: 4.97, weight: 3 },
  { name: "Amstelveen", city: "Amstelveen", lat: 52.303, lng: 4.858, weight: 4 },
  { name: "Haarlem", city: "Haarlem", lat: 52.3874, lng: 4.6462, weight: 4 },
  { name: "Zaandam", city: "Zaandam", lat: 52.4389, lng: 4.8261, weight: 3 },
  { name: "Almere", city: "Almere", lat: 52.3508, lng: 5.2647, weight: 3 },
  { name: "Hoofddorp", city: "Hoofddorp", lat: 52.3025, lng: 4.6889, weight: 2 },
  { name: "Purmerend", city: "Purmerend", lat: 52.505, lng: 4.9597, weight: 2 },
  { name: "Hilversum", city: "Hilversum", lat: 52.2292, lng: 5.1669, weight: 2 },
  { name: "Alkmaar", city: "Alkmaar", lat: 52.6324, lng: 4.7534, weight: 2 },
  { name: "Leiden", city: "Leiden", lat: 52.1601, lng: 4.497, weight: 2 },
  { name: "Utrecht", city: "Utrecht", lat: 52.0907, lng: 5.1214, weight: 4 },
  { name: "Amersfoort", city: "Amersfoort", lat: 52.1561, lng: 5.3878, weight: 2 },
  { name: "Den Haag", city: "Den Haag", lat: 52.0705, lng: 4.3007, weight: 2 },
  { name: "Rotterdam", city: "Rotterdam", lat: 51.9244, lng: 4.4777, weight: 2 },
  { name: "Eindhoven", city: "Eindhoven", lat: 51.4416, lng: 5.4697, weight: 5 },
  { name: "Groningen", city: "Groningen", lat: 53.2194, lng: 6.5665, weight: 4 },
  { name: "Nijmegen", city: "Nijmegen", lat: 51.8126, lng: 5.8372, weight: 3 },
  { name: "Maastricht", city: "Maastricht", lat: 50.8514, lng: 5.691, weight: 2 },
  { name: "Antwerp", city: "Antwerp", lat: 51.2194, lng: 4.4025, weight: 4 },
  { name: "Brussels", city: "Brussels", lat: 50.8503, lng: 4.3517, weight: 3 },
  { name: "Düsseldorf", city: "Düsseldorf", lat: 51.2277, lng: 6.7735, weight: 3 },
  { name: "Cologne", city: "Cologne", lat: 50.9375, lng: 6.9603, weight: 2 },
  { name: "London", city: "London", lat: 51.5072, lng: -0.1276, weight: 2 },
];

export const TOPICS = ["Commuting", "Battery", "Range", "Warranty", "Exploration", "City", "E-Bikes", "Roam", "Accessories", "Stories"];

// `group` lets the event builder pick pages by interest.
export const PAGES = [
  { path: "/en", group: "general", topics: { "E-Bikes": 0.3, City: 0.3 } },
  { path: "/en/blog", group: "general", topics: { Stories: 0.4 } },
  { path: "/en/plp/e-bikes", group: "ebike", topics: { "E-Bikes": 0.9 } },
  { path: "/en/plp/city-bikes", group: "general", topics: { City: 0.8 } },
  { path: "/en/plp/lifestyle-bikes", group: "exploration", topics: { Exploration: 0.5 } },
  { path: "/en/plp/accessories", group: "accessories", topics: { Accessories: 0.9 } },
  { path: "/en/pdp/rp-roam", group: "roam", topics: { Roam: 1, Battery: 0.6, Range: 0.7, "E-Bikes": 0.6 } },
  { path: "/en/blog/the-commuters-guide-to-riding-into-amsterdam", group: "commuting", topics: { Commuting: 0.95, City: 0.6 } },
  { path: "/en/blog/5-things-nobody-tells-you-about-riding-in-amsterdam", group: "commuting", topics: { City: 0.8, Commuting: 0.6 } },
  { path: "/en/blog/e-bike-battery-myths-busted", group: "battery", topics: { Battery: 0.95, Range: 0.6 } },
  { path: "/en/blog/what-our-e-bike-warranty-really-covers", group: "battery", topics: { Warranty: 0.95, Battery: 0.4 } },
  { path: "/en/blog/how-far-can-an-e-bike-really-go", group: "range", topics: { Range: 0.95, Battery: 0.6, Exploration: 0.4 } },
  { path: "/en/blog/best-biking-day-trips-around-amsterdam", group: "exploration", topics: { Exploration: 0.95, Range: 0.3 } },
  { path: "/en/blog/a-rainy-tuesday-on-the-amstel", group: "general", topics: { Stories: 0.9, City: 0.4 } },
];

export const pageUrl = (path) => `https://${DOMAIN}${path}`;
export const pagesInGroup = (group) => PAGES.filter((p) => p.group === group);
