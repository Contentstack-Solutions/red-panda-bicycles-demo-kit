// Thin Lytics REST client for the seeding scripts. Every call goes through
// `request`, which throws with the response body on HTTP errors.
export function createClient({ token, fetchImpl = fetch, base = "https://api.lytics.io" }) {
  async function request(method, path, body, query = {}) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url.toString(), {
      method,
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 800)}`);
    return json;
  }

  async function collect(stream, records, { timestampField, dryRun = false, chunkSize = 500, onChunk } = {}) {
    const results = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const res = await request("POST", `/collect/json/${stream}`, chunk, {
        timestamp_field: timestampField,
        dryrun: dryRun ? "true" : undefined,
      });
      results.push(res);
      onChunk?.(i / chunkSize, chunk, res);
    }
    return results;
  }

  return {
    request,
    collect,
    getFields: () => request("GET", "/v2/schema/user/field", undefined, { limit: 1000 }),
    getMappings: () => request("GET", "/v2/schema/user/mapping", undefined, { limit: 1000 }),
    createField: (field) => request("POST", "/v2/schema/user/field", field),
    createMapping: (mapping) => request("POST", "/v2/schema/user/mapping", mapping),
    publishSchema: (tag, description) => request("POST", "/v2/schema/user/publish", { tag, description }),
    getEntityByEmail: (email) => request("GET", `/api/entity/user/email/${encodeURIComponent(email)}`),
    getSegments: () => request("GET", "/api/segment", undefined, { table: "user" }),
    createSegment: (segment) => request("POST", "/api/segment", segment),
    segmentSize: (id) => request("GET", `/api/segment/${id}/sizes`),
  };
}
