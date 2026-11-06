import { describe, expect, it, vi } from "vitest";
import { createRouteLookup, decodePolyline, parseRouteResponse, routeKey, routeUrl } from "./bikeRoutes";

const CENTRAAL = { lat: 52.3791, lng: 4.9003 };
const RIJKS = { lat: 52.36, lng: 4.8852 };

describe("decodePolyline", () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("returns no points for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("routeKey", () => {
  it("rounds to 4 decimals so tiny float noise still matches", () => {
    expect(routeKey({ lat: 52.37910001, lng: 4.9003 }, RIJKS)).toBe("52.3791,4.9003>52.3600,4.8852");
  });
});

describe("routeUrl", () => {
  it("puts coordinates in lng,lat order as OSRM expects", () => {
    expect(routeUrl(CENTRAAL, RIJKS)).toBe(
      "https://routing.openstreetmap.de/routed-bike/route/v1/driving/4.9003,52.3791;4.8852,52.36?overview=full&geometries=polyline"
    );
  });
});

describe("parseRouteResponse", () => {
  it("takes the first route's geometry and distance", () => {
    const json = { code: "Ok", routes: [{ geometry: "_p~iF~ps|U", distance: 3053.6 }] };
    expect(parseRouteResponse(json)).toEqual({ polyline: "_p~iF~ps|U", km: 3.1 });
  });

  it("rejects errors and empty results", () => {
    expect(parseRouteResponse({ code: "NoRoute", routes: [] })).toBeNull();
    expect(parseRouteResponse({ code: "Ok", routes: [] })).toBeNull();
    expect(parseRouteResponse(null)).toBeNull();
  });
});

describe("createRouteLookup", () => {
  const bundled = { [routeKey(CENTRAAL, RIJKS)]: { polyline: "_p~iF~ps|U", km: 3.1 } };
  const okResponse = (body) => ({ ok: true, json: async () => body });

  it("serves bundled routes synchronously without fetching", () => {
    const fetchImpl = vi.fn();
    const lookup = createRouteLookup({ bundled, fetchImpl });
    expect(lookup.peek(CENTRAAL, RIJKS)).toEqual({ points: [[38.5, -120.2]], km: 3.1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches unknown routes once and caches them", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ code: "Ok", routes: [{ geometry: "_p~iF~ps|U", distance: 1000 }] }));
    const lookup = createRouteLookup({ bundled: {}, fetchImpl });
    expect(lookup.peek(CENTRAAL, RIJKS)).toBeNull();
    const route = await lookup.fetch(CENTRAAL, RIJKS);
    expect(route).toEqual({ points: [[38.5, -120.2]], km: 1 });
    await lookup.fetch(CENTRAAL, RIJKS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lookup.peek(CENTRAAL, RIJKS)).toEqual(route);
  });

  it("resolves null on failure and retries next time", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const lookup = createRouteLookup({ bundled: {}, fetchImpl });
    expect(await lookup.fetch(CENTRAAL, RIJKS)).toBeNull();
    expect(await lookup.fetch(CENTRAAL, RIJKS)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats a non-OK HTTP status as a failure", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const lookup = createRouteLookup({ bundled: {}, fetchImpl });
    expect(await lookup.fetch(CENTRAAL, RIJKS)).toBeNull();
  });
});
