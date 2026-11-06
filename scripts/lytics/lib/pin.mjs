import { KitError } from "../../kit/lib/env.mjs";

// Decides the run's pinned `now`/seed/size. Every event timestamp derives from
// `now`, so a second pin against an already-seeded account would load a second,
// shifted copy of the whole history and inflate behavioral scores.
export function decidePin({ state, requestedNow, alreadySeeded, repin, seed, size }) {
  if (state.now) {
    if (requestedNow && requestedNow !== state.now) {
      throw new Error(`Run is pinned to now=${state.now}. A different --now would duplicate the history; it cannot be overridden.`);
    }
    return { now: state.now, seed: state.seed, size: state.size };
  }
  if (alreadySeeded && !repin) {
    // Exit 3: needs a person's decision; kit:lytics detects this code on `load`.
    throw new KitError(
      "The Lytics account already has seeded profiles but the local state file is empty. " +
        "Loading again would add a second history. Restore scripts/lytics/.state/seed-state.json, " +
        "or pass --repin if you really want a second load.",
      { code: 3 }
    );
  }
  return { now: requestedNow ?? new Date().toISOString(), seed, size };
}
