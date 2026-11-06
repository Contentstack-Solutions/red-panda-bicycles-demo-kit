import { createRng } from "./rng.mjs";
import { TOWNS } from "./catalog.mjs";
import { AMSTERDAM, FIFTY_MILES_KM, distanceKm } from "./geo.mjs";

const DAY_MS = 24 * 3600 * 1000;

const FIRST_NAMES = ["Anna", "Daan", "Emma", "Lucas", "Julia", "Sem", "Sophie", "Finn", "Lotte", "Levi", "Mila", "Noah", "Tess", "Bram", "Sara", "Jesse", "Eva", "Thijs", "Lisa", "Ruben", "Fleur", "Max", "Isa", "Milan", "Noor", "Luuk", "Zoë", "Sven", "Olivia", "Jan", "Priya", "Omar", "Mei", "Liam", "Chloé", "Mateo", "Hana", "Ali", "Ingrid", "Tom"];
const LAST_NAMES = ["de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker", "Janssen", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "de Groot", "Bos", "Vos", "Peters", "Hendriks", "van Leeuwen", "Dekker", "Brouwer", "de Wit", "Dijkstra", "Smits", "de Graaf", "van der Meer", "Kok", "Jacobs", "Vermeulen", "Maes", "Schmidt", "Müller", "Clarke", "Khan", "Nguyen", "Rossi", "Garcia"];

// Engagement archetypes drive how much web history a profile gets; the spread
// is what gives Lytics' behavioral scores something to rank.
const ARCHETYPES = [["power", 12], ["regular", 30], ["casual", 33], ["lapsed", 15], ["new", 10]];

const VOLT_WINDOW = [Date.parse("2021-03-01T00:00:00Z"), Date.parse("2024-06-30T00:00:00Z")];

export const isLocal = (p) => p.distanceKm <= FIFTY_MILES_KM;
export const owns = (p, product) => p.bikes.some((b) => b.product === product);

function dateBetween(rng, fromMs, toMs) {
  return new Date(fromMs + rng.next() * (toMs - fromMs)).toISOString();
}

function pickAccessories(rng, p, nowMs) {
  // Commuters who own an e-bike lean heavily on saddlebags (the talk track's
  // "most commonly added" answer); everyone else skews toward locks and lights.
  const commuterWeights = [["Touring Saddlebag", 0.58], ["Red Panda Commuter Pannier 20L", 0.34], ["Red Panda Fortress U-Lock", 0.42], ["Red Panda Beacon 1200 Front Light", 0.3], ["Red Panda Tail Glow Rear Light", 0.26], ["Red Panda Aero Road Helmet", 0.12]];
  const otherWeights = [["Red Panda Fortress U-Lock", 0.34], ["Red Panda Beacon 1200 Front Light", 0.22], ["Red Panda Tail Glow Rear Light", 0.2], ["Red Panda Aero Road Helmet", 0.16], ["Red Panda Trail Guard MTB Helmet", 0.08], ["Red Panda Explorer Frame Bag", 0.12], ["Touring Saddlebag", 0.09], ["Red Panda Commuter Pannier 20L", 0.1]];
  const weights = p.commuter && p.bikes.some((b) => b.kind === "ebike") ? commuterWeights : otherWeights;
  const firstBike = p.bikes.map((b) => Date.parse(b.purchasedAt)).sort((a, b) => a - b)[0];
  const from = firstBike ?? nowMs - 500 * DAY_MS;
  return weights.filter(([, prob]) => rng.chance(prob)).map(([product]) => ({ product, purchasedAt: dateBetween(rng, from, nowMs - 2 * DAY_MS) }));
}

export function generatePopulation({ seed, size, now }) {
  const rng = createRng(seed);
  const nowMs = new Date(now).getTime();
  const townPairs = TOWNS.map((t) => [t, t.weight]);
  const people = [];

  for (let i = 1; i <= size; i++) {
    const n = String(i).padStart(5, "0");
    const town = rng.weighted(townPairs);
    const distance = Math.round(distanceKm(town, AMSTERDAM) * 10) / 10;
    const local = distance <= FIFTY_MILES_KM;
    const archetype = rng.weighted(ARCHETYPES);
    const p = {
      n,
      uid: `seed-${n}`,
      email: `rp.${n}@example.com`,
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      town: town.name,
      city: town.city,
      homeArea: town.name,
      lat: town.lat,
      lng: town.lng,
      distanceKm: distance,
      archetype,
      commuter: false,
      explorer: rng.chance(0.3),
      bikes: [],
      accessories: [],
      club: null,
      loyaltyId: null,
      preorder: null,
      voltReview: null,
      batteryTickets: 0,
    };

    // The RP Volt was sold 2021 → mid-2024, so every Volt purchase is > 1 year old.
    if (rng.chance(local ? 0.278 : 0.08)) {
      p.bikes.push({ product: "RP Volt", kind: "ebike", purchasedAt: dateBetween(rng, VOLT_WINDOW[0], VOLT_WINDOW[1]) });
    }
    const volt = p.bikes.length > 0;
    p.commuter = rng.chance(volt ? (local ? 0.7 : 0.3) : local ? 0.3 : 0.15);

    if (rng.chance(p.commuter ? 0.45 : 0.3)) {
      const city = rng.pick(["Red Panda Metro Hybrid", "Red Panda Heritage Step-Through", "The Jordaan"]);
      p.bikes.push({ product: city, kind: "city", purchasedAt: dateBetween(rng, Date.parse("2019-01-01T00:00:00Z"), nowMs - 30 * DAY_MS) });
    }
    if (rng.chance(p.explorer ? 0.3 : 0.08)) {
      const trail = rng.pick(["Red Panda Ridgeline 29 Hardtail", "Red Panda Bamboo Trail 140 Full Suspension", "Red Panda Enduro X Carbon"]);
      p.bikes.push({ product: trail, kind: "lifestyle", purchasedAt: dateBetween(rng, Date.parse("2020-01-01T00:00:00Z"), nowMs - 30 * DAY_MS) });
    }
    if (rng.chance(0.06)) {
      const ebike = rng.pick(["Glide E-Commuter", "Volt Trail E-MTB", "Cargo Cub E-Cargo Bike"]);
      p.bikes.push({ product: ebike, kind: "ebike", purchasedAt: dateBetween(rng, Date.parse("2024-09-01T00:00:00Z"), nowMs - 14 * DAY_MS) });
    }

    const customer = p.bikes.length > 0 || rng.chance(0.08);
    if (customer) {
      p.accessories = pickAccessories(rng, p, nowMs);
      p.loyaltyId = `RP-2${n}`;
    }
    if (local && p.city === "Amsterdam" && rng.chance(0.18)) p.club = "Amsterdam Bike Club";

    if (volt) {
      p.batteryTickets = rng.weighted([[0, 45], [1, 30], [2, 15], [3, 10]]);
      if (rng.chance(0.4)) {
        const rating = rng.weighted([[1, 10], [2, 30], [3, 35], [4, 18], [5, 7]]);
        const text = rating <= 2
          ? rng.pick(["Battery faded after the first winter.", "Love the shop, but the range dropped fast.", "Great frame, battery let me down."])
          : rng.pick(["Solid commuter, wish it went further.", "Fun bike, range is just okay.", "Reliable enough for short trips."]);
        p.voltReview = { rating, text };
      }
    }
    people.push(p);
  }

  assignPreorders(rng, people, nowMs);
  return people;
}

// Exactly 63 pre-orders: 56 from the core pattern (local, Volt-owning,
// engaged commuters) and 7 outliers, so a lookalike model learns the pattern
// without memorising a single segment.
function assignPreorders(rng, people, nowMs) {
  const engaged = (p) => p.archetype === "power" || p.archetype === "regular";
  const core = rng.shuffle(people.filter((p) => isLocal(p) && owns(p, "RP Volt") && p.commuter && engaged(p))).slice(0, 56);
  const coreSet = new Set(core);
  const outliers = rng
    .shuffle(people.filter((p) => !coreSet.has(p) && !owns(p, "RP Volt") && p.explorer && engaged(p)))
    .slice(0, 7);
  for (const p of [...core, ...outliers]) {
    p.preorder = { at: new Date(nowMs - rng.int(1, 44) * DAY_MS - rng.int(0, 20) * 3600 * 1000).toISOString() };
  }
}
