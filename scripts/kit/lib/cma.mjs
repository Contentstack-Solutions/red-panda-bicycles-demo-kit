import { KitError } from "./env.mjs";

const RETRIES = 3;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Errors Node's fetch throws before the request is sent. The code is on `cause`, or on each
// of `cause.errors` when every address was tried (AggregateError).
const CONNECT_ERRORS = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);
function isConnectError(e) {
  const cause = e?.cause;
  if (CONNECT_ERRORS.has(cause?.code)) return true;
  return Array.isArray(cause?.errors) && cause.errors.length > 0 && cause.errors.every((x) => CONNECT_ERRORS.has(x?.code));
}

// Retry-After as seconds or an HTTP date; null when absent or unreadable.
function retryAfterMs(res) {
  const v = res.headers?.get?.("retry-after");
  if (v === null || v === undefined || v === "") return null;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export function createCma({
  apiKey,
  managementToken,
  host = "api.contentstack.io",
  branch = "main",
  fetchImpl = fetch,
  sleep = defaultSleep,
  backoffMs = 500,
}) {
  const base = `https://${host}/v3`;
  const headers = { api_key: apiKey, authorization: managementToken, branch };

  async function request(method, path, { query, body, form } = {}) {
    let url = base + path;
    if (query && Object.keys(query).length) url += "?" + new URLSearchParams(query).toString();
    const init = { method, headers: { ...headers } };
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    // Ruling R7: POST creates, so a 5xx may already have created the object; retry it only on
    // 429 or a connect-phase network error (the request never left). Any other thrown error on a
    // POST (reset, socket closed, headers timeout) may follow a write, so it fails at once and the
    // next run's pending recovery finds the object. GET, PUT and DELETE are idempotent.
    const retryOn5xx = method !== "POST";
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, init);
      } catch (e) {
        if (attempt < RETRIES && (method !== "POST" || isConnectError(e))) {
          await sleep(backoffMs * 2 ** attempt);
          continue;
        }
        const why = [e?.message ?? "fetch failed", e?.cause?.code].filter(Boolean).join(": ");
        throw new KitError(`${method} ${path} failed: network error (${why})`, {
          code: 1,
          hint: "Check the network and CONTENTSTACK_MANAGEMENT_HOST, then re-run; finished steps are skipped.",
          details: { network: true, cause: e?.cause?.code ?? null },
        });
      }
      if ((res.status === 429 || (retryOn5xx && res.status >= 500)) && attempt < RETRIES) {
        await sleep(res.status === 429 ? retryAfterMs(res) ?? backoffMs * 2 ** attempt : backoffMs * 2 ** attempt);
        continue;
      }
      if (method === "GET" && (res.status === 422 || res.status === 404)) return null;
      let parsed = null;
      try { parsed = await res.json(); } catch { /* empty or non-JSON body */ }
      if (res.status >= 400) {
        throw new KitError(`${method} ${path} failed: ${res.status}${parsed?.error_message ? ` ${parsed.error_message}` : ""}`, {
          code: 1,
          details: { status: res.status, error_code: parsed?.error_code, body: parsed },
        });
      }
      return parsed;
    }
  }

  return {
    get: (path, query) => request("GET", path, { query }),
    post: (path, body) => request("POST", path, { body }),
    put: (path, body) => request("PUT", path, { body }),
    del: (path) => request("DELETE", path),
    upload: (path, formData) => request("POST", path, { form: formData }),
  };
}
