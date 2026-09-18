import {describe, expect, it} from "vitest";
import {canStop, isOperator, isOperatorControlled, operatorWallets} from "@/lib/airdrops/operators";
import {adjustability} from "@/lib/airdrops/derive";
import {releasedAfter, releasedBy, heldBack, nextRoundAt, dripFinished} from "@/lib/airdrops/schedule";

const E18 = 10n ** 18n;
const OPERATOR = "0x1682C0b0f1f26b4a43E107f53E35275eF0cd967B" as const;
const OTHER_OPERATOR = "0x7f8c5556874C98257eE950853AB2584352d2A5e1" as const;
const THIRD_OPERATOR = "0x9ED9e0197c48E77C91ff8521b736812DaED8C839" as const;
const STRANGER = "0x0000000000000000000000000000000000000009" as const;

describe("the operator list", () => {
  it("holds the wallets it is configured with", () => {
    expect(operatorWallets()).toHaveLength(3);
    expect(isOperator(OPERATOR)).toBe(true);
    expect(isOperator(OTHER_OPERATOR)).toBe(true);
    expect(isOperator(THIRD_OPERATOR)).toBe(true);
  });

  it("does not care how the address is cased", () => {
    expect(isOperator(OPERATOR.toLowerCase())).toBe(true);
    expect(isOperator(OPERATOR.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  it("lets nobody else in", () => {
    expect(isOperator(STRANGER)).toBe(false);
    expect(isOperator(undefined)).toBe(false);
    expect(isOperator("")).toBe(false);
    expect(isOperator("not an address")).toBe(false);
    // A near miss on the last character is a different wallet, not a typo to be forgiven.
    expect(isOperator(`${OPERATOR.slice(0, -1)}C`)).toBe(false);
  });
});

describe("adjustability under an operator", () => {
  const openedLongAgo = {startsAt: 1_000, createdAt: 1_000};

  it("keeps the terms movable for an operator after claiming has opened", () => {
    const own = {...openedLongAgo, creator: OPERATOR};
    expect(adjustability(own, OPERATOR, 99_999).allowed).toBe(true);
  });

  it("still freezes everyone else at the same moment", () => {
    const ordinary = {...openedLongAgo, creator: STRANGER};
    expect(adjustability(ordinary, STRANGER, 99_999).allowed).toBe(false);
  });

  /**
   * The power is over what the wallet funded itself and nothing else. An operator holding a
   * key to other people's reserves would be a different product.
   */
  it("gives an operator no say over an airdrop somebody else created", () => {
    const someoneElses = {...openedLongAgo, creator: STRANGER};
    expect(adjustability(someoneElses, OPERATOR, 500).allowed).toBe(false);
    expect(adjustability(someoneElses, OPERATOR, 99_999).allowed).toBe(false);
  });
});

describe("canStop", () => {
  it("lets an operator stop the airdrop it created", () => {
    expect(canStop({creator: OPERATOR}, OPERATOR).allowed).toBe(true);
  });

  it("refuses an ordinary creator their own funded airdrop", () => {
    const refusal = canStop({creator: STRANGER}, STRANGER);
    expect(refusal.allowed).toBe(false);
    expect(refusal.reason).toMatch(/belongs to the holders/i);
  });

  it("refuses an operator somebody else's airdrop", () => {
    expect(canStop({creator: STRANGER}, OPERATOR).allowed).toBe(false);
    expect(canStop({creator: OTHER_OPERATOR}, OPERATOR).allowed).toBe(false);
  });

  it("refuses a viewer who is not connected", () => {
    expect(canStop({creator: OPERATOR}, undefined).allowed).toBe(false);
  });

  it("refuses one that is already stopped", () => {
    expect(canStop({creator: OPERATOR, stoppedAt: 1_000}, OPERATOR).allowed).toBe(false);
  });

  it("marks an operator's airdrop as one holders should be told about", () => {
    expect(isOperatorControlled({creator: OPERATOR})).toBe(true);
    expect(isOperatorControlled({creator: STRANGER})).toBe(false);
  });
});

describe("a stopped schedule", () => {
  const RESERVE = 100_000n * E18;
  const drip = {startsAt: 1_000, reserve: RESERVE, schedule: {rateBps: 500, intervalSeconds: 600}};
  // Stopped exactly on the second round's boundary: 9,750 of the 100,000 had gone out.
  const stopped = {...drip, stoppedAt: 1_000 + 600};

  /**
   * The line the whole feature turns on. Stopping calls off the rounds that have not happened;
   * it does not reach back into what holders were already owed, which is what would make it a
   * clawback rather than an end to a giveaway.
   */
  it("keeps everything it had already released", () => {
    const atStop = releasedAfter(RESERVE, 500, 2);
    expect(releasedBy(stopped, 1_000 + 600)).toBe(atStop);
    expect(releasedBy(stopped, 1_000 + 600 + 1)).toBe(atStop);
    expect(releasedBy(stopped, 10 ** 9)).toBe(atStop);
  });

  it("releases nothing after the moment it was stopped", () => {
    const running = releasedBy(drip, 1_000 + 5_000);
    expect(releasedBy(stopped, 1_000 + 5_000)).toBeLessThan(running);
  });

  it("does not rewrite what it had released before the stop", () => {
    for (const t of [1_000, 1_100, 1_500]) {
      expect(releasedBy(stopped, t)).toBe(releasedBy(drip, t));
    }
  });

  it("hands back exactly what was still held", () => {
    expect(heldBack(stopped, 10 ** 9)).toBe(RESERVE - releasedAfter(RESERVE, 500, 2));
  });

  it("has no next round and reports itself over", () => {
    expect(nextRoundAt(stopped, 1_000 + 700)).toBeNull();
    expect(dripFinished(stopped, 1_000 + 700)).toBe(true);
  });
});
