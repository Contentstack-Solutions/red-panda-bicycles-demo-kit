import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRng } from "./rng.mjs";
import { DOMAIN, PAGES } from "./catalog.mjs";
import { generatePopulation, isLocal, owns } from "./population.mjs";
import { SEED_BATCH, crmRecord, orderRecords, webEvents } from "./records.mjs";
import { SAM, samRecords } from "./sam.mjs";

const NOW = new Date("2026-09-24T12:00:00Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const topicsOf = (url) => PAGES.find((p) => url.endsWith(p.path))?.topics ?? {};
let people;

beforeAll(() => {
  vi.stubEnv("DEMO_PERSONA_EMAIL", "sam.parker@example.com");
  people = generatePopulation({ seed: 20261014, size: 3000, now: NOW });
});

afterAll(() => vi.unstubAllEnvs());

describe("neutral identifiers", () => {
  it("uses the rp-demo-kit seed batch", () => {
    expect(SEED_BATCH).toBe("rp-demo-kit");
    expect(crmRecord(people[0]).seed_batch).toBe("rp-demo-kit");
  });
});

describe("crmRecord / orderRecords", () => {
  it("carries the same email and _uid on CRM and order records", () => {
    const p = people.find((q) => q.bikes.length && q.accessories.length);
    const crm = crmRecord(p);
    expect(crm).toMatchObject({ email: p.email, _uid: p.uid, seed_batch: SEED_BATCH, home_distance_km: p.distanceKm });
    for (const order of orderRecords(p)) expect(order).toMatchObject({ email: p.email, _uid: p.uid, seed_batch: SEED_BATCH });
  });

  it("emits one purchase per item plus a Roam pre-order when present", () => {
    const p = people.find((q) => q.preorder);
    const orders = orderRecords(p);
    expect(orders.filter((o) => o.action === "purchase")).toHaveLength(p.bikes.length + p.accessories.length);
    expect(orders.filter((o) => o.action === "preorder")).toEqual([
      expect.objectContaining({ product: "RP Roam", ts: p.preorder.at }),
    ]);
  });
});

describe("webEvents", () => {
  const eventsFor = (p) => webEvents(p, { rng: createRng(Number(p.n)), now: NOW });

  it("stamps every page view with _uid, _e=pv, an absolute site URL and a past ISO timestamp", () => {
    for (const p of people.slice(0, 300)) {
      for (const e of eventsFor(p)) {
        expect(e._uid).toBe(p.uid);
        expect(e._e).toBe("pv");
        expect(e.url.startsWith(`https://${DOMAIN}/en`)).toBe(true);
        expect(e.ts.endsWith("Z")).toBe(true);
        expect(NOW - new Date(e.ts)).toBeGreaterThanOrEqual(HOUR);
      }
    }
  });

  it("gives commuters commuting-topic page views", () => {
    const commuters = people.filter((p) => p.commuter && p.archetype !== "new").slice(0, 100);
    const withCommuting = commuters.filter((p) => eventsFor(p).some((e) => topicsOf(e.url).Commuting));
    expect(withCommuting.length / commuters.length).toBeGreaterThan(0.85);
  });

  it("ramps pre-orderers up on Roam pages in the last 45 days", () => {
    for (const p of people.filter((q) => q.preorder)) {
      const recentRoam = eventsFor(p).filter((e) => e.url.endsWith("/en/pdp/rp-roam") && NOW - new Date(e.ts) <= 45 * DAY);
      expect(recentRoam.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("stops lapsed visitors at least 120 days ago", () => {
    for (const p of people.filter((q) => q.archetype === "lapsed").slice(0, 100)) {
      for (const e of eventsFor(p)) expect(NOW - new Date(e.ts)).toBeGreaterThanOrEqual(120 * DAY);
    }
  });

  it("marks the first page view of each session as a session start", () => {
    const events = eventsFor(people.find((p) => p.archetype === "power"));
    expect(events.some((e) => e._sesstart === "1")).toBe(true);
    expect(events.filter((e) => e._sesstart === "1").length).toBeLessThan(events.length);
  });
});

describe("Sam", () => {
  const { crm, orders, web } = samRecords(NOW);

  it("uses her deliverable address and doc values", () => {
    expect(SAM.email).toBe("sam.parker@example.com");
    expect(crm).toMatchObject({
      email: "sam.parker@example.com",
      _uid: "seed-sam",
      loyalty_id: "RP-104233",
      home_area: "Amsterdam-Oost",
      club_membership: "Amsterdam Bike Club",
      volt_review_rating: 2,
      battery_service_tickets: 3,
      last_test_ride: "Amsterdam Bike Club demo ride, attended",
    });
  });

  it("owns a 2021 RP Volt and the Metro Hybrid, and has not pre-ordered", () => {
    const volt = orders.find((o) => o.product === "RP Volt");
    expect(volt.ts.startsWith("2021")).toBe(true);
    expect(orders.some((o) => o.product === "Red Panda Metro Hybrid")).toBe(true);
    expect(orders.some((o) => o.action === "preorder")).toBe(false);
  });

  it("has six recent Roam-journey views including battery myths and warranty", () => {
    const recent = web.filter((e) => NOW - new Date(e.ts) <= 21 * DAY && e.roam_journey);
    expect(recent).toHaveLength(6);
    expect(recent.some((e) => e.url.endsWith("e-bike-battery-myths-busted"))).toBe(true);
    expect(recent.some((e) => e.url.endsWith("what-our-e-bike-warranty-really-covers"))).toBe(true);
    for (const e of web) expect(NOW - new Date(e.ts)).toBeGreaterThanOrEqual(HOUR);
  });
});
