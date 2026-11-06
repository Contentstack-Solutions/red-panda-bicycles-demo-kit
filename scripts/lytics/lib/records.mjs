import { pageUrl, pagesInGroup, productByName } from "./catalog.mjs";

export const SEED_BATCH = "rp-demo-kit";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 540;

const COUNTRY_BY_CITY = { Antwerp: "BE", Brussels: "BE", "Düsseldorf": "DE", Cologne: "DE", London: "GB" };

// rp_crm: one record per person with the attributes the CRM "knows".
export function crmRecord(p) {
  const firstPurchase = [...p.bikes, ...p.accessories].map((x) => x.purchasedAt).sort()[0];
  return {
    email: p.email,
    _uid: p.uid,
    first_name: p.firstName,
    last_name: p.lastName,
    city: p.city,
    country: COUNTRY_BY_CITY[p.city] ?? "NL",
    home_area: p.homeArea,
    home_distance_km: p.distanceKm,
    loyalty_id: p.loyaltyId ?? undefined,
    club_membership: p.club ?? undefined,
    volt_review_rating: p.voltReview?.rating,
    volt_review_text: p.voltReview?.text,
    battery_service_tickets: p.batteryTickets || undefined,
    last_test_ride: p.lastTestRide ?? undefined,
    seed_batch: SEED_BATCH,
    ts: firstPurchase ?? undefined,
  };
}

// rp_orders: one record per purchased item, plus the Roam pre-order deposit.
export function orderRecords(p) {
  const identity = { email: p.email, _uid: p.uid, seed_batch: SEED_BATCH };
  const purchases = [...p.bikes, ...p.accessories].map((item) => {
    const product = productByName(item.product);
    return { ...identity, action: "purchase", product: item.product, product_kind: product.kind, amount: product.price, ts: item.purchasedAt };
  });
  if (p.preorder) {
    purchases.push({ ...identity, action: "preorder", product: "RP Roam", product_kind: "ebike", amount: 250, ts: p.preorder.at });
  }
  return purchases;
}

const SESSIONS = {
  power: [18, 30],
  regular: [6, 12],
  casual: [2, 5],
  lapsed: [5, 10],
  new: [1, 3],
};

function sessionStart(rng, archetype, nowMs) {
  const latest = nowMs - 2 * HOUR;
  const earliest = nowMs - HISTORY_DAYS * DAY;
  if (archetype === "lapsed") return earliest + rng.next() * (latest - 120 * DAY - earliest);
  if (archetype === "new") return nowMs - 9 * DAY + rng.next() * (latest - (nowMs - 9 * DAY));
  if (archetype === "power" && rng.chance(0.4)) return nowMs - 60 * DAY + rng.next() * (latest - (nowMs - 60 * DAY));
  return earliest + rng.next() * (latest - earliest);
}

function groupWeights(p, atMs, nowMs) {
  const volt = p.bikes.some((b) => b.product === "RP Volt");
  const ebike = volt || p.bikes.some((b) => b.kind === "ebike");
  const weights = [
    ["general", 2],
    ["ebike", ebike ? 1.5 : 0.7],
    ["commuting", p.commuter ? 5 : 0.3],
    ["battery", volt ? 2.5 : 0.4],
    ["range", (volt ? 1 : 0.3) + (p.explorer ? 1 : 0)],
    ["exploration", p.explorer ? 3 : 0.5],
    ["accessories", p.loyaltyId ? 1 : 0.4],
  ];
  // The Roam page launched ~60 days ago; before that nobody could visit it.
  if (atMs > nowMs - 60 * DAY) weights.push(["roam", volt ? 0.8 : 0.3]);
  return weights;
}

function pageView(p, path, atMs, sessionFirst) {
  const event = { _uid: p.uid, _e: "pv", url: pageUrl(path), ts: new Date(atMs).toISOString(), seed_batch: SEED_BATCH };
  if (sessionFirst) event._sesstart = "1";
  return event;
}

// default (web) stream: backdated page views shaped by archetype and interests.
export function webEvents(p, { rng, now }) {
  const nowMs = new Date(now).getTime();
  const events = [];
  const [minSessions, maxSessions] = SESSIONS[p.archetype];
  const sessions = rng.int(minSessions, maxSessions);
  for (let s = 0; s < sessions; s++) {
    let at = sessionStart(rng, p.archetype, nowMs);
    const views = p.archetype === "casual" || p.archetype === "new" ? rng.int(1, 2) : rng.int(1, 4);
    for (let v = 0; v < views; v++) {
      const group = rng.weighted(groupWeights(p, at, nowMs));
      events.push(pageView(p, rng.pick(pagesInGroup(group)).path, at, v === 0));
      at += rng.int(1, 6) * 60 * 1000;
    }
  }
  if (p.preorder) {
    // The pattern the lookalike model should learn: a recent burst of Roam,
    // battery and range research before the pre-order.
    const ramp = rng.int(4, 7);
    for (let s = 0; s < ramp; s++) {
      let at = nowMs - 45 * DAY + HOUR + rng.next() * (43 * DAY);
      events.push(pageView(p, "/en/pdp/rp-roam", at, true));
      for (const group of [rng.pick(["battery", "range"]), "commuting"]) {
        at += rng.int(1, 5) * 60 * 1000;
        events.push(pageView(p, rng.pick(pagesInGroup(group)).path, at, false));
      }
    }
  }
  return events.sort((a, b) => a.ts.localeCompare(b.ts));
}
