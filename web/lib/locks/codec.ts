import type {Lock, TokenMeta} from "./types";

/**
 * bigint at a wire boundary.
 *
 * `JSON.stringify(1n)` throws outright, and it will be reached from localStorage, from
 * searchParams, and from any fetch. Rather than discovering that one call site at a time,
 * every crossing goes through here: bigints become decimal strings, and come back as
 * bigints. Decimal strings, not hex or Number, because a token amount at 18 decimals
 * exceeds Number.MAX_SAFE_INTEGER long before it is interesting.
 */

export interface SerialisedTokenMeta extends Omit<TokenMeta, "totalSupply"> {
  totalSupply: string;
}

export interface SerialisedLock extends Omit<Lock, "amount" | "token"> {
  amount: string;
  token: SerialisedTokenMeta;
}

export function serialiseToken(token: TokenMeta): SerialisedTokenMeta {
  return {...token, totalSupply: token.totalSupply.toString()};
}

export function deserialiseToken(token: SerialisedTokenMeta): TokenMeta {
  return {...token, totalSupply: BigInt(token.totalSupply)};
}

export function serialiseLock(lock: Lock): SerialisedLock {
  return {...lock, amount: lock.amount.toString(), token: serialiseToken(lock.token)};
}

export function deserialiseLock(lock: SerialisedLock): Lock {
  return {...lock, amount: BigInt(lock.amount), token: deserialiseToken(lock.token)};
}

/**
 * Parses a stored array, discarding anything malformed rather than throwing.
 *
 * Whatever is in localStorage was written by an older version of this code, by another tab,
 * or by hand. One unreadable record must not take out the whole list, so bad entries are
 * dropped individually.
 */
export function deserialiseLocks(raw: string | null): Lock[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Lock[] = [];
  for (const entry of parsed) {
    try {
      out.push(deserialiseLock(entry as SerialisedLock));
    } catch {
      // One corrupt record is not a reason to lose the rest.
    }
  }
  return out;
}

export function serialiseLocks(locks: Lock[]): string {
  return JSON.stringify(locks.map(serialiseLock));
}
