// Lytics phase: apply account settings, run the seeder's steps in order, wait for
// audiences and lookalike models, and record this account's own measured counts.
// Never POSTs to probe Lytics; never passes --repin or --resend to the seeder.
import { spawn } from "node:child_process";
import { KitError } from "./env.mjs";
import { parseAudienceActions } from "../../lytics/lib/upsertSegments.mjs";

export const LYTICS_STEPS = ["schema", "topics", "load", "refresh", "audiences", "model"];

const API = "https://api.lytics.io";
const SIZE_POLL_MS = 30_000;
const SIZE_TIMEOUT_MS = 15 * 60_000;
const MODEL_TIMEOUT_MS = 30 * 60_000;

// The funnel audiences answer Act 1 questions 1–3 (state.expected keys stay q1/q2/q3); the rest
// are the story's audiences.
export const EXPECTED_SLUGS = {
  q1: "near_amsterdam",
  q2: "near_amsterdam_volt_owners",
  q3: "near_amsterdam_volt_commuters",
  volt_owners_commuting: "volt_owners_commuting",
  roam_preorder: "roam_preorder",
  roam_intent: "roam_intent",
};

export function withinTolerance(actual, expected, pct = 5) {
  return Math.abs(actual - expected) <= (expected * pct) / 100;
}

export async function measureExpected(sizeFn) {
  const out = {};
  for (const [key, slug] of Object.entries(EXPECTED_SLUGS)) out[key] = await sizeFn(slug);
  return out;
}

async function lyticsGet(path, { token, fetchImpl }) {
  return fetchImpl(`${API}${path}`, { method: "GET", headers: { Authorization: token, Accept: "application/json" } });
}

// GET only. null while the audience is missing or not scannable yet (new ones take about a minute).
export async function audienceSize(slug, { token, fetchImpl = fetch }) {
  const list = await lyticsGet("/v2/segment", { token, fetchImpl });
  if (!list.ok) throw new KitError(`Lytics GET /v2/segment failed (${list.status})`);
  const body = await list.json();
  const seg = (body.data ?? []).find((s) => s.slug_name === slug);
  if (!seg) return null;
  const res = await lyticsGet(`/api/segment/${seg.id}/scan?limit=1`, { token, fetchImpl });
  if (res.status === 404) return null;
  if (!res.ok) throw new KitError(`Lytics audience scan for ${slug} failed (${res.status})`);
  const scan = await res.json();
  const total = scan.total ?? scan.data?.total;
  return typeof total === "number" ? total : null;
}

const settingUrl = (name) => `${API}/api/account/setting/${encodeURIComponent(name)}`;

// The endpoint takes a bare JSON array; {"value": [...]} gets a 400.
export async function putAccountSetting(name, value, { token, fetchImpl = fetch }) {
  const res = await fetchImpl(settingUrl(name), {
    method: "PUT",
    headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new KitError(`Applying Lytics account setting ${name} failed (${res.status})`);
}

// The current list value of a setting: [] when it was never set (404 or null), undefined when the
// response has a shape the kit doesn't know (the GET response shape is unconfirmed; see
// docs/live-run-checklist.md).
function listValue(body) {
  for (const v of [body, body?.data, body?.data?.value, body?.value]) if (Array.isArray(v)) return v;
  if (body === null || body?.data === null || body?.data?.value === null || body?.value === null) return [];
  return undefined;
}

async function getAccountSetting(name, { token, fetchImpl }) {
  const res = await fetchImpl(settingUrl(name), { method: "GET", headers: { Authorization: token, Accept: "application/json" } });
  if (res.status === 404) return [];
  const fail = (why) => new KitError(`Couldn't read the Lytics account setting ${name} (${why}), so it wasn't changed.`, {
    hint: "Re-run npm run kit:lytics; if it keeps failing, check the setting in Lytics. Nothing was changed.",
  });
  if (!res.ok) throw fail(`HTTP ${res.status}`);
  const value = listValue(await res.json());
  if (value === undefined) throw fail("unexpected response");
  return value;
}

/**
 * Ruling R35: merges list settings into the account's current values (GET, union, PUT) instead
 * of replacing them. `onPrevious(name, value)` gets each current value before the PUT, so it can
 * be recorded for teardown to restore.
 */
export async function applyAccountSettings({ token, fetchImpl = fetch, settings, onPrevious = () => {} }) {
  for (const [name, wanted] of Object.entries(settings)) {
    const current = await getAccountSetting(name, { token, fetchImpl });
    await onPrevious(name, current);
    const value = Array.isArray(wanted) ? [...new Set([...current, ...wanted])] : wanted;
    await putAccountSetting(name, value, { token, fetchImpl });
  }
}

export function assertSiteUrl(siteUrl) {
  const msg = "Set SITE_URL to your Launch site URL (for example https://<project>.contentstackapps.com) before seeding; seeded page views use its domain.";
  let host = "";
  try {
    host = new URL(String(siteUrl ?? "").trim()).hostname;
  } catch {
    throw new KitError(msg, { code: 2 });
  }
  if (!host || ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host.toLowerCase())) throw new KitError(msg, { code: 2 });
}

// Default seeder invocation. Stderr is shown live and also captured.
export function spawnSeeder(step, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--env-file=.env.local", "scripts/lytics/seed-lytics.mjs", step, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => { stderr += d; process.stderr.write(d); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function pollUntil(check, { sleep, clock, intervalMs, timeoutMs }) {
  const deadline = clock() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (clock() >= deadline) return false;
    await sleep(intervalMs);
  }
}

function parseModels(stdout) {
  return String(stdout).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

// Ruling R21: the audiences the seeder created go in state.created.lyticsAudiences (teardown
// may delete them); ones that already existed go in state.adopted.lyticsAudiences (never
// deleted). Recorded even when the step fails partway.
export function recordAudiences(state, stdout) {
  const created = ((state.created ??= {}).lyticsAudiences ??= []);
  const adopted = ((state.adopted ??= {}).lyticsAudiences ??= []);
  for (const { audience, action } of parseAudienceActions(stdout)) {
    if (action === "created") {
      if (!created.includes(audience) && !adopted.includes(audience)) created.push(audience);
    } else if (!created.includes(audience) && !adopted.includes(audience)) adopted.push(audience);
  }
  return state;
}

/**
 * @param {object} d
 * @param {(step: string, args: string[]) => Promise<{code:number, stdout:string, stderr:string}>} d.runStep
 * @param {(slug: string) => Promise<number|null>} d.sizeFn
 */
export async function runLyticsPhase(d) {
  const { runStep, sizeFn, sleep, clock, state, save = () => {}, log = () => {}, warn = log, applySettings, nowIso } = d;
  assertSiteUrl(d.siteUrl);
  const phase = (state.phases.lytics ??= { steps: {}, done: false });
  phase.steps ??= {};
  const persist = () => save(state);

  if (!phase.settingsApplied && applySettings) {
    log("Applying Lytics account settings (adding the kit's fields to api_whitelist_fields)");
    await applySettings({
      // R35: the account's own whitelist, recorded once (before the first PUT) for teardown to restore.
      onPrevious: (name, value) => {
        if (name !== "api_whitelist_fields") return;
        const lytics = (state.lytics ??= {});
        if (lytics.previousWhitelist === undefined) {
          lytics.previousWhitelist = value;
          persist();
        }
      },
    });
    phase.settingsApplied = true;
    persist();
  }

  const measure = async () => {
    if (state.expected) return;
    log("Waiting for audiences to populate (up to 15 min)");
    const slugs = Object.values(EXPECTED_SLUGS);
    const ready = await pollUntil(async () => {
      for (const slug of slugs) {
        const n = await sizeFn(slug);
        if (!(n > 0)) return false;
      }
      return true;
    }, { sleep, clock, intervalMs: SIZE_POLL_MS, timeoutMs: SIZE_TIMEOUT_MS });
    if (!ready) {
      throw new KitError("Audiences were not populated after 15 min.", { hint: "Re-run npm run kit:lytics; completed steps are skipped." });
    }
    state.expected = await measureExpected(sizeFn);
    persist();
    log(`Measured your counts: ${JSON.stringify(state.expected)}`);
  };

  for (const step of LYTICS_STEPS) {
    if (phase.steps[step]?.done) {
      log(`skip ${step} (done)`);
    } else {
      log(`run ${step}`);
      const args = step === "load" && nowIso ? ["--now", nowIso]
        // R35: the seeder may update only the audiences the kit created.
        : step === "audiences" ? ["--created", (state.created?.lyticsAudiences ?? []).join(",")]
        : [];
      const res = await runStep(step, args);
      if (step === "audiences") {
        recordAudiences(state, res.stdout);
        persist();
      }
      if (res.code !== 0) {
        if (step === "load" && res.code === 3) {
          throw new KitError("Load stopped: this Lytics account already has seeded profiles, but the local seed state is empty.", {
            code: 3,
            hint: "Restore scripts/lytics/.state/seed-state.json if you have it. To deliberately load a second copy, run `node --env-file=.env.local scripts/lytics/seed-lytics.mjs load --repin` yourself (it adds a second history and inflates scores). Nothing was changed.",
          });
        }
        if (step === "audiences" && res.code === 3) {
          throw new KitError("Stopped: a Lytics audience the kit didn't create has the same slug as a kit audience and a different definition (named above).", {
            code: 3,
            hint: "Rename or delete it in Lytics, then re-run npm run kit:lytics. Nothing was changed.",
          });
        }
        throw new KitError(`Lytics step "${step}" failed (exit ${res.code}).`, { code: 1, hint: "Fix the error above and re-run; completed steps are skipped." });
      }
      phase.steps[step] = { done: true, at: new Date().toISOString() };
      if (step === "load") {
        try {
          const status = await runStep("status", []);
          const now = JSON.parse(status.stdout).now;
          if (now) phase.now = now;
        } catch { /* now is informational */ }
      }
      persist();
    }
    if (step === "audiences") await measure();
  }

  log("Waiting for lookalike models (up to 30 min)");
  let last = [];
  const healthy = await pollUntil(async () => {
    const res = await runStep("models", []);
    last = parseModels(res.stdout);
    return last.length >= 2 && last.every((m) => m.model_health);
  }, { sleep, clock, intervalMs: SIZE_POLL_MS, timeoutMs: MODEL_TIMEOUT_MS });
  if (!healthy) {
    warn(`Lookalike models have not reported health yet (${last.map((m) => `${m.name ?? m.id}: ${m.state}`).join(", ") || "none listed"}). Continuing; check later with the seeder's models step.`);
  }
  phase.done = true;
  persist();
  return state;
}
