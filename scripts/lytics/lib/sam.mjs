import { personaEmail } from "../../kit/lib/env.mjs";
import { createRng } from "./rng.mjs";
import { pageUrl } from "./catalog.mjs";
import { SEED_BATCH, crmRecord, orderRecords } from "./records.mjs";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// The demo persona "Sam Parker" (Red Panda demo). Her email comes from
// DEMO_PERSONA_EMAIL (validated by personaEmail) and must match what the site
// identifies with. Resolved lazily so importing this module never throws.
export const samEmail = () => personaEmail(process.env.DEMO_PERSONA_EMAIL?.trim() || "sam.parker@example.com");

export const SAM = {
  n: "sam",
  uid: "seed-sam",
  get email() {
    return samEmail();
  },
  firstName: "Sam",
  lastName: "Parker",
  city: "Amsterdam",
  homeArea: "Amsterdam-Oost",
  distanceKm: 3.4,
  archetype: "power",
  commuter: true,
  explorer: false,
  club: "Amsterdam Bike Club",
  loyaltyId: "RP-104233",
  bikes: [
    { product: "RP Volt", kind: "ebike", purchasedAt: "2021-05-14T10:20:00.000Z" },
    { product: "Red Panda Metro Hybrid", kind: "city", purchasedAt: "2022-04-02T14:05:00.000Z" },
  ],
  accessories: [
    { product: "Red Panda Fortress U-Lock", purchasedAt: "2021-05-14T10:21:00.000Z" },
    { product: "Red Panda Commuter Pannier 20L", purchasedAt: "2021-06-01T09:12:00.000Z" },
  ],
  voltReview: { rating: 2, text: "Love the shop, battery died by year two" },
  batteryTickets: 3,
  lastTestRide: "Amsterdam Bike Club demo ride, attended",
  preorder: null,
};

// Weighted so her affinities rank battery > commuting > warranty, with a
// recent ramp that lifts her momentum score.
const SAM_HISTORY = [
  ["/en/blog/e-bike-battery-myths-busted", 9],
  ["/en/blog/the-commuters-guide-to-riding-into-amsterdam", 7],
  ["/en/blog/5-things-nobody-tells-you-about-riding-in-amsterdam", 3],
  ["/en/blog/what-our-e-bike-warranty-really-covers", 5],
  ["/en/blog/how-far-can-an-e-bike-really-go", 3],
  ["/en/plp/e-bikes", 2],
  ["/en", 2],
];

const ROAM_JOURNEY = [
  "/en/pdp/rp-roam",
  "/en/blog/e-bike-battery-myths-busted",
  "/en/pdp/rp-roam",
  "/en/blog/what-our-e-bike-warranty-really-covers",
  "/en/pdp/rp-roam",
  "/en/pdp/rp-roam",
];

function view(path, atMs, extra = {}) {
  return { _uid: SAM.uid, _e: "pv", url: pageUrl(path), ts: new Date(atMs).toISOString(), seed_batch: SEED_BATCH, ...extra };
}

export function samRecords(now) {
  const nowMs = new Date(now).getTime();
  const rng = createRng(104233);
  const web = [];
  for (let s = 0; s < 22; s++) {
    let at = nowMs - 520 * DAY + rng.next() * 480 * DAY;
    for (let v = 0; v < rng.int(1, 3); v++) {
      web.push(view(rng.weighted(SAM_HISTORY), at, v === 0 ? { _sesstart: "1" } : {}));
      at += rng.int(2, 6) * 60 * 1000;
    }
  }
  ROAM_JOURNEY.forEach((path, i) => {
    web.push(view(path, nowMs - (20 - i * 3) * DAY - 5 * HOUR, { roam_journey: true, _sesstart: "1" }));
  });
  return {
    crm: crmRecord(SAM),
    orders: orderRecords(SAM),
    web: web.sort((a, b) => a.ts.localeCompare(b.ts)),
  };
}
