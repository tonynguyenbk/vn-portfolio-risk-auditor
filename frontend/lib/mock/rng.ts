/**
 * Deterministic pseudo-random number generation.
 *
 * PRD 8.6 requires the demonstration dataset to be reproducible from seed 42.
 * `Math.random` cannot provide that, so the demo series is driven by an
 * explicit generator instead. Identical seed in, identical dashboard out.
 */

/** mulberry32 - small, fast, adequate for generating demonstration series. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform: two uniforms in, one standard normal out.
 * The second variate is discarded, which costs a little speed and buys
 * simpler, order-independent call sites.
 */
export function normalFrom(rand: () => number): number {
  let u = 0;
  let v = 0;
  // Guard against log(0).
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
