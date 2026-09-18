import {activeChainId} from "@/lib/chain";
import {deploymentFor} from "@/lib/contracts/addresses";
import {ponsDripAbi} from "@/lib/contracts/PonsDrip";
import {readClient} from "@/lib/locks/client";
import {allocationsFor, type AllocationSet} from "./allocations";
import {holdersOf} from "./holders";
import type {Address} from "@/lib/locks/types";

/**
 * Rebuilding the exact tree a root was published from.
 *
 * The root on chain is a commitment to a set of numbers, and the only way a holder gets a
 * usable proof is if this machine can reproduce those numbers exactly. So every input has to
 * come from somewhere both sides can read: the token, the snapshot block, the threshold and
 * the schedule are all on chain, and the balances come from the indexer at that block.
 *
 * Nothing here reads a clock. The cumulative figure a tree commits to is the amount released
 * as of the snapshot's own moment, not as of now, or the proof a holder fetches would be for a
 * tree that is one second newer than the root it has to verify against.
 *
 * Server-side only: it calls the explorer, which no browser should be doing on a holder's
 * behalf and whose CORS headers are malformed anyway.
 */

export interface DripOnChain {
  creator: Address;
  token: Address;
  reserve: bigint;
  claimed: bigint;
  merkleRoot: `0x${string}`;
  snapshotBlock: bigint;
  minimumHolding: bigint;
  startsAt: bigint;
  stoppedAt: bigint;
  stoppedRelease: bigint;
  createdAt: bigint;
  rateBps: number;
  intervalSeconds: number;
  maxRounds: number;
  publisher: Address;
  revocable: boolean;
}

export function dripAddress(): Address {
  const deployment = deploymentFor(activeChainId);
  if (!deployment?.PonsDrip) {
    throw new Error(`PonsDrip is not deployed on chain ${activeChainId}`);
  }
  return deployment.PonsDrip;
}

export async function readDrip(id: bigint): Promise<DripOnChain> {
  return (await readClient().readContract({
    address: dripAddress(),
    abi: ponsDripAbi,
    functionName: "getDrip",
    args: [id],
  })) as unknown as DripOnChain;
}

/** What the schedule had released at a given moment, asked of the contract rather than guessed. */
export async function releasedAt(id: bigint, timestamp: bigint): Promise<bigint> {
  return (await readClient().readContract({
    address: dripAddress(),
    abi: ponsDripAbi,
    functionName: "releasedAt",
    args: [id, timestamp],
  })) as bigint;
}

/**
 * The tree for a drip as of a block.
 *
 * A tree of shares, so it is a pure function of the balances at that block: no window walk, no
 * release figure, nothing that depends on when it is rebuilt. Two machines asked for the same
 * block produce the same root, which is what lets a proof served now verify against a root
 * published an hour ago.
 */
export async function treeFor(
  id: bigint,
  drip: DripOnChain,
  atBlock: bigint,
): Promise<AllocationSet & {snapshotBlock: bigint; released: bigint}> {
  const {balances} = await holdersOf(drip.token, Number(atBlock));
  const released = await releasedAt(id, BigInt(Math.max(Number(drip.startsAt), 0)));
  return {
    ...allocationsFor(balances, released, drip.minimumHolding),
    snapshotBlock: atBlock,
    released,
  };
}

/** The tree a published root corresponds to: the drip's own recorded snapshot block. */
export async function publishedTree(id: bigint) {
  const drip = await readDrip(id);
  return {drip, tree: await treeFor(id, drip, drip.snapshotBlock)};
}
