import { describe, expect, it } from "vitest";
import { batchId, batchStatus, contentHash, markSent, migrateState } from "./state.mjs";
import { decidePin } from "./pin.mjs";

describe("batch identity (Important #2)", () => {
  it("keys batches by stream and position, not content", () => {
    expect(batchId("default", "12.3")).toBe("default:12.3");
  });

  it("reports send / skip / conflict", () => {
    const state = { sent: {} };
    const id = batchId("default", "0.0");
    expect(batchStatus(state, id, contentHash([{ a: 1 }]))).toBe("send");
    markSent(state, id, { hash: contentHash([{ a: 1 }]), count: 1 });
    expect(batchStatus(state, id, contentHash([{ a: 1 }]))).toBe("skip");
    expect(batchStatus(state, id, contentHash([{ a: 2 }]))).toBe("conflict");
  });

  it("migrates legacy stream:index:hash keys without losing sent batches", () => {
    const legacy = { now: "2026-09-24T08:38:01.820Z", sent: { "default:3.0:abc123def456": { at: "t", count: 500 } } };
    const state = migrateState(legacy);
    expect(state.sent).toEqual({ "default:3.0": { at: "t", count: 500, hash: "abc123def456" } });
    expect(batchStatus(state, "default:3.0", "abc123def456")).toBe("skip");
    expect(batchStatus(state, "default:3.0", "different")).toBe("conflict");
  });
});

describe("decidePin (Important #1 and #3)", () => {
  it("keeps the pinned run", () => {
    const state = { now: "2026-09-24T08:38:01.820Z", seed: 1, size: 10, sent: {} };
    expect(decidePin({ state, requestedNow: undefined, alreadySeeded: true, repin: false, seed: 1, size: 10 })).toEqual({ now: "2026-09-24T08:38:01.820Z", seed: 1, size: 10 });
  });

  it("refuses a different --now once pinned, even with --repin", () => {
    const state = { now: "2026-09-24T08:38:01.820Z", seed: 1, size: 10, sent: {} };
    expect(() => decidePin({ state, requestedNow: "2026-09-25T00:00:00Z", alreadySeeded: true, repin: true, seed: 1, size: 10 })).toThrow(/pinned/);
  });

  it("refuses to start a fresh run when the account is already seeded", () => {
    expect(() => decidePin({ state: { sent: {} }, requestedNow: undefined, alreadySeeded: true, repin: false, seed: 1, size: 10 })).toThrow(/already has seeded profiles/);
    try {
      decidePin({ state: { sent: {} }, requestedNow: undefined, alreadySeeded: true, repin: false, seed: 1, size: 10 });
    } catch (e) {
      expect(e.code).toBe(3); // exit 3: kit:lytics keys on it
    }
  });

  it("allows a fresh run on a clean account, or with an explicit --repin", () => {
    const now = "2026-09-24T08:00:00.000Z";
    expect(decidePin({ state: { sent: {} }, requestedNow: now, alreadySeeded: false, repin: false, seed: 1, size: 10 })).toEqual({ now, seed: 1, size: 10 });
    expect(decidePin({ state: { sent: {} }, requestedNow: now, alreadySeeded: true, repin: true, seed: 1, size: 10 })).toEqual({ now, seed: 1, size: 10 });
  });
});
