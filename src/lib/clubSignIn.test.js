import { describe, expect, it, vi } from "vitest";
import { signInMember } from "./clubSignIn";

const member = { firstName: "Sam", lastName: "Parker", email: "sam.parker@example.com" };

function setup({ jstag, jstagAt = () => jstag, audienceAtMs = Infinity } = {}) {
  let t = 0;
  const cookiesSet = [];
  const clock = { now: () => t, sleep: vi.fn(async (ms) => { t += ms; }) };
  const getCookies = () => (t >= audienceAtMs ? "seerid=abc; cs-lytics-audiences=%7Cvolt_owners_commuting%7C" : "seerid=abc");
  const run = () =>
    signInMember({
      getJstag: () => jstagAt(t),
      member,
      audience: "volt_owners_commuting",
      timeoutMs: 8000,
      getCookies,
      setCookie: (c) => cookiesSet.push(c),
      hostname: "localhost",
      warn: vi.fn(),
      ...clock,
    });
  return { run, cookiesSet, clock, elapsed: () => t };
}

describe("signInMember", () => {
  it("clears the cached manifest and records the member before identifying", async () => {
    const calls = [];
    const jstag = { send: vi.fn(() => calls.push("send")), loadEntity: vi.fn() };
    const { run, cookiesSet } = setup({ jstag, audienceAtMs: 0 });
    await run();
    expect(cookiesSet[0]).toBe("cs-personalize-manifest=; Path=/; Max-Age=0");
    expect(cookiesSet[1].startsWith("rp_bc_member=")).toBe(true);
    expect(calls).toEqual(["send"]);
  });

  it("identifies with the exact payload", async () => {
    const jstag = { send: vi.fn(), loadEntity: vi.fn() };
    const { run } = setup({ jstag, audienceAtMs: 0 });
    await run();
    expect(jstag.send).toHaveBeenCalledTimes(1);
    expect(jstag.send).toHaveBeenCalledWith({ email: "sam.parker@example.com", amsterdam_bc_member: true });
  });

  it("resolves matched once the audience cookie appears", async () => {
    const jstag = { send: vi.fn(), loadEntity: vi.fn() };
    const { run, elapsed } = setup({ jstag, audienceAtMs: 3000 });
    await expect(run()).resolves.toEqual({ identified: true, matched: true });
    expect(elapsed()).toBe(3000);
  });

  it("asks the tag to reload the entity every 2 s while waiting", async () => {
    const jstag = { send: vi.fn(), loadEntity: vi.fn() };
    const { run } = setup({ jstag, audienceAtMs: 5000 });
    await run();
    expect(jstag.loadEntity).toHaveBeenCalledTimes(2); // at 2000 and 4000 ms
  });

  it("gives up at the timeout", async () => {
    const jstag = { send: vi.fn(), loadEntity: vi.fn() };
    const { run, elapsed } = setup({ jstag });
    await expect(run()).resolves.toEqual({ identified: true, matched: false });
    expect(elapsed()).toBe(8000);
  });

  it("treats the queue stub as unavailable after a 1 s grace instead of waiting 8 s", async () => {
    const jstag = { send: vi.fn() }; // snippet stub: send queues, no loadEntity
    const { run, elapsed } = setup({ jstag });
    await expect(run()).resolves.toEqual({ identified: false, matched: false });
    expect(elapsed()).toBe(1000);
    expect(jstag.send).not.toHaveBeenCalled();
  });

  it("waits for the real tag to replace the stub before identifying", async () => {
    const stub = { send: vi.fn() };
    const real = { send: vi.fn(), loadEntity: vi.fn() };
    const { run } = setup({ jstagAt: (ms) => (ms >= 500 ? real : stub), audienceAtMs: 2500 });
    await expect(run()).resolves.toEqual({ identified: true, matched: true });
    expect(stub.send).not.toHaveBeenCalled();
    expect(real.send).toHaveBeenCalledTimes(1);
  });

  it("does not throw when loadEntity throws", async () => {
    const jstag = { send: vi.fn(), loadEntity: vi.fn(() => { throw new Error("boom"); }) };
    const { run } = setup({ jstag, audienceAtMs: 4000 });
    await expect(run()).resolves.toEqual({ identified: true, matched: true });
  });

  it("skips identify and waiting when the tag is missing", async () => {
    const { run, cookiesSet, clock } = setup({ jstag: undefined });
    await expect(run()).resolves.toEqual({ identified: false, matched: false });
    expect(cookiesSet.some((c) => c.startsWith("rp_bc_member="))).toBe(true);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("does not throw when send throws", async () => {
    const jstag = { send: vi.fn(() => { throw new Error("blocked"); }), loadEntity: vi.fn() };
    const { run, clock } = setup({ jstag });
    await expect(run()).resolves.toEqual({ identified: false, matched: false });
    expect(clock.sleep).not.toHaveBeenCalled();
  });
});
