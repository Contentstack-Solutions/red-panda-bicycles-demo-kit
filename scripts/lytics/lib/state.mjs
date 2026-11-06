import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Records which batches have been sent, so a re-run after a partial failure
// never double-sends events (duplicates would inflate behavioral scores).
// Batches are keyed by position; the content hash is stored so a changed
// generator is caught as a conflict instead of being sent on top.
export function loadState(path) {
  if (!existsSync(path)) return { sent: {} };
  return migrateState(JSON.parse(readFileSync(path, "utf8")));
}

export function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

// Legacy keys were `${stream}:${index}:${hash}`.
export function migrateState(state) {
  const sent = {};
  for (const [key, info] of Object.entries(state.sent ?? {})) {
    const parts = key.split(":");
    if (parts.length === 3) sent[`${parts[0]}:${parts[1]}`] = { ...info, hash: parts[2] };
    else sent[key] = info;
  }
  return { ...state, sent };
}

export const batchId = (stream, index) => `${stream}:${index}`;

export function contentHash(records) {
  return createHash("sha1").update(JSON.stringify(records)).digest("hex").slice(0, 12);
}

export function batchStatus(state, id, hash) {
  const entry = state.sent[id];
  if (!entry) return "send";
  return entry.hash === hash ? "skip" : "conflict";
}

export function markSent(state, id, info = {}) {
  state.sent[id] = { at: new Date().toISOString(), ...info };
}
