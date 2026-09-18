import {buildTree, proofFor, rootOf, type Allocation} from "./merkle";
import type {Address} from "@/lib/locks/types";

/**
 * Turning a set of balances into what each holder is owed, and into a root.
 *
 * Deterministic, and that is the whole requirement. The cron publishes a root; a holder later
 * asks this app for their proof; the two are computed on different machines minutes apart and
 * have to produce byte-identical trees or the proof fails against the root. So there is no
 * clock in here, no iteration order that depends on a Map, and no floating point: the inputs
 * are a balance map, a released figure and a threshold, and the same three always give the
 * same tree.
 *
 * Amounts are *cumulative*, matching what PonsDrip verifies: a leaf says what an account is
 * owed in total to date, and `claim` pays the difference against what it already took. That is
 * what lets the root be republished as balances move without ever paying anyone twice.
 */

export interface AllocationSet {
  allocations: Allocation[];
  root: `0x${string}`;
  eligibleSupply: bigint;
  eligibleHolders: number;
  /** What integer division could not split. It stays in the contract. */
  dust: bigint;
}

/** PonsDrip.SHARE_SCALE: a share is a fraction of the qualifying supply scaled by this. */
export const SHARE_SCALE = 10n ** 18n;

/**
 * Each qualifying balance's share of the qualifying supply.
 *
 * `balance * SHARE_SCALE / eligibleSupply`, multiplied before dividing so a small holder is not
 * floored to nothing. `released` is accepted but not used in the arithmetic, and that is the
 * whole point of the share model: the tree describes a rule rather than one instant, so the
 * contract can evaluate it against its own clock for ever without anyone republishing.
 */
export function allocationsFor(
  balances: Map<string, bigint>,
  released: bigint,
  minimumHolding: bigint,
): AllocationSet {
  const qualifying = [...balances.entries()]
    .filter(([, balance]) => balance > 0n && balance >= minimumHolding)
    // Sorted by address, because a Map iterates in insertion order and the explorer does not
    // promise one. Unsorted, the same balances would build a different tree on every run.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const eligibleSupply = qualifying.reduce((sum, [, balance]) => sum + balance, 0n);
  if (eligibleSupply === 0n) {
    return {
      allocations: [],
      root: EMPTY_ROOT,
      eligibleSupply,
      eligibleHolders: qualifying.length,
      dust: released,
    };
  }

  let handed = 0n;
  const allocations: Allocation[] = [];
  for (const [account, balance] of qualifying) {
    const share = (balance * SHARE_SCALE) / eligibleSupply;
    if (share <= 0n) continue;
    handed += share;
    allocations.push({account: account as Address, amount: share.toString()});
  }

  if (allocations.length === 0) {
    return {allocations, root: EMPTY_ROOT, eligibleSupply, eligibleHolders: qualifying.length, dust: released};
  }

  return {
    allocations,
    root: rootOf(allocations),
    eligibleSupply,
    eligibleHolders: qualifying.length,
    // What integer division left unassigned, as a share. It stays in the contract.
    dust: SHARE_SCALE - handed,
  };
}

/**
 * What one holder is sent by a keeper payout.
 *
 * Their share of `room` -- released and not yet paid to anyone -- never more than they are owed.
 * Not simply what they are owed: that is a share of everything ever released less what they
 * took, and once a paid holder sells and leaves the tree, the holders who remain are owed more
 * in total than is left, for good. Paying in full would hand the round to whoever is first in
 * the batch.
 *
 * `settling` is for a drip that will release nothing more: everyone is sent what they are owed
 * and the contract caps the batch at what is left, so the end does not dribble out for ever.
 *
 * Shared by the keeper, which sends it, and the allocation panel, which shows it, so the figure
 * on the page is the figure that arrives.
 */
export function payoutFor({
  released,
  room,
  share,
  taken,
  settling,
}: {
  released: bigint;
  room: bigint;
  share: bigint;
  taken: bigint;
  settling: boolean;
}): bigint {
  const entitled = (released * share) / SHARE_SCALE;
  const owed = entitled > taken ? entitled - taken : 0n;
  const capped = owed < room ? owed : room;
  if (settling) return capped;
  const portion = (room * share) / SHARE_SCALE;
  return owed < portion ? owed : portion;
}

/**
 * A stand-in root for a snapshot with nobody in it.
 *
 * PonsDrip refuses a zero root, and rightly: a zero root would be a tree nobody can prove
 * against, published by accident. This is a root with no valid leaf under it, which is the
 * same thing said on purpose.
 */
export const EMPTY_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

/** One account's leaf and proof, or null when it is not in this tree. */
export function claimFor(
  allocations: Allocation[],
  account: Address,
): {amount: string; proof: `0x${string}`[]} | null {
  const wanted = account.toLowerCase();
  const entry = allocations.find((a) => a.account.toLowerCase() === wanted);
  if (!entry) return null;

  const proof = proofFor(allocations, entry.account);
  return proof ? {amount: entry.amount, proof} : null;
}

export {buildTree};
export type {Allocation};
