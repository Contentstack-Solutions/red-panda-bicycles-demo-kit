// Seeds the Red Panda Lytics account with a deterministic synthetic population.
//
// Usage: node --env-file=.env.local scripts/lytics/seed-lytics.mjs <step> [options]
//   steps:   schema | topics | spike | load | refresh | status | audiences | sizes | sam | model | models
//   options: --dry-run  --size N (default 25000)  --now ISO (first run only)
//            --resend  re-send batches whose content changed (adds events on top!)
//            --repin   start a new run even though the account already has seeded profiles
//            --commuting T (lytics_content.Commuting threshold, default 0.2)
//            --created a,b (audiences step: slugs the kit created and may update; any other
//                      existing audience with a kit slug and a different definition stops it, exit 3)
//
// The first data-sending run pins `now` and the seed in scripts/lytics/.state/
// so every re-run regenerates identical batches and skips the ones already sent.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAIN, PAGES } from "./lib/catalog.mjs";
import { createClient } from "./lib/lyticsClient.mjs";
import { generatePopulation } from "./lib/population.mjs";
import { crmRecord, orderRecords, webEvents } from "./lib/records.mjs";
import { createRng } from "./lib/rng.mjs";
import { KitError } from "../kit/lib/env.mjs";
import { samEmail, samRecords } from "./lib/sam.mjs";
import { FIELDS, MAPPINGS } from "./lib/schemaDef.mjs";
import { FUNNEL_CHECKS, LOOKALIKE_MODELS as MODELS, audiences as audienceDefs } from "./lib/audienceDef.mjs";
import { batchId, batchStatus, contentHash, loadState, markSent, saveState } from "./lib/state.mjs";
import { decidePin } from "./lib/pin.mjs";
import { createdFromArgs, upsertSegments } from "./lib/upsertSegments.mjs";

const SEED = 20261014;
const PROFILES_PER_BATCH = 100;
const CHUNK = 500;
const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), ".state", "seed-state.json");

const args = process.argv.slice(2);
const step = args[0];
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dryRun = flag("dry-run");
const resend = flag("resend");
const repin = flag("repin");
const size = Number(option("size", 25000));

if (!process.env.LYTICS_ACCESS_TOKEN) throw new Error("LYTICS_ACCESS_TOKEN must be set (.env.local)");
const client = createClient({ token: process.env.LYTICS_ACCESS_TOKEN });

async function schema() {
  const existingFields = new Set((await client.getFields()).data.map((f) => f.id));
  const existingMappings = (await client.getMappings()).data;
  const sameMapping = (a, b) => a.stream === b.stream && a.field === b.field && a.expr === b.expr && (a.guard_expr ?? "") === (b.guard_expr ?? "");
  for (const f of FIELDS) {
    if (existingFields.has(f.id)) {
      console.log(`✓ field ${f.id}`);
      continue;
    }
    if (!dryRun) await client.createField(f);
    console.log(`+ field ${f.id} (${f.type}, ${f.mergeop})`);
  }
  for (const m of MAPPINGS) {
    if (existingMappings.some((e) => sameMapping(e, m))) {
      console.log(`✓ mapping ${m.stream}.${m.field}`);
      continue;
    }
    if (!dryRun) await client.createMapping(m);
    console.log(`+ mapping ${m.stream}.${m.field} <- ${m.expr}${m.guard_expr ? ` if ${m.guard_expr}` : ""}`);
  }
  if (!dryRun) {
    const res = await client.publishSchema(`seed-${SEED}-${Date.now()}`, "Red Panda demo seed: CRM, orders and Roam pre-order fields");
    console.log("published:", JSON.stringify(res.data ?? res).slice(0, 300));
  }
}

async function topics() {
  const records = PAGES.map((page) => ({
    url: `${DOMAIN}${page.path}`,
    ...Object.fromEntries(Object.entries(page.topics).map(([topic, relevance]) => [`topic_${topic}`, relevance])),
  }));
  await client.collect("lytics_content_enrich", records, { dryRun });
  console.log(`${dryRun ? "(dry run) " : ""}sent topics for ${records.length} URLs`);
}

async function pinRun(state) {
  let alreadySeeded = false;
  if (!state.now) {
    try {
      alreadySeeded = Boolean((await client.getEntityByEmail(samEmail())).data?.seed_batch);
    } catch (error) {
      if (!error.message.includes("404")) throw error;
    }
  }
  Object.assign(state, decidePin({ state, requestedNow: option("now"), alreadySeeded, repin, seed: SEED, size }));
  return new Date(state.now);
}

// Streams are sent in identity order: CRM (email + _uid) first, then orders,
// then web events keyed only by _uid.
function recordsFor(stream, profiles, now) {
  if (stream === "rp_crm") return profiles.map(crmRecord);
  if (stream === "rp_orders") return profiles.flatMap(orderRecords);
  return profiles.flatMap((p) => webEvents(p, { rng: createRng(Number(p.n)), now }));
}

async function sendBatch(state, stream, batchIndex, records) {
  let sent = 0;
  let skipped = 0;
  for (let c = 0; c * CHUNK < records.length; c++) {
    const chunk = records.slice(c * CHUNK, (c + 1) * CHUNK);
    const id = batchId(stream, `${batchIndex}.${c}`);
    const hash = contentHash(chunk);
    const status = batchStatus(state, id, hash);
    if (status === "skip") {
      skipped += chunk.length;
      continue;
    }
    if (status === "conflict" && !resend) {
      throw new Error(`Batch ${id} was already sent with different content (generator changed?). Re-sending adds events on top of the old ones; pass --resend only if that is intended.`);
    }
    await client.collect(stream, chunk, { timestampField: stream === "rp_crm" ? undefined : "ts", dryRun, chunkSize: CHUNK });
    if (!dryRun) {
      markSent(state, id, { hash, count: chunk.length });
      saveState(STATE_PATH, state);
    }
    sent += chunk.length;
  }
  return { sent, skipped };
}

async function send({ batches, includeSam }) {
  const state = loadState(STATE_PATH);
  const now = await pinRun(state);
  if (!dryRun) saveState(STATE_PATH, state);
  const people = generatePopulation({ seed: state.seed, size: state.size, now });
  const totals = {};
  for (const stream of ["rp_crm", "rp_orders", "default"]) {
    totals[stream] = { sent: 0, skipped: 0 };
    if (includeSam) {
      const sam = samRecords(now);
      const records = stream === "rp_crm" ? [sam.crm] : stream === "rp_orders" ? sam.orders : sam.web;
      const r = await sendBatch(state, stream, "sam", records);
      totals[stream].sent += r.sent;
      totals[stream].skipped += r.skipped;
    }
    for (const b of batches) {
      const profiles = people.slice(b * PROFILES_PER_BATCH, (b + 1) * PROFILES_PER_BATCH);
      if (!profiles.length) continue;
      const r = await sendBatch(state, stream, b, recordsFor(stream, profiles, now));
      totals[stream].sent += r.sent;
      totals[stream].skipped += r.skipped;
      if (b % 25 === 0) console.log(`  ${stream} batch ${b}: ${JSON.stringify(totals[stream])}`);
    }
  }
  console.log(`${dryRun ? "(dry run) " : ""}now=${now.toISOString()}`, JSON.stringify(totals));
}

function status() {
  const state = loadState(STATE_PATH);
  const byStream = {};
  for (const [key, info] of Object.entries(state.sent)) {
    const stream = key.split(":")[0];
    byStream[stream] = (byStream[stream] ?? 0) + (info.count ?? 0);
  }
  console.log(JSON.stringify({ now: state.now, seed: state.seed, size: state.size, sentRecords: byStream }, null, 2));
}

const commutingThreshold = Number(option("commuting", 0.2));

async function sizes() {
  const slugs = [...audienceDefs({ commutingThreshold }), ...FUNNEL_CHECKS].map((d) => d.slug_name);
  const existing = (await client.getSegments()).data;
  for (const slug of slugs) {
    const seg = existing.find((s) => s.slug_name === slug);
    if (!seg) {
      console.log(`${slug}: (missing)`);
      continue;
    }
    // Scan totals are live; /sizes only updates on Lytics' size schedule.
    try {
      const res = await client.request("GET", `/api/segment/${seg.id}/scan`, undefined, { limit: 1 });
      console.log(`${slug}: ${res.total}`);
    } catch (error) {
      // A just-created or just-updated audience answers 404 while it rebuilds.
      console.log(`${slug}: (rebuilding — ${error.message.includes("404") ? "not scannable yet" : error.message.slice(0, 80)})`);
    }
  }
}

async function sam() {
  const d = (await client.getEntityByEmail(samEmail())).data ?? {};
  const keys = ["_uids", "home_area", "home_distance_km", "products_owned", "accessories_owned", "club_membership", "loyalty_id", "volt_review_rating", "battery_service_tickets", "last_test_ride", "_num_events", "_created", "score_momentum", "score_frequency", "score_intensity", "score_recency", "score_propensity", "lytics_content", "segments"];
  console.log(JSON.stringify(Object.fromEntries(keys.map((k) => [k, d[k]])), null, 2));
}

async function model() {
  const segs = (await client.getSegments()).data;
  const bySlug = (slug) => segs.find((s) => s.slug_name === slug)?.id;
  const existing = (await client.request("GET", "/v2/ml")).data ?? [];
  for (const def of MODELS) {
    if (existing.some((m) => m.name === def.name)) {
      console.log(`✓ model "${def.name}" exists`);
      continue;
    }
    const source = bySlug(def.source);
    const target = bySlug(def.target);
    if (!source || !target) throw new Error(`Run the audiences step first (${def.source} / ${def.target})`);
    const body = { name: def.name, description: def.description, source, target, config: { use_scores: true, use_content: true, auto_tune: false, collect: 10000 } };
    if (dryRun) {
      console.log("(dry run)", JSON.stringify(body));
      continue;
    }
    const res = await client.request("POST", "/v2/ml", body);
    console.log(`+ model "${def.name}": ${res.data?.state}`);
  }
}

async function models() {
  for (const m of (await client.request("GET", "/v2/ml")).data ?? []) {
    let summary = {};
    if (m.state === "complete") summary = (await client.request("GET", `/v2/ml/${m.id}/summary`)).data?.summary ?? {};
    const { model_health, rsq, auc, error_matrix } = summary;
    console.log(JSON.stringify({ id: m.id, name: m.name, state: m.state, type: m.type, error: m.error, model_health, rsq, auc, samples: error_matrix && Object.values(error_matrix).reduce((a, b) => a + b, 0) }));
  }
}

// Lytics computes content affinities when a profile receives an event, using
// the topics known at that moment. Topics seeded after the history arrived
// only apply once each profile is touched again, so re-send the (unchanged)
// CRM record: it triggers the recompute without adding behavioral events.
async function refresh() {
  const state = loadState(STATE_PATH);
  if (!state.now) throw new Error("Nothing loaded yet");
  const people = generatePopulation({ seed: state.seed, size: state.size, now: new Date(state.now) });
  const records = [samRecords(new Date(state.now)).crm, ...people.map(crmRecord)];
  await client.collect("rp_crm", records, { dryRun, chunkSize: CHUNK });
  console.log(`${dryRun ? "(dry run) " : ""}re-sent ${records.length} CRM records to trigger affinity recompute`);
}

const steps = {
  schema,
  topics,
  // Batch 0 (profiles 00001–00100) plus Sam: the gate before the full load.
  spike: () => send({ batches: [0], includeSam: true }),
  load: () => send({ batches: Array.from({ length: Math.ceil(size / PROFILES_PER_BATCH) }, (_, i) => i), includeSam: true }),
  status,
  refresh,
  audiences: () => upsertSegments({ client, defs: [...audienceDefs({ commutingThreshold }), ...FUNNEL_CHECKS], created: createdFromArgs(args), dryRun }),
  sizes,
  sam,
  model,
  models,
};

if (!steps[step]) {
  console.error(`Unknown step "${step}". Steps: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}
try {
  if (step === "load") samEmail(); // validate DEMO_PERSONA_EMAIL before sending anything
  await steps[step]();
} catch (error) {
  if (error instanceof KitError) {
    console.error(error.message + (error.hint ? `\n${error.hint}` : ""));
    process.exit(error.code);
  }
  throw error;
}
