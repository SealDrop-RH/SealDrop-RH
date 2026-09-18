import {lockedShare} from "@/lib/format";
import type {Lock, LockState} from "./types";

/**
 * State is derived from time, never stored.
 *
 * A lock whose state is a column goes stale the moment its unlock date passes, and then
 * every reader has to know whether the row was written before or after that moment. The
 * only field that genuinely records an event is withdrawnAt.
 */
export function deriveState(lock: {unlockAt: number; withdrawnAt?: number}, nowSeconds: number): LockState {
  if (lock.withdrawnAt !== undefined) return "withdrawn";
  return nowSeconds >= lock.unlockAt ? "unlockable" : "active";
}

export function shareOf(lock: Lock): number {
  return lockedShare(lock.amount, lock.token.totalSupply);
}

/** How much of one particle's worth of supply a tick represents, for the strip legend. */
export function unitValue(totalSupply: bigint, decimals: number, count: number): bigint {
  if (count <= 0) return 0n;
  return totalSupply / BigInt(count) / 10n ** BigInt(decimals);
}

export const LOCK_STATE_LABEL: Record<LockState, string> = {
  pending: "Pending",
  active: "Locked",
  unlockable: "Unlockable",
  withdrawn: "Withdrawn",
};
