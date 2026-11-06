import { afterEach, describe, expect, it, vi } from "vitest";
import { getDevicePosition } from "./geolocation";

function stubGeolocation(impl) {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: vi.fn(impl) } });
  return navigator.geolocation.getCurrentPosition;
}

afterEach(() => vi.unstubAllGlobals());

describe("getDevicePosition", () => {
  it("resolves with lat/lng", async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 52.37, longitude: 4.89 } }));
    await expect(getDevicePosition()).resolves.toEqual({ lat: 52.37, lng: 4.89 });
  });

  it("asks with a 10 s timeout and 5 min cache by default", async () => {
    const spy = stubGeolocation((ok) => ok({ coords: { latitude: 1, longitude: 2 } }));
    await getDevicePosition();
    expect(spy.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ])("maps error code %i to %s", async (code, expected) => {
    stubGeolocation((_ok, fail) => fail({ code }));
    await expect(getDevicePosition()).rejects.toMatchObject({ code: expected });
  });

  it("times out even if the browser never calls back (unanswered permission prompt)", async () => {
    vi.useFakeTimers();
    try {
      stubGeolocation(() => {}); // e.g. Firefox after the permission popup is dismissed
      const pending = expect(getDevicePosition()).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(12000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late browser callback after the watchdog fired", async () => {
    vi.useFakeTimers();
    try {
      let late;
      stubGeolocation((ok) => { late = ok; });
      const pending = expect(getDevicePosition()).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(12000);
      late({ coords: { latitude: 1, longitude: 2 } });
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects as unsupported without the Geolocation API", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getDevicePosition()).rejects.toMatchObject({ code: "unsupported" });
  });
});
