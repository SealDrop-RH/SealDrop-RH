/**
 * Seeded randomness.
 *
 * Two things in this app must be byte-identical on the server and in every browser: the
 * fixture set, and the particle field a lock draws. Math.random cannot do either. mulberry32
 * is 32-bit integer arithmetic throughout, so it produces the same sequence everywhere,
 * forever, and a lock drawn today looks the same when the link is opened next year.
 */

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The usual entry point: a string seed straight to a generator. */
export function seeded(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}

/** Uniform float in [min, max). */
export function range(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Uniform integer in [min, max]. */
export function rangeInt(random: () => number, min: number, max: number): number {
  return Math.floor(range(random, min, max + 1));
}
