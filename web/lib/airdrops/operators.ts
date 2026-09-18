import {isAddress} from "viem";
import {envText} from "@/lib/chain";
import type {Address} from "@/lib/locks/types";

/**
 * The wallets that keep control of the airdrops they create.
 *
 * Every other creator is bound by the rule the rest of this module is built around: once
 * claiming is open, the terms are fixed and the funded reserve belongs to its claimants.
 * These wallets are not. For an airdrop one of them created, it can still change the terms
 * after holders can act on them, and it can stop the schedule and take back whatever has not
 * been released yet.
 *
 * That is a real power over other people's expectations, so two things are deliberate here.
 *
 * It is scoped to their own airdrops. Being an operator is not a key to anybody else's
 * reserve: `canStop` checks the creator as well, so the worst one of these wallets can do is
 * to the thing it funded itself.
 *
 * And it is disclosed. Anything a holder reads about an airdrop whose creator is on this list
 * says so, on the page, next to the terms. An app that tells people the terms cannot move
 * while two wallets can move them is worse than one that never made the promise, and a holder
 * who can see the arrangement can decide what it is worth to them.
 */

/**
 * The built-in list.
 *
 * Kept in the repository rather than only in an environment variable so that reading the
 * source tells you who has this. A deployment can replace the list, but it cannot quietly
 * have one.
 */
const BUILT_IN: readonly string[] = [
  "0x1682C0b0f1f26b4a43E107f53E35275eF0cd967B",
  "0x7f8c5556874C98257eE950853AB2584352d2A5e1",
  "0x9ED9e0197c48E77C91ff8521b736812DaED8C839",
];

/**
 * NEXT_PUBLIC_AIRDROP_OPERATORS replaces the built-in list when it is set: a comma-separated
 * list of addresses, or the single word "none" to run with no operators at all.
 *
 * A literal member access, for the reason spelled out in lib/chain.ts: a dynamic index
 * defeats Next's build-time inlining and the browser would read undefined.
 */
function configured(): readonly string[] | null {
  const raw = envText(process.env.NEXT_PUBLIC_AIRDROP_OPERATORS);
  if (!raw) return null;
  if (raw.toLowerCase() === "none") return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** Lower-cased, so every comparison in this file is between the same shape of string. */
const OPERATORS: ReadonlySet<string> = new Set(
  (configured() ?? BUILT_IN)
    // A typo in an environment variable must not silently become an operator, and must not
    // take the rest of the list down with it either.
    .filter((entry) => isAddress(entry))
    .map((entry) => entry.toLowerCase()),
);

/** Every operator wallet, checksummed as written. For showing a list, never for comparing. */
export function operatorWallets(): Address[] {
  const source = configured() ?? BUILT_IN;
  return source.filter((entry) => isAddress(entry)) as Address[];
}

export function isOperator(address: string | undefined | null): boolean {
  return Boolean(address) && OPERATORS.has(String(address).toLowerCase());
}

/** Whether this airdrop is one an operator retains control of. Drives what holders are told. */
export function isOperatorControlled(airdrop: {creator: string}): boolean {
  return isOperator(airdrop.creator);
}

/**
 * Whether `viewer` may stop this airdrop and take back what has not been released.
 *
 * Both conditions, never one: an operator has this power over what it funded itself and over
 * nothing else.
 */
export function canStop(
  airdrop: {creator: string; stoppedAt?: number},
  viewer: string | undefined,
): {allowed: boolean; reason?: string} {
  if (!viewer || viewer.toLowerCase() !== airdrop.creator.toLowerCase()) {
    return {allowed: false, reason: "Only the wallet that created this airdrop can stop it."};
  }
  if (!isOperator(viewer)) {
    return {
      allowed: false,
      reason: "A funded airdrop belongs to the holders it was funded for. It cannot be called back.",
    };
  }
  if (airdrop.stoppedAt !== undefined) {
    return {allowed: false, reason: "This airdrop has already been stopped."};
  }
  return {allowed: true};
}
