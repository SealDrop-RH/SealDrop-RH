/**
 * Deterministic, short, URL-safe lock ids.
 *
 * Deterministic because the same lock has to produce the same id on the server and in the
 * browser: fixtures are generated in both places and a proof page is server-rendered from
 * one. A random id would mean the server and the client disagreed about what to fetch.
 */

/** FNV-1a, 32 bit. Small, fast, and stable across every runtime this code touches. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Crockford base32 without I, L, O and U, so an id read aloud is unambiguous. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function base32(value: number, length: number): string {
  let out = "";
  let remaining = value;
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

/**
 * Two independent hashes give 40 bits, which is far more than the collision headroom a
 * fixture set or one browser's local history needs. test/fixtures.test.ts asserts the
 * shipped set has none.
 */
export function lockId(seed: string): string {
  const a = fnv1a32(seed);
  const b = fnv1a32(`${seed}:pons-lock`);
  return `pl_${base32(a, 4)}${base32(b, 4)}`;
}
