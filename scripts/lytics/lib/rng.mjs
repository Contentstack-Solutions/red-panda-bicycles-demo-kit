// Deterministic PRNG (mulberry32) so the same seed always generates the same
// synthetic population and history.
export function createRng(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const chance = (p) => next() < p;
  const pick = (items) => items[Math.floor(next() * items.length)];
  function weighted(pairs) {
    const total = pairs.reduce((sum, [, w]) => sum + w, 0);
    let roll = next() * total;
    for (const [item, w] of pairs) {
      roll -= w;
      if (roll < 0) return item;
    }
    return pairs[pairs.length - 1][0];
  }
  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  return { next, int, chance, pick, weighted, shuffle };
}
