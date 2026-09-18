import type {Airdrop} from "./types";

/**
 * Airdrops created in this browser, and what this browser has claimed.
 *
 * Not a "use client" module: the mock adapter runs on both sides, so a server component
 * importing it must be able to call these. They guard on `window` and no-op server-side,
 * which is the honest answer since the server genuinely has no localStorage.
 *
 * Replaced by chain state in part 2.
 */

const AIRDROPS_KEY = "pons-lock-local-airdrops";
const CLAIMS_KEY = "pons-lock-local-claims";

interface StoredAirdrop
  extends Omit<
    Airdrop,
    "reserve" | "pool" | "claimed" | "minimumHolding" | "eligibleSupply" | "token" | "withdrawn"
  > {
  reserve?: string;
  withdrawn?: string;
  pool: string;
  claimed: string;
  minimumHolding: string;
  eligibleSupply: string;
  token: Omit<Airdrop["token"], "totalSupply"> & {totalSupply: string};
}

function serialise(airdrop: Airdrop): StoredAirdrop {
  return {
    ...airdrop,
    reserve: airdrop.reserve.toString(),
    withdrawn: airdrop.withdrawn?.toString(),
    pool: airdrop.pool.toString(),
    claimed: airdrop.claimed.toString(),
    minimumHolding: airdrop.minimumHolding.toString(),
    eligibleSupply: airdrop.eligibleSupply.toString(),
    token: {...airdrop.token, totalSupply: airdrop.token.totalSupply.toString()},
  };
}

/**
 * The fallbacks are for records this browser wrote before airdrops could pay out in rounds.
 * Those have a pool and no reserve, which is exactly a one-off, so they read back as one
 * rather than as a broken row the list has to skip.
 */
function deserialise(stored: StoredAirdrop): Airdrop {
  return {
    ...stored,
    kind: stored.kind ?? "one-off",
    schedule: stored.kind === "recurring" ? stored.schedule : undefined,
    reserve: BigInt(stored.reserve ?? stored.pool),
    withdrawn: stored.withdrawn === undefined ? undefined : BigInt(stored.withdrawn),
    pool: BigInt(stored.pool),
    claimed: BigInt(stored.claimed),
    minimumHolding: BigInt(stored.minimumHolding),
    eligibleSupply: BigInt(stored.eligibleSupply),
    token: {...stored.token, totalSupply: BigInt(stored.token.totalSupply)},
  };
}

let airdropCache: Airdrop[] | null = null;
const EMPTY: Airdrop[] = [];

export function readLocalAirdrops(): Airdrop[] {
  if (typeof window === "undefined") return EMPTY;
  if (airdropCache) return airdropCache;
  try {
    const raw = window.localStorage.getItem(AIRDROPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return EMPTY;
    const out: Airdrop[] = [];
    for (const entry of parsed) {
      // One unreadable record must not take out the rest of the list.
      try {
        out.push(deserialise(entry as StoredAirdrop));
      } catch {
        // Skip it.
      }
    }
    airdropCache = out;
    return out;
  } catch {
    return EMPTY;
  }
}

export function saveLocalAirdrop(airdrop: Airdrop): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readLocalAirdrops().filter((entry) => entry.id !== airdrop.id);
    const next = [airdrop, ...existing];
    window.localStorage.setItem(AIRDROPS_KEY, JSON.stringify(next.map(serialise)));
    airdropCache = null;
    window.dispatchEvent(new CustomEvent("pons-lock:airdrop-change"));
  } catch {
    // Losing a simulated airdrop to a full store is not worth an error state.
  }
}

/* ---- claims ---- */

type ClaimMap = Record<string, string>;

function claimKey(airdropId: string, holder: string): string {
  return `${airdropId}:${holder.toLowerCase()}`;
}

function readClaims(): ClaimMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CLAIMS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as ClaimMap) : {};
  } catch {
    return {};
  }
}

export function readClaimed(airdropId: string, holder: string): bigint {
  const value = readClaims()[claimKey(airdropId, holder)];
  try {
    return value ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

export function saveClaimed(airdropId: string, holder: string, amount: bigint): void {
  if (typeof window === "undefined") return;
  try {
    const claims = readClaims();
    claims[claimKey(airdropId, holder)] = amount.toString();
    window.localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
    window.dispatchEvent(new CustomEvent("pons-lock:airdrop-change"));
  } catch {
    // Nothing to do.
  }
}

export function subscribeAirdrops(onChange: () => void): () => void {
  const handler = () => {
    airdropCache = null;
    onChange();
  };
  window.addEventListener("pons-lock:airdrop-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("pons-lock:airdrop-change", handler);
    window.removeEventListener("storage", handler);
  };
}
