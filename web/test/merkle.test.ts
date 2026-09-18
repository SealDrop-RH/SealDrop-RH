import {describe, expect, it} from "vitest";
import {keccak256, encodeAbiParameters, concat} from "viem";
import {allocate, buildTree, proofFor, rootOf} from "@/lib/airdrops/merkle";
import type {Address} from "@/lib/locks/types";

const A = "0x0000000000000000000000000000000000000001" as Address;
const B = "0x0000000000000000000000000000000000000002" as Address;
const C = "0x0000000000000000000000000000000000000003" as Address;
const E18 = 10n ** 18n;

describe("leaf encoding", () => {
  /**
   * The contract computes:
   *   keccak256(bytes.concat(keccak256(abi.encode(account, amount))))
   *
   * If the library ever changed that, every proof would stop verifying while the root still
   * looked perfectly reasonable. This recomputes it by hand and compares.
   */
  it("matches what PonsAirdrop hashes", () => {
    const account = A;
    const amount = 12345n;

    const byHand = keccak256(
      concat([
        keccak256(
          encodeAbiParameters(
            [{type: "address"}, {type: "uint256"}],
            [account, amount],
          ),
        ),
      ]),
    );

    const tree = buildTree([{account, amount: amount.toString()}]);
    // A single-leaf tree's root is the leaf itself.
    expect(tree.root.toLowerCase()).toBe(byHand.toLowerCase());
  });
});

describe("allocate", () => {
  it("splits the pool in proportion to balances", () => {
    const balances = new Map([
      [A, 500n * E18],
      [B, 300n * E18],
      [C, 200n * E18],
    ]);
    const {allocations, eligibleSupply, dust} = allocate(balances, 1_000n * E18, 0n);

    expect(eligibleSupply).toBe(1_000n * E18);
    expect(allocations.map((a) => a.amount)).toEqual([
      (500n * E18).toString(),
      (300n * E18).toString(),
      (200n * E18).toString(),
    ]);
    expect(dust).toBe(0n);
  });

  it("excludes balances under the minimum and redistributes to the rest", () => {
    const balances = new Map([
      [A, 900n * E18],
      [B, 100n * E18],
      [C, 1n], // dust holder, far below the bar
    ]);
    const {allocations, eligibleSupply} = allocate(balances, 1_000n * E18, 50n * E18);

    expect(allocations).toHaveLength(2);
    expect(eligibleSupply, "the excluded wallet is not in the denominator").toBe(1_000n * E18);
    // A gets 90% because the pool splits across the two that qualified, not across all three.
    expect(allocations[0].amount).toBe((900n * E18).toString());
  });

  /** Multiply before dividing, or every small holder floors to zero. */
  it("does not floor a small holder to nothing", () => {
    const balances = new Map([
      [A, 10_000_000n * E18],
      [B, 1_500n * E18],
    ]);
    const {allocations} = allocate(balances, 1_000_000n * E18, 1_000n * E18);
    const small = allocations.find((a) => a.account === B);
    expect(BigInt(small?.amount ?? "0")).toBeGreaterThan(0n);
  });

  it("reports the remainder integer division leaves behind", () => {
    const balances = new Map([
      [A, 1n],
      [B, 1n],
      [C, 1n],
    ]);
    // 10 split three ways is 3 each, with 1 left over.
    const {allocations, dust} = allocate(balances, 10n, 0n);
    expect(allocations.every((a) => a.amount === "3")).toBe(true);
    expect(dust).toBe(1n);
  });

  it("never hands out more than the pool", () => {
    const balances = new Map([
      [A, 7n],
      [B, 11n],
      [C, 13n],
    ]);
    const {allocations, dust} = allocate(balances, 1_000_000n, 0n);
    const handed = allocations.reduce((sum, a) => sum + BigInt(a.amount), 0n);
    expect(handed + dust).toBe(1_000_000n);
    expect(handed).toBeLessThanOrEqual(1_000_000n);
  });

  it("survives nobody qualifying", () => {
    const {allocations, eligibleSupply, dust} = allocate(new Map([[A, 1n]]), 1_000n, 500n);
    expect(allocations).toEqual([]);
    expect(eligibleSupply).toBe(0n);
    expect(dust).toBe(1_000n);
  });
});

describe("tree determinism", () => {
  /**
   * A Map iterates in insertion order, so two runs that discovered holders in a different
   * order would otherwise produce different roots for identical balances. The root is
   * published on chain; it has to be reproducible by anyone checking the work.
   */
  it("gives the same root regardless of the order holders were found in", () => {
    const forward = new Map([
      [A, 1n * E18],
      [B, 2n * E18],
      [C, 3n * E18],
    ]);
    const backward = new Map([
      [C, 3n * E18],
      [B, 2n * E18],
      [A, 1n * E18],
    ]);
    expect(rootOf(allocate(forward, 100n * E18, 0n).allocations)).toBe(
      rootOf(allocate(backward, 100n * E18, 0n).allocations),
    );
  });

  it("changes the root when any amount changes", () => {
    const base = [{account: A, amount: "100"}];
    const altered = [{account: A, amount: "101"}];
    expect(rootOf(base)).not.toBe(rootOf(altered));
  });
});

describe("proofFor", () => {
  const allocations = [
    {account: A, amount: "500"},
    {account: B, amount: "300"},
    {account: C, amount: "200"},
  ];

  it("returns a proof for an account in the tree", () => {
    const proof = proofFor(allocations, B);
    expect(proof).not.toBeNull();
    expect(Array.isArray(proof)).toBe(true);
  });

  it("is case insensitive about the address", () => {
    expect(proofFor(allocations, A.toUpperCase() as Address)).not.toBeNull();
  });

  it("returns null for an account that is not in the tree", () => {
    expect(proofFor(allocations, "0x000000000000000000000000000000000000dEaD" as Address)).toBeNull();
  });

  it("produces a proof the library itself verifies", () => {
    const tree = buildTree(allocations);
    for (const [index] of tree.entries()) {
      expect(tree.verify(index, tree.getProof(index))).toBe(true);
    }
  });
});
