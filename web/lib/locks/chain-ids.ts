/**
 * Lock and airdrop ids on chain are array indices. The app carries them as prefixed strings.
 *
 * The prefix is not decoration: an id appears in a share URL, and "/proof/0" invites the
 * reader to try "/proof/1" while telling them nothing about what they are looking at.
 * "pl_0" also keeps the shape consistent with the ids the mock adapter produced, so nothing
 * downstream has to care which adapter answered.
 */

export const LOCK_PREFIX = "pl_";
export const AIRDROP_PREFIX = "ad_";

export function toLockId(index: bigint | number): string {
  return `${LOCK_PREFIX}${index.toString()}`;
}

export function toAirdropId(index: bigint | number): string {
  return `${AIRDROP_PREFIX}${index.toString()}`;
}

/**
 * Back to an index, or null when the id is not one this chain could have produced.
 *
 * The mock's ids are base32 (`pl_7k2m9q`), so an app pointed at the chain while holding a
 * link made against fixtures must return "no such lock" rather than parse "7k2m9q" into
 * something and read the wrong row.
 */
export function parseIndex(id: string, prefix: string): bigint | null {
  if (!id.startsWith(prefix)) return null;
  const digits = id.slice(prefix.length);
  if (!/^\d+$/.test(digits)) return null;
  try {
    return BigInt(digits);
  } catch {
    return null;
  }
}

export const parseLockIndex = (id: string) => parseIndex(id, LOCK_PREFIX);
export const parseAirdropIndex = (id: string) => parseIndex(id, AIRDROP_PREFIX);

/**
 * The contract index behind an app id, as a string, or null.
 *
 * Locks travel as "pl_0"; airdrops as a bare index or "ad_0". The contracts only know the
 * number, so anything that asks the chain about a record goes through this first. Passing the
 * app id straight through was how lock pages briefly looked up a record called "pl_0".
 */
export function recordIndex(kind: "lock" | "airdrop", id: string): string | null {
  if (/^\d+$/.test(id)) return id;
  const index = kind === "lock" ? parseLockIndex(id) : parseAirdropIndex(id);
  return index === null ? null : index.toString();
}
