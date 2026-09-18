import {describe, expect, it} from "vitest";
import {adjustability, allocate, claimedShare, deriveAirdropState, releasedShare} from "@/lib/airdrops/derive";

const E18 = 10n ** 18n;
/** 1,000,000 tokens in the pool, split across 10,000,000 qualifying tokens held. */
const AIRDROP = {
  pool: 1_000_000n * E18,
  minimumHolding: 1_000n * E18,
  eligibleSupply: 10_000_000n * E18,
};

describe("allocate", () => {
  it("gives a holder their exact pro-rata share", () => {
    // 1,000,000 of 10,000,000 eligible = 10% of the pool.
    const a = allocate(AIRDROP, 1_000_000n * E18);
    expect(a.qualifies).toBe(true);
    expect(a.amount).toBe(100_000n * E18);
    expect(a.share).toBeCloseTo(0.1, 6);
  });

  it("distributes the whole pool across the qualifying balances", () => {
    // Three holders making up the entire eligible supply should receive all of it.
    const parts = [5_000_000n, 3_000_000n, 2_000_000n].map((n) => allocate(AIRDROP, n * E18).amount);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(AIRDROP.pool);
  });

  /**
   * The bug this pins. `pool * balance / supply` keeps the units; `pool * (balance / supply)`
   * or dividing first floors to zero for any holder smaller than supply/pool, which is
   * almost all of them.
   */
  it("does not floor a small holder to nothing", () => {
    const small = allocate(AIRDROP, 1_500n * E18);
    expect(small.qualifies).toBe(true);
    expect(small.amount).toBeGreaterThan(0n);
    expect(small.amount).toBe((AIRDROP.pool * (1_500n * E18)) / AIRDROP.eligibleSupply);
  });

  it("stays exact at sizes Number cannot hold", () => {
    const huge = {pool: 10n ** 27n, minimumHolding: 0n, eligibleSupply: 10n ** 30n};
    // One thousandth of the eligible supply gets one thousandth of the pool, exactly.
    expect(allocate(huge, 10n ** 27n).amount).toBe(10n ** 24n);
  });

  it("refuses a balance under the minimum and says why", () => {
    const a = allocate(AIRDROP, 999n * E18);
    expect(a.qualifies).toBe(false);
    expect(a.amount).toBe(0n);
    expect(a.reason).toBe("below-minimum");
  });

  it("treats exactly the minimum as qualifying", () => {
    expect(allocate(AIRDROP, AIRDROP.minimumHolding).qualifies).toBe(true);
  });

  it("separates a zero balance from one that is merely too small", () => {
    expect(allocate(AIRDROP, 0n).reason).toBe("no-balance");
    expect(allocate(AIRDROP, 1n).reason).toBe("below-minimum");
  });

  it("subtracts what has already been claimed", () => {
    const a = allocate(AIRDROP, 1_000_000n * E18, 40_000n * E18);
    expect(a.amount).toBe(100_000n * E18);
    expect(a.claimed).toBe(40_000n * E18);
    expect(a.claimable).toBe(60_000n * E18);
  });

  it("never reports a negative claimable if more was claimed than is owed", () => {
    // Can happen if the creator lowered the pool. The answer is zero, not a negative debt.
    const a = allocate(AIRDROP, 1_000_000n * E18, 500_000n * E18);
    expect(a.claimable).toBe(0n);
  });

  it("survives an airdrop with no eligible holders", () => {
    const a = allocate({...AIRDROP, eligibleSupply: 0n}, 5_000n * E18);
    expect(a.amount).toBe(0n);
    expect(a.qualifies).toBe(true);
  });

  it("never allocates more than the pool to a single holder", () => {
    const a = allocate(AIRDROP, AIRDROP.eligibleSupply * 2n);
    expect(a.amount).toBeLessThanOrEqual(AIRDROP.pool * 2n);
    expect(a.share).toBe(1);
  });
});

describe("deriveAirdropState", () => {
  const base = {reserve: 100n, claimed: 0n, startsAt: 1_000};

  it("is scheduled before it opens and claimable after", () => {
    expect(deriveAirdropState(base, 999)).toBe("scheduled");
    expect(deriveAirdropState(base, 1_000)).toBe("live");
  });

  it("is finished once the pool is gone, whatever the clock says", () => {
    expect(deriveAirdropState({...base, claimed: 100n}, 5_000)).toBe("finished");
  });

  it("does not call an empty pool finished", () => {
    expect(deriveAirdropState({reserve: 0n, claimed: 0n, startsAt: 0}, 10)).toBe("live");
  });

  /**
   * The bug this pins. A drip releases a round, holders take all of it, and for the next nine
   * minutes `claimed >= released` is true — which under the one-off rule retires a live
   * airdrop from the list and brings it back when the next round lands.
   */
  it("keeps a fully claimed round live while more rounds are coming", () => {
    const drip = {
      reserve: 1_000n * E18,
      claimed: 50n * E18,
      startsAt: 0,
      schedule: {rateBps: 500, intervalSeconds: 600},
    };
    // One round in, and every unit of it taken.
    expect(deriveAirdropState(drip, 60)).toBe("live");
  });

  it("finishes a drip only when its last round has paid out and been claimed", () => {
    const schedule = {rateBps: 5_000, intervalSeconds: 600, maxRounds: 2};
    const drip = {reserve: 1_000n, claimed: 0n, startsAt: 0, schedule};
    // Two rounds of half the remainder release 500 then 250: 750 of 1,000.
    expect(deriveAirdropState({...drip, claimed: 750n}, 10_000)).toBe("finished");
    // A unit short is not finished, and neither is the round before the last.
    expect(deriveAirdropState({...drip, claimed: 749n}, 10_000)).toBe("live");
    expect(deriveAirdropState({...drip, claimed: 500n}, 600)).toBe("live");
  });
});

describe("claimedShare", () => {
  it("reports progress through the pool", () => {
    expect(claimedShare({pool: 1000n, claimed: 250n})).toBeCloseTo(0.25, 6);
    expect(claimedShare({pool: 0n, claimed: 0n})).toBe(0);
    expect(claimedShare({pool: 100n, claimed: 500n})).toBe(1);
  });
});

describe("releasedShare", () => {
  it("is the whole reserve for a one-off and the released slice for a drip", () => {
    expect(releasedShare({pool: 1_000n, reserve: 1_000n})).toBe(1);
    expect(releasedShare({pool: 250n, reserve: 1_000n})).toBeCloseTo(0.25, 6);
    expect(releasedShare({pool: 0n, reserve: 0n})).toBe(0);
  });
});

describe("adjustability", () => {
  const airdrop = {startsAt: 1_000, creator: "0xAbC0000000000000000000000000000000000001" as const};

  it("lets the creator change the terms before claiming opens", () => {
    expect(adjustability(airdrop, airdrop.creator, 500).allowed).toBe(true);
  });

  it("is case insensitive about the creator's address", () => {
    expect(adjustability(airdrop, airdrop.creator.toLowerCase(), 500).allowed).toBe(true);
  });

  it("refuses anyone who is not the creator", () => {
    expect(adjustability(airdrop, "0x0000000000000000000000000000000000000002", 500).allowed).toBe(false);
    expect(adjustability(airdrop, undefined, 500).allowed).toBe(false);
  });

  /**
   * The rule that matters. Once holders can act on the terms, moving them is a rug in slow
   * motion: someone holds because the threshold is X and the creator raises it afterwards.
   */
  it("freezes the terms the moment claiming opens", () => {
    const after = adjustability(airdrop, airdrop.creator, 1_000);
    expect(after.allowed).toBe(false);
    expect(after.reason).toMatch(/fixed/i);
  });

  /**
   * Airdrops made in the form open on signing, so they never have an adjustable window. That
   * is not the same thing as having missed one, and saying so reads as a bug.
   */
  it("distinguishes never adjustable from no longer adjustable", () => {
    const immediate = {...airdrop, createdAt: 1_000};
    expect(adjustability(immediate, airdrop.creator, 1_000).reason).toMatch(/was open the moment/i);

    const wasScheduled = {...airdrop, createdAt: 400};
    expect(adjustability(wasScheduled, airdrop.creator, 1_000).reason).toMatch(/has opened/i);
  });
});
