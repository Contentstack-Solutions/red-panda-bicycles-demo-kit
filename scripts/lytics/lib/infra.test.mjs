import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "./lyticsClient.mjs";
import { FIELDS, MAPPINGS, EXISTING_FIELDS } from "./schemaDef.mjs";
import { batchId, batchStatus, contentHash, loadState, markSent, saveState } from "./state.mjs";

function fakeFetch(responses = []) {
  const calls = [];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url: new URL(url), init, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() ?? { status: 200, json: { status: 200, data: {} } };
    return { ok: next.status < 400, status: next.status, json: async () => next.json, text: async () => JSON.stringify(next.json) };
  });
  return { impl, calls };
}

describe("lyticsClient.collect", () => {
  it("chunks records and passes timestamp_field and dryrun", async () => {
    const { impl, calls } = fakeFetch();
    const client = createClient({ token: "t", fetchImpl: impl });
    const records = Array.from({ length: 1201 }, (_, i) => ({ i }));
    await client.collect("default", records, { timestampField: "ts", dryRun: true, chunkSize: 500 });
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.body.length)).toEqual([500, 500, 201]);
    for (const c of calls) {
      expect(c.url.pathname).toBe("/collect/json/default");
      expect(c.url.searchParams.get("timestamp_field")).toBe("ts");
      expect(c.url.searchParams.get("dryrun")).toBe("true");
      expect(c.init.headers.Authorization).toBe("t");
    }
  });

  it("throws with the response body on HTTP errors", async () => {
    const { impl } = fakeFetch([{ status: 400, json: { message: "bad field" } }]);
    const client = createClient({ token: "t", fetchImpl: impl });
    await expect(client.request("POST", "/v2/schema/user/field", {})).rejects.toThrow(/400.*bad field/);
  });
});

describe("state", () => {
  it("records sent batches and survives a reload (resume)", () => {
    const path = join(mkdtempSync(join(tmpdir(), "seed-")), "state.json");
    const state = loadState(path);
    const id = batchId("default", 3);
    const hash = contentHash([{ a: 1 }]);
    expect(batchStatus(state, id, hash)).toBe("send");
    markSent(state, id, { hash, count: 1 });
    saveState(path, state);
    expect(batchStatus(loadState(path), id, hash)).toBe("skip");
  });

  it("hashes change when a batch's content changes", () => {
    expect(contentHash([{ a: 1 }])).not.toBe(contentHash([{ a: 2 }]));
  });
});

describe("schemaDef", () => {
  it("maps every custom field from at least one stream", () => {
    for (const field of FIELDS) expect(MAPPINGS.some((m) => m.field === field.id)).toBe(true);
  });

  it("only maps to fields it defines or that already exist", () => {
    const known = new Set([...FIELDS.map((f) => f.id), ...EXISTING_FIELDS]);
    for (const m of MAPPINGS) expect(known.has(m.field)).toBe(true);
  });

  it("links identity on every custom stream", () => {
    for (const stream of ["rp_crm", "rp_orders"]) {
      expect(MAPPINGS.some((m) => m.stream === stream && m.field === "email")).toBe(true);
      expect(MAPPINGS.some((m) => m.stream === stream && m.field === "_uids")).toBe(true);
    }
  });
});
