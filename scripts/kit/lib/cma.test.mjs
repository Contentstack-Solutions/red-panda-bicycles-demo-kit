import { describe, it, expect } from "vitest";
import { createCma } from "./cma.mjs";
import { KitError } from "./env.mjs";

const res = (status, body = {}, headers = {}) => ({
  status,
  ok: status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});
// Node's fetch failure: TypeError("fetch failed") with the socket error as `cause`.
const fetchFailed = (code) => Object.assign(new TypeError("fetch failed"), code ? { cause: Object.assign(new Error(code), { code }) } : {});
// A response that is an Error makes fetch throw (network failure before any response).
const make = (responses) => {
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const cma = createCma({ apiKey: "k", managementToken: "t", fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
  return { cma, calls, sleeps };
};

describe("cma", () => {
  it("get returns null on 422", async () => {
    const { cma, calls } = make([res(422, { error_code: 141 })]);
    expect(await cma.get("/content_types/x")).toBeNull();
    expect(calls[0].url).toBe("https://api.contentstack.io/v3/content_types/x");
    expect(calls[0].init.headers).toMatchObject({ api_key: "k", authorization: "t", branch: "main" });
  });

  it("retries 429 then succeeds", async () => {
    const { cma, calls } = make([res(429), res(503), res(200, { ok: 1 })]);
    expect(await cma.get("/x", { a: 1 })).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain("?a=1");
  });

  it("throws KitError with status and error_code after retries", async () => {
    const { cma, calls } = make([res(500), res(500), res(500), res(500)]);
    await expect(cma.put("/x", {})).rejects.toMatchObject({ details: { status: 500 } });
    expect(calls).toHaveLength(4);
    const { cma: c2 } = make([res(400, { error_code: 99 })]);
    const e = await c2.post("/x", {}).catch((err) => err);
    expect(e).toBeInstanceOf(KitError);
    expect(e.details.error_code).toBe(99);
    expect(e.details.status).toBe(400);
  });

  // Ruling R7: a POST that reached the server may have created the object, so it is never retried on 5xx.
  it("does not retry POST or upload on 5xx", async () => {
    const { cma, calls } = make([res(502), res(200, { ok: 1 })]);
    await expect(cma.post("/x", {})).rejects.toMatchObject({ code: 1, details: { status: 502 } });
    expect(calls).toHaveLength(1);
    const { cma: c2, calls: calls2 } = make([res(500), res(200, { ok: 1 })]);
    await expect(c2.upload("/assets", new FormData())).rejects.toMatchObject({ details: { status: 500 } });
    expect(calls2).toHaveLength(1);
  });

  it("retries POST on 429 and on a network error before any response", async () => {
    const { cma, calls } = make([res(429), fetchFailed("ECONNREFUSED"), res(201, { ok: 1 })]);
    expect(await cma.post("/x", { a: 1 })).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
  });

  // Node's fetch also throws after the request was sent (reset, socket closed, headers timeout);
  // the server may have created the object, so a POST is retried only on connect-phase errors.
  it("does not retry a POST whose error came after the request was sent", async () => {
    for (const code of ["ECONNRESET", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", undefined]) {
      const { cma, calls } = make([fetchFailed(code), res(201, { ok: 1 })]);
      const e = await cma.post("/x", {}).catch((err) => err);
      expect(e).toBeInstanceOf(KitError);
      expect(e.code).toBe(1);
      expect(calls).toHaveLength(1);
    }
    const { cma: up, calls: upCalls } = make([fetchFailed("ECONNRESET"), res(201, { ok: 1 })]);
    await expect(up.upload("/assets", new FormData())).rejects.toMatchObject({ code: 1 });
    expect(upCalls).toHaveLength(1);
  });

  it("retries a POST on connect-phase errors", async () => {
    const refusedAll = Object.assign(new TypeError("fetch failed"), {
      cause: new AggregateError([Object.assign(new Error("a"), { code: "ECONNREFUSED" }), Object.assign(new Error("b"), { code: "ECONNREFUSED" })]),
    });
    const { cma, calls } = make([fetchFailed("ECONNREFUSED"), fetchFailed("ENOTFOUND"), refusedAll, res(201, { ok: 1 })]);
    expect(await cma.post("/x", {})).toEqual({ ok: 1 });
    expect(calls).toHaveLength(4);
    const { cma: c2, calls: calls2 } = make([fetchFailed("EAI_AGAIN"), fetchFailed("UND_ERR_CONNECT_TIMEOUT"), res(201, { ok: 1 })]);
    expect(await c2.post("/x", {})).toEqual({ ok: 1 });
    expect(calls2).toHaveLength(3);
  });

  it("still retries PUT on any network error", async () => {
    const { cma, calls } = make([fetchFailed("ECONNRESET"), res(200, { ok: 1 })]);
    expect(await cma.put("/x", {})).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it("retries PUT, DELETE and GET on 5xx", async () => {
    const { cma, calls } = make([res(503), res(200, { put: 1 }), res(500), res(200, { del: 1 }), res(504), res(200, { get: 1 })]);
    expect(await cma.put("/x", {})).toEqual({ put: 1 });
    expect(await cma.del("/x")).toEqual({ del: 1 });
    expect(await cma.get("/x")).toEqual({ get: 1 });
    expect(calls.map((c) => c.init.method)).toEqual(["PUT", "PUT", "DELETE", "DELETE", "GET", "GET"]);
  });

  it("wraps a thrown fetch error in KitError code 1 once retries are spent", async () => {
    const boom = () => fetchFailed("ECONNRESET");
    const { cma, calls } = make([boom(), boom(), boom(), boom()]);
    const e = await cma.get("/x").catch((err) => err);
    expect(e).toBeInstanceOf(KitError);
    expect(e.code).toBe(1);
    expect(e.message).toContain("GET /x");
    expect(calls).toHaveLength(4);
  });

  it("honors Retry-After on 429 (seconds), else exponential backoff", async () => {
    const { cma, sleeps } = make([res(429, {}, { "retry-after": "7" }), res(429), res(200, { ok: 1 })]);
    expect(await cma.post("/x", {})).toEqual({ ok: 1 });
    expect(sleeps).toEqual([7000, 1000]);
  });
});
