import {isOperator} from "./operators";
import {dripFinished, releasedBy} from "./schedule";
import type {Airdrop, Allocation, AirdropState, AirdropSchedule} from "./types";

/**
 * Working out what a wallet gets.
 *
 * All of it in bigint. A token supply at 18 decimals passes Number.MAX_SAFE_INTEGER long
 * before it is interesting, so doing the division in floating point would quietly lose the
 * bottom of every figure, and these figures are what someone is owed.
 */

/**
 * Where an airdrop is in its life.
 *
 * "finished" means nothing more will ever come out of it, which for a recurring airdrop is a
 * stricter question than "is the pool empty". A drip whose current round has been claimed to
 * the last unit is not finished, it is between rounds, and calling it finished would retire a
 * live airdrop from the list every ten minutes and bring it back again.
 */
export function deriveAirdropState(
  airdrop: {startsAt: number; reserve: bigint; claimed: bigint; schedule?: AirdropSchedule},
  nowSeconds: number,
): AirdropState {
  const released = releasedBy(airdrop, nowSeconds);
  const emptied = released > 0n && airdrop.claimed >= released;

  if (airdrop.schedule) {
    if (emptied && dripFinished(airdrop, nowSeconds)) return "finished";
    return nowSeconds >= airdrop.startsAt ? "live" : "scheduled";
  }

  if (emptied) return "finished";
  return nowSeconds >= airdrop.startsAt ? "live" : "scheduled";
}

/**
 * An airdrop as of a moment.
 *
 * The one place `pool` and `state` are filled in, so that a recurring airdrop's claimable
 * figure is always the one its schedule has actually reached rather than whatever was true
 * when the record was written. Every adapter read goes through this; nothing else sets `pool`.
 */
export function atTime<T extends Airdrop>(airdrop: T, nowSeconds: number): T {
  return {
    ...airdrop,
    pool: releasedBy(airdrop, nowSeconds),
    state: deriveAirdropState(airdrop, nowSeconds),
  };
}

/** How much of the reserve the schedule has let out. 0 to 1. One-offs are always 1. */
export function releasedShare(airdrop: Pick<Airdrop, "pool" | "reserve">): number {
  if (airdrop.reserve <= 0n) return 0;
  return Math.min(1, Number((airdrop.pool * 1_000_000n) / airdrop.reserve) / 1_000_000);
}

/**
 * One wallet's cut.
 *
 * `pool * balance / eligibleSupply`, multiplied before dividing so the result keeps every
 * unit it is entitled to. Dividing first would floor the ratio to zero for any holder
 * smaller than the pool divisor, which is most of them.
 */
export function allocate(
  airdrop: Pick<Airdrop, "pool" | "minimumHolding" | "eligibleSupply">,
  balance: bigint,
  alreadyClaimed: bigint = 0n,
): Allocation {
  if (balance <= 0n) {
    return {qualifies: false, balance, share: 0, amount: 0n, claimed: alreadyClaimed, claimable: 0n, reason: "no-balance"};
  }

  if (balance < airdrop.minimumHolding) {
    return {
      qualifies: false,
      balance,
      share: 0,
      amount: 0n,
      claimed: alreadyClaimed,
      claimable: 0n,
      reason: "below-minimum",
    };
  }

  if (airdrop.eligibleSupply <= 0n) {
    return {qualifies: true, balance, share: 0, amount: 0n, claimed: alreadyClaimed, claimable: 0n};
  }

  // Multiply first, then divide. The other order floors to zero for every holder whose
  // balance is smaller than eligibleSupply / pool.
  const amount = (airdrop.pool * balance) / airdrop.eligibleSupply;
  const claimable = amount > alreadyClaimed ? amount - alreadyClaimed : 0n;

  // Scaled through bigint before touching Number, for the same precision reason.
  const share = Number((balance * 1_000_000n) / airdrop.eligibleSupply) / 1_000_000;

  return {
    qualifies: true,
    balance,
    share: Math.min(1, share),
    amount,
    claimed: alreadyClaimed,
    claimable,
  };
}

/** How much of the pool is spoken for. 0 to 1. */
export function claimedShare(airdrop: Pick<Airdrop, "pool" | "claimed">): number {
  if (airdrop.pool <= 0n) return 0;
  return Math.min(1, Number((airdrop.claimed * 1_000_000n) / airdrop.pool) / 1_000_000);
}

/**
 * Whether the creator can still change this, and why not if they cannot.
 *
 * Adjustable only while claiming has not opened. Once a holder can act on the terms, moving
 * them is a rug in slow motion: someone decides to hold because the threshold is X, and the
 * creator raises it afterwards. Before claiming opens nobody has relied on anything yet.
 */
export function adjustability(
  airdrop: Pick<Airdrop, "startsAt" | "creator"> & Partial<Pick<Airdrop, "createdAt">>,
  viewer: string | undefined,
  nowSeconds: number,
): {allowed: boolean; reason?: string} {
  if (!viewer || viewer.toLowerCase() !== airdrop.creator.toLowerCase()) {
    return {allowed: false, reason: "Only the wallet that created this airdrop can change it."};
  }
  // Operators are outside the freeze, which is the whole of what being one means here. The
  // page says so wherever this airdrop is described, so a holder is not relying on a rule
  // that does not apply. See lib/airdrops/operators.ts.
  if (isOperator(viewer)) return {allowed: true};
  if (nowSeconds >= airdrop.startsAt) {
    // An airdrop that was claimable from the moment it was signed never had an adjustable
    // window at all, which is a different sentence from "you have missed it" and reads as a
    // bug if you say the wrong one.
    const openFromTheStart =
      airdrop.createdAt !== undefined && airdrop.startsAt <= airdrop.createdAt;
    return {
      allowed: false,
      reason: openFromTheStart
        ? "Claiming was open the moment this was signed, so the terms were fixed from that moment too. Holders could act on them immediately."
        : "Claiming has opened, so the terms are fixed. Holders have already seen them.",
    };
  }
  return {allowed: true};
}

export const AIRDROP_STATE_LABEL: Record<AirdropState, string> = {
  scheduled: "Scheduled",
  live: "Claimable",
  finished: "Fully claimed",
};
