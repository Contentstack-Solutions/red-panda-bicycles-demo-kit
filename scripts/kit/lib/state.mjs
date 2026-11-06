import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { KitError } from "./env.mjs";

const DEFAULT_PATH = ".kit/state.json";

const emptyState = () => ({ version: 1, uidMap: {}, assets: {}, created: {}, phases: {} });

export function loadKitState(path = DEFAULT_PATH) {
  if (!existsSync(path)) return emptyState();
  return { ...emptyState(), ...JSON.parse(readFileSync(path, "utf8")) };
}

// Atomic: write a sibling temp file, then rename over the target.
export function saveKitState(state, path = DEFAULT_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
}

export function recordCreated(state, kind, key, value) {
  (state.created[kind] ??= {})[key] = value;
  return state;
}

// Ruling R25: a state that teardown has started on belongs to a torn-down setup. Setup phases
// refuse it, so a fresh setup never mixes with what teardown deleted.
export function assertNotTornDown(state, path = DEFAULT_PATH) {
  if (state?.tornDown && Object.keys(state.tornDown).length) {
    throw new KitError(`${path}: this state belongs to a torn-down setup; move it aside to start fresh.`, {
      code: 3,
      hint: `Finish it with npm run kit:teardown -- --yes (which archives it), or rename ${path} yourself. Nothing was changed.`,
    });
  }
  return state;
}

// Moves a finished teardown's state to <dir>/state.torn-down-<ISO time>.json; returns the new path.
export function archiveKitState(path = DEFAULT_PATH, now = new Date()) {
  const stamp = now.toISOString().replace(/:/g, "-");
  const target = join(dirname(path), `state.torn-down-${stamp}.json`);
  renameSync(path, target);
  return target;
}
