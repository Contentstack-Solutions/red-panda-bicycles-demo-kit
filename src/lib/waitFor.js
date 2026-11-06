const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls `predicate(elapsedMs)` until it returns true (resolves true) or
// `timeoutMs` passes (resolves false). Checks once before the first sleep.
export async function waitFor(predicate, { timeoutMs, intervalMs = 250, now = Date.now, sleep = realSleep }) {
  const start = now();
  for (;;) {
    const elapsed = now() - start;
    if (await predicate(elapsed)) return true;
    if (elapsed >= timeoutMs) return false;
    await sleep(intervalMs);
  }
}
