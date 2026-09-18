import {describe, expect, it} from "vitest";
import {
  DAY_SECONDS,
  HOUR_SECONDS,
  MINUTE_SECONDS,
  accrualOver,
  describeInterval,
  dripFinished,
  dripRounds,
  formatRate,
  nextRoundAt,
  nextRoundRelease,
  parseRateBps,
  releasedAfter,
  releasedBy,
  reserveAfter,
  roundRelease,
  roundsElapsed,
  roundsToRelease,
  scheduleProblem,
  shortInterval,
} from "@/lib/airdrops/schedule";
import {fixtureAirdrops} from "@/lib/airdrops/fixtures";

const E18 = 10n ** 18n;
/** The worked example the feature was asked for: 100,000 locked, 5% of the rest every 10 minutes. */
const RESERVE = 100_000n * E18;
const EVERY_TEN = {rateBps: 500, intervalSeconds: 10 * MINUTE_SECONDS};

describe("the decay curve", () => {
  /**
   * The whole feature in one assertion. 5% of 100,000 is 5,000; the next round is 5% of the
   * 95,000 still held back, which is 4,750; then 5% of 90,250, which is 4,512.5. A schedule
   * that took its percentage of the *original* amount would pay a flat 5,000 for ever and run
   * out on a date everyone could mark in a calendar.
   */
  it("takes its share of what is left, not of what it started with", () => {
    expect(roundRelease(RESERVE, 500, 1)).toBe(5_000n * E18);
    expect(roundRelease(RESERVE, 500, 2)).toBe(4_750n * E18);
    expect(roundRelease(RESERVE, 500, 3)).toBe(4_512n * E18 + 5n * 10n ** 17n);
  });

  it("leaves exactly what the rounds have not taken", () => {
    expect(reserveAfter(RESERVE, 500, 0)).toBe(RESERVE);
    expect(reserveAfter(RESERVE, 500, 1)).toBe(95_000n * E18);
    expect(reserveAfter(RESERVE, 500, 2)).toBe(90_250n * E18);
    expect(releasedAfter(RESERVE, 500, 2)).toBe(9_750n * E18);
  });

  /**
   * Rounds are the difference between two remainders rather than `remaining * rate` each, so
   * a schedule's rounds add up to exactly what the schedule has released. Computed
   * independently they would each floor separately and lose a unit of dust per round.
   */
  it("has rounds that sum to the released total, to the unit", () => {
    const total = Array.from({length: 40}, (_, i) => roundRelease(RESERVE, 500, i + 1)).reduce(
      (a, b) => a + b,
      0n,
    );
    expect(total).toBe(releasedAfter(RESERVE, 500, 40));
  });

  it("never releases more than the reserve, however long it runs", () => {
    expect(releasedAfter(RESERVE, 500, 100_000)).toBeLessThanOrEqual(RESERVE);
    expect(reserveAfter(RESERVE, 500, 100_000)).toBe(0n);
  });

  it("empties in one round at 100% and never at 0%", () => {
    expect(reserveAfter(RESERVE, 10_000, 1)).toBe(0n);
    expect(reserveAfter(RESERVE, 0, 5_000)).toBe(RESERVE);
  });

  /**
   * Binary exponentiation is what makes a minute-by-minute drip left running for a year
   * cheap. The exact form, reserve * 9500^n / 10000^n, is a two-million-digit division at
   * that n. This pins that the shortcut agrees with the long way round where both are viable.
   */
  it("agrees with the exact integer form", () => {
    for (const rounds of [1, 2, 7, 33, 100]) {
      const exact = (RESERVE * 9_500n ** BigInt(rounds)) / 10_000n ** BigInt(rounds);
      // Within a unit of 1e-18 of a token: the fixed point carries 36 digits.
      const diff = reserveAfter(RESERVE, 500, rounds) - exact;
      expect(diff >= -1n && diff <= 1n).toBe(true);
    }
  });

  it("stays exact at sizes Number cannot hold", () => {
    // Half of 10^30, twice: a quarter, with no floating point anywhere near it.
    expect(reserveAfter(10n ** 30n, 5_000, 2)).toBe(25n * 10n ** 28n);
  });
});

describe("rounds against the clock", () => {
  const drip = {startsAt: 1_000, reserve: RESERVE, schedule: EVERY_TEN};

  it("pays the first round the moment claiming opens, not an interval later", () => {
    expect(roundsElapsed(drip, 999)).toBe(0);
    expect(roundsElapsed(drip, 1_000)).toBe(1);
    expect(roundsElapsed(drip, 1_599)).toBe(1);
    expect(roundsElapsed(drip, 1_600)).toBe(2);
  });

  it("reports nothing released before it opens, and the first round's worth after", () => {
    expect(releasedBy(drip, 999)).toBe(0n);
    expect(releasedBy(drip, 1_000)).toBe(5_000n * E18);
  });

  /**
   * A one-off has no schedule, and reports its whole reserve at every moment including before
   * claiming opens. The pool on a scheduled airdrop's card is the terms, not a progress
   * reading, and zeroing it there would make every upcoming airdrop look empty.
   */
  it("treats an airdrop with no schedule as all of it, always", () => {
    const oneOff = {startsAt: 1_000, reserve: RESERVE};
    expect(releasedBy(oneOff, 0)).toBe(RESERVE);
    expect(releasedBy(oneOff, 5_000)).toBe(RESERVE);
    expect(nextRoundAt(oneOff, 0)).toBeNull();
    expect(dripFinished(oneOff, 5_000)).toBe(false);
  });

  it("points at the next round, and at the opening for one that has not started", () => {
    expect(nextRoundAt(drip, 500)).toBe(1_000);
    expect(nextRoundAt(drip, 1_000)).toBe(1_600);
    expect(nextRoundAt(drip, 1_599)).toBe(1_600);
    expect(nextRoundRelease(drip, 1_000)).toBe(4_750n * E18);
  });

  it("stops at maxRounds and says there is nothing more coming", () => {
    const capped = {...drip, schedule: {...EVERY_TEN, maxRounds: 3}};
    expect(roundsElapsed(capped, 1_000 + 10 * 600)).toBe(3);
    expect(nextRoundAt(capped, 1_000 + 2 * 600)).toBeNull();
    expect(nextRoundRelease(capped, 1_000 + 2 * 600)).toBe(0n);
    expect(dripFinished(capped, 1_000 + 2 * 600)).toBe(true);
    // And it keeps holding back whatever those three rounds did not release.
    expect(releasedBy(capped, 1_000 + 900 * 600)).toBe(releasedAfter(RESERVE, 500, 3));
  });

  it("ends when there is nothing left to take a percentage of", () => {
    const halving = {startsAt: 0, reserve: 8n, schedule: {rateBps: 5_000, intervalSeconds: 60}};
    // 8 -> 4 -> 2 -> 1 -> 0. Four rounds and the fifth has nothing to release.
    expect(releasedBy(halving, 4 * 60)).toBe(8n);
    expect(nextRoundAt(halving, 4 * 60)).toBeNull();
    expect(dripFinished(halving, 4 * 60)).toBe(true);
  });
});

describe("accrual between rounds", () => {
  const drip = {startsAt: 1_000, reserve: RESERVE, schedule: EVERY_TEN};

  /**
   * The behaviour this exists for. Released in steps, a holder who claimed the instant a round
   * landed was owed exactly nothing for the next ten minutes, and the page had to tell them to
   * come back later. The interval is a rate the creator chose, not a gate on the claim button.
   */
  it("is owed something again one second after claiming everything", () => {
    const justClaimed = releasedBy(drip, 1_000);
    expect(releasedBy(drip, 1_001)).toBeGreaterThan(justClaimed);
  });

  it("never goes backwards, seconds at a time across a whole interval", () => {
    let previous = -1n;
    for (let t = 1_000; t <= 1_000 + 2 * 600; t += 7) {
      const released = releasedBy({...drip}, t);
      expect(released).toBeGreaterThanOrEqual(previous);
      previous = released;
    }
  });

  /**
   * The curve still meets the marks. Everything a creator was shown when they signed, and
   * everything `dripRounds` draws, describes the boundaries; accrual only fills the gaps.
   */
  it("agrees exactly with the stepped figures at every round boundary", () => {
    for (const round of [1, 2, 3, 9]) {
      expect(releasedBy(drip, 1_000 + (round - 1) * 600)).toBe(releasedAfter(RESERVE, 500, round));
    }
  });

  it("is round 1 plus a pro-rata slice of round 2, partway through the first interval", () => {
    // Halfway through: all of the 5,000 and half of the 4,750 that round 2 is worth.
    expect(releasedBy(drip, 1_000 + 300)).toBe(5_000n * E18 + (4_750n * E18) / 2n);
    // A fifth of the way in.
    expect(releasedBy(drip, 1_000 + 120)).toBe(5_000n * E18 + (4_750n * E18) / 5n);
  });

  it("accrues nothing before claiming opens", () => {
    expect(releasedBy(drip, 999)).toBe(0n);
    expect(releasedBy(drip, 1_000 - 600)).toBe(0n);
  });

  it("stops dead at the cap rather than accruing past it", () => {
    const capped = {...drip, schedule: {...EVERY_TEN, maxRounds: 2}};
    const atCap = releasedAfter(RESERVE, 500, 2);
    expect(releasedBy(capped, 1_000 + 600)).toBe(atCap);
    expect(releasedBy(capped, 1_000 + 600 + 300)).toBe(atCap);
    expect(releasedBy(capped, 1_000 + 10_000 * 600)).toBe(atCap);
  });

  it("never releases more than the reserve at any instant", () => {
    for (const t of [1_000, 1_234, 50_000, 10 ** 9]) {
      expect(releasedBy(drip, t)).toBeLessThanOrEqual(RESERVE);
    }
  });

  /** A one-off has no curve to be partway along. It is all of it, from the moment it opens. */
  it("leaves a one-off alone", () => {
    const oneOff = {startsAt: 1_000, reserve: RESERVE};
    expect(releasedBy(oneOff, 1_337)).toBe(RESERVE);
    expect(accrualOver(oneOff, 1_337, HOUR_SECONDS)).toBe(0n);
  });

  it("estimates the hourly rate from the round in flight", () => {
    // Round 2 is worth 4,750 over ten minutes, so an hour of that pace is six of them.
    expect(accrualOver(drip, 1_000, HOUR_SECONDS)).toBe(4_750n * E18 * 6n);
    expect(accrualOver(drip, 999, HOUR_SECONDS)).toBe(0n);
  });
});

describe("dripRounds", () => {
  const drip = {startsAt: 1_000, reserve: RESERVE, schedule: EVERY_TEN};

  it("walks forward from a round, with the right times and amounts", () => {
    const rounds = dripRounds(drip, 1, 3);
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(rounds.map((r) => r.at)).toEqual([1_000, 1_600, 2_200]);
    expect(rounds[0].release).toBe(5_000n * E18);
    expect(rounds[0].remaining).toBe(95_000n * E18);
    expect(rounds[1].released).toBe(9_750n * E18);
  });

  it("stops at the cap rather than inventing rounds past it", () => {
    const capped = {...drip, schedule: {...EVERY_TEN, maxRounds: 2}};
    expect(dripRounds(capped, 1, 10)).toHaveLength(2);
  });

  it("stops once a round would release nothing", () => {
    // 4 -> 2 -> 1 -> 0, so three rounds release 2, 1 and 1, and the fourth has nothing left.
    const tiny = {startsAt: 0, reserve: 4n, schedule: {rateBps: 5_000, intervalSeconds: 60}};
    const rounds = dripRounds(tiny, 1, 10);
    expect(rounds).toHaveLength(3);
    expect(rounds.map((r) => r.release)).toEqual([2n, 1n, 1n]);
  });

  it("returns nothing at all for an airdrop with no schedule", () => {
    expect(dripRounds({startsAt: 0, reserve: RESERVE}, 1, 5)).toEqual([]);
  });
});

describe("roundsToRelease", () => {
  it("answers how long a rate takes to hand out most of the reserve", () => {
    // 0.95^90 is just under 0.01, so ninety rounds clears 99%.
    expect(roundsToRelease(500, 9_900)).toBe(90);
    expect(releasedAfter(RESERVE, 500, 90)).toBeGreaterThan((RESERVE * 99n) / 100n);
    expect(releasedAfter(RESERVE, 500, 89)).toBeLessThan((RESERVE * 99n) / 100n);
  });

  it("is one round at 100% and never at 0%", () => {
    expect(roundsToRelease(10_000, 9_900)).toBe(1);
    expect(roundsToRelease(0, 9_900)).toBe(Infinity);
  });
});

describe("wording", () => {
  it("names an interval the way someone would say it", () => {
    expect(describeInterval(10 * MINUTE_SECONDS)).toBe("every 10 minutes");
    expect(describeInterval(MINUTE_SECONDS)).toBe("every minute");
    expect(describeInterval(HOUR_SECONDS)).toBe("every hour");
    expect(describeInterval(6 * HOUR_SECONDS)).toBe("every 6 hours");
    expect(describeInterval(DAY_SECONDS)).toBe("every day");
    expect(describeInterval(7 * DAY_SECONDS)).toBe("every week");
    expect(describeInterval(3 * DAY_SECONDS)).toBe("every 3 days");
  });

  it("shortens one for a card", () => {
    expect(shortInterval(10 * MINUTE_SECONDS)).toBe("10m");
    expect(shortInterval(HOUR_SECONDS)).toBe("1h");
    expect(shortInterval(7 * DAY_SECONDS)).toBe("7d");
  });

  it("prints a rate without trailing noise", () => {
    expect(formatRate(500)).toBe("5%");
    expect(formatRate(250)).toBe("2.5%");
    expect(formatRate(25)).toBe("0.25%");
    expect(formatRate(1_000)).toBe("10%");
    expect(formatRate(10_000)).toBe("100%");
  });

  it("round-trips a typed percentage", () => {
    expect(parseRateBps("5")).toBe(500);
    expect(parseRateBps("5%")).toBe(500);
    expect(parseRateBps("2.5")).toBe(250);
    expect(parseRateBps("0.25")).toBe(25);
    expect(parseRateBps("100")).toBe(10_000);
  });

  /** Rejected rather than rounded: a rate that is not the rate typed pays out wrong for ever. */
  it("refuses more precision than a basis point", () => {
    expect(parseRateBps("0.005")).toBeNull();
    expect(parseRateBps("")).toBeNull();
    expect(parseRateBps(".")).toBeNull();
    expect(parseRateBps("five")).toBeNull();
    expect(parseRateBps("-5")).toBeNull();
  });
});

describe("scheduleProblem", () => {
  it("passes a sane schedule", () => {
    expect(scheduleProblem(EVERY_TEN)).toBeNull();
    expect(scheduleProblem({...EVERY_TEN, maxRounds: 12})).toBeNull();
  });

  it("refuses a rate outside the range a basis point can express", () => {
    expect(scheduleProblem({...EVERY_TEN, rateBps: 0})).toMatch(/at least/i);
    expect(scheduleProblem({...EVERY_TEN, rateBps: 10_001})).toMatch(/more than 100/i);
  });

  it("refuses rounds closer than a minute or further apart than a year", () => {
    expect(scheduleProblem({...EVERY_TEN, intervalSeconds: 59})).toMatch(/minute/i);
    expect(scheduleProblem({...EVERY_TEN, intervalSeconds: 366 * DAY_SECONDS})).toMatch(/year/i);
  });

  it("refuses a fractional or negative stop", () => {
    expect(scheduleProblem({...EVERY_TEN, maxRounds: 0})).toMatch(/whole number/i);
    expect(scheduleProblem({...EVERY_TEN, maxRounds: 2.5})).toMatch(/whole number/i);
  });
});

describe("the fixture set", () => {
  /**
   * Both of these matter for the page rather than for the maths. A recurring airdrop that is
   * either untouched or fully drained shows nothing worth looking at, and the reason the fast
   * one is anchored to the hour rather than to midnight is that a ten-minute drip anchored to
   * midnight is done by teatime.
   */
  const NOW = 1_760_000_000;
  const airdrops = fixtureAirdrops(NOW);
  const drips = airdrops.filter((a) => a.kind === "recurring");

  it("ships airdrops that pay out in rounds", () => {
    expect(drips.length).toBeGreaterThanOrEqual(2);
    for (const drip of drips) expect(drip.schedule).toBeDefined();
  });

  it("has a live one partway through its schedule, not at either end", () => {
    const live = drips.filter((a) => a.state === "live");
    expect(live.length).toBeGreaterThan(0);
    for (const drip of live) {
      expect(drip.pool).toBeGreaterThan(0n);
      expect(drip.pool).toBeLessThan(drip.reserve);
      expect(nextRoundAt(drip, NOW)).not.toBeNull();
    }
  });

  it("never claims more than has been released", () => {
    for (const airdrop of airdrops) expect(airdrop.claimed).toBeLessThanOrEqual(airdrop.pool);
  });

  it("holds back everything on one that has not opened yet", () => {
    for (const drip of drips.filter((a) => a.state === "scheduled")) {
      expect(drip.pool).toBe(0n);
      expect(drip.claimed).toBe(0n);
    }
  });
});
