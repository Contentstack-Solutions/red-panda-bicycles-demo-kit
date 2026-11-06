import { describe, expect, it, vi } from "vitest";
import { waitFor } from "./waitFor";

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: vi.fn(async (ms) => { t += ms; }) };
}

describe("waitFor", () => {
  it("resolves true immediately without sleeping when already satisfied", async () => {
    const clock = fakeClock();
    await expect(waitFor(() => true, { timeoutMs: 1000, ...clock })).resolves.toBe(true);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("resolves true once the predicate flips before the timeout", async () => {
    const clock = fakeClock();
    const result = await waitFor((elapsed) => elapsed >= 750, { timeoutMs: 1000, intervalMs: 250, ...clock });
    expect(result).toBe(true);
    expect(clock.now()).toBe(750);
  });

  it("resolves false at the timeout", async () => {
    const clock = fakeClock();
    await expect(waitFor(() => false, { timeoutMs: 1000, intervalMs: 250, ...clock })).resolves.toBe(false);
    expect(clock.now()).toBe(1000);
  });

  it("passes elapsed milliseconds and awaits async predicates", async () => {
    const clock = fakeClock();
    const seen = [];
    await waitFor(async (elapsed) => { seen.push(elapsed); return false; }, { timeoutMs: 500, intervalMs: 250, ...clock });
    expect(seen).toEqual([0, 250, 500]);
  });
});
