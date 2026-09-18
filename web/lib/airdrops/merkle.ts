import {StandardMerkleTree} from "@openzeppelin/merkle-tree";
import type {Address} from "@/lib/locks/types";

/**
 * The allocation tree PonsAirdrop verifies against.
 *
 * Built with OpenZeppelin's StandardMerkleTree rather than by hand, because the contract
 * verifies with OpenZeppelin's MerkleProof and the two have to agree exactly on three
 * things: leaves are double-hashed `keccak256(keccak256(abi.encode(address, uint256)))`,
 * pairs are sorted before hashing, and odd nodes are promoted rather than paired with
 * themselves. Any one of those differing produces a root that looks fine and verifies
 * nothing.
 *
 * test/merkle.test.ts pins the leaf encoding against a fixture the Solidity side also
 * checks, so a version bump that changed the format would fail rather than silently
 * invalidate every proof.
 */

export interface Allocation {
  account: Address;
  /** The total this account may claim, as a decimal string. bigint does not survive JSON. */
  amount: string;
}

export interface AirdropSnapshot {
  token: Address;
  chainId: number;
  /** The L2 block balances were read at. Stored on chain so anyone can rebuild this. */
  snapshotBlock: number;
  /** Total set aside, as a decimal string. */
  pool: string;
  minimumHolding: string;
  /** Sum of the balances of every account that cleared the minimum. */
  eligibleSupply: string;
  root: `0x${string}`;
  allocations: Allocation[];
  /** Pool minus the sum of allocations: what integer division leaves behind. */
  dust: string;
}

/** The leaf types, in the order PonsAirdrop encodes them. */
const LEAF_TYPES = ["address", "uint256"] as const;

export function buildTree(allocations: Allocation[]) {
  if (allocations.length === 0) throw new Error("Cannot build a tree with no allocations");
  return StandardMerkleTree.of(
    allocations.map((a) => [a.account, a.amount]),
    [...LEAF_TYPES],
  );
}

export function rootOf(allocations: Allocation[]): `0x${string}` {
  return buildTree(allocations).root as `0x${string}`;
}

/** The proof one account needs to claim. Null when the account is not in the tree. */
export function proofFor(allocations: Allocation[], account: Address): `0x${string}`[] | null {
  const tree = buildTree(allocations);
  const wanted = account.toLowerCase();
  for (const [index, value] of tree.entries()) {
    if (String(value[0]).toLowerCase() === wanted) {
      return tree.getProof(index) as `0x${string}`[];
    }
  }
  return null;
}

/**
 * Every account's proof from one build of the tree.
 *
 * `proofFor` rebuilds the tree on each call, which is right for serving one holder and wrong
 * for paying all of them: a thousand holders would be a thousand builds. Keyed by lowercased
 * address.
 */
export function proofsFor(allocations: Allocation[]): Map<string, `0x${string}`[]> {
  const proofs = new Map<string, `0x${string}`[]>();
  if (allocations.length === 0) return proofs;
  const tree = buildTree(allocations);
  for (const [index, value] of tree.entries()) {
    proofs.set(String(value[0]).toLowerCase(), tree.getProof(index) as `0x${string}`[]);
  }
  return proofs;
}

/**
 * Splits `pool` across the balances that clear `minimumHolding`.
 *
 * `pool * balance / eligibleSupply` in bigint throughout, multiplying before dividing. The
 * other order floors to zero for any holder smaller than eligibleSupply / pool, which is
 * most of them. This is the same arithmetic lib/airdrops/derive.ts does for the UI, and the
 * two must agree or the figure someone is shown is not the figure they can claim.
 *
 * Integer division leaves a remainder. It stays in the contract and the creator can reclaim
 * it after `reclaimableAt`; it is reported as `dust` so it is never a surprise.
 */
export function allocate(
  balances: Map<string, bigint>,
  pool: bigint,
  minimumHolding: bigint,
): {allocations: Allocation[]; eligibleSupply: bigint; dust: bigint} {
  const qualifying = [...balances.entries()]
    .filter(([, balance]) => balance > 0n && balance >= minimumHolding)
    // Sorted by address so the same inputs always produce the same tree, and therefore the
    // same root. An unordered Map would give a different root on every run.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const eligibleSupply = qualifying.reduce((sum, [, balance]) => sum + balance, 0n);
  if (eligibleSupply === 0n) return {allocations: [], eligibleSupply: 0n, dust: pool};

  let handed = 0n;
  const allocations: Allocation[] = [];
  for (const [account, balance] of qualifying) {
    const amount = (pool * balance) / eligibleSupply;
    if (amount === 0n) continue; // Nothing to prove; leaving it out keeps the tree smaller.
    handed += amount;
    allocations.push({account: account as Address, amount: amount.toString()});
  }

  return {allocations, eligibleSupply, dust: pool - handed};
}
