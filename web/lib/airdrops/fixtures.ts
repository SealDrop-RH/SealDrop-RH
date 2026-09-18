import {activeChainId} from "@/lib/chain";
import {seeded, rangeInt} from "@/lib/strip/rng";
import {fixtureLocks, fixtureTokens} from "@/lib/locks/fixtures";
import {lockId} from "@/lib/locks/id";
import {atTime} from "./derive";
import {DAY_SECONDS, HOUR_SECONDS, MINUTE_SECONDS, releasedAfter, roundsElapsed} from "./schedule";
import type {Address, Hash} from "@/lib/locks/types";
import type {Airdrop, AirdropSchedule} from "./types";

/**
 * The part 1 airdrop set.
 *
 * Built from the same seeded, pure approach as the lock fixtures, and anchored to the
 * current day rather than to a constant, so the spread of scheduled, claimable and finished
 * airdrops stays the same shape as real time passes.
 */

const DAY = DAY_SECONDS;

function anchorDay(nowSeconds: number): number {
  return Math.floor(nowSeconds / DAY) * DAY;
}

/**
 * The anchor for the fast schedules.
 *
 * A ten-minute drip anchored to midnight is nineteen rounds in at three in the morning and
 * drained by teatime, so by the time most people looked at it there would be nothing left to
 * watch. Anchoring the sub-day plans to the hour keeps them permanently a few rounds in,
 * which is the state worth showing.
 */
function anchorHour(nowSeconds: number): number {
  return Math.floor(nowSeconds / HOUR_SECONDS) * HOUR_SECONDS;
}

function airdropId(seed: string): string {
  return `ad_${lockId(seed).slice(3)}`;
}

function fakeHash(seed: string): Hash {
  const random = seeded(`airdrop-hash:${seed}`);
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += "0123456789abcdef"[Math.floor(random() * 16)];
  return out as Hash;
}

/**
 * A deliberate spread: some open in the future so the countdown has something to count, some
 * are claimable now, and one is fully claimed so that state is reachable without waiting.
 */
const PLAN: ReadonlyArray<{
  tokenIndex: number;
  /** Seconds from the day anchor. Negative means claiming has already opened. */
  opensIn: number;
  /** Share of total supply set aside for holders. */
  reserveShare: number;
  /** Minimum holding as a share of total supply. */
  minimumShare: number;
  /** Share of what has been released by now that holders have already taken. */
  claimedShare: number;
  /** Present on the ones that pay out in rounds. */
  schedule?: AirdropSchedule;
  note?: string;
}> = [
  {tokenIndex: 0, opensIn: -21 * DAY, reserveShare: 0.02, minimumShare: 0.0005, claimedShare: 1, note: "Launch drop for early holders."},
  {tokenIndex: 1, opensIn: -6 * DAY, reserveShare: 0.015, minimumShare: 0.001, claimedShare: 0.41},
  {tokenIndex: 2, opensIn: -2 * DAY, reserveShare: 0.03, minimumShare: 0.0002, claimedShare: 0.12, note: "Thanks for holding through the migration."},

  // The two that pay out in rounds. One is minutes into a ten-minute drip, so the next-round
  // countdown on the card has something to count without anyone having to wait a day for it;
  // the other is a slow daily one, which is the shape most creators will actually want.
  {
    tokenIndex: 3,
    opensIn: -3 * HOUR_SECONDS,
    reserveShare: 0.05,
    minimumShare: 0.0004,
    claimedShare: 0.63,
    schedule: {rateBps: 500, intervalSeconds: 10 * MINUTE_SECONDS},
    note: "5% of what is left to holders, every ten minutes.",
  },
  {
    tokenIndex: 5,
    opensIn: -9 * DAY,
    reserveShare: 0.08,
    minimumShare: 0.002,
    claimedShare: 0.78,
    schedule: {rateBps: 250, intervalSeconds: DAY_SECONDS, maxRounds: 180},
    note: "A daily 2.5% of the remainder, for six months.",
  },

  {tokenIndex: 4, opensIn: 3 * DAY, reserveShare: 0.025, minimumShare: 0.001, claimedShare: 0},
  {
    tokenIndex: 7,
    opensIn: 6 * HOUR_SECONDS,
    reserveShare: 0.04,
    minimumShare: 0.0025,
    claimedShare: 0,
    schedule: {rateBps: 1_000, intervalSeconds: HOUR_SECONDS},
    note: "Hourly, 10% of whatever has not gone out yet.",
  },
  {tokenIndex: 10, opensIn: 28 * DAY, reserveShare: 0.012, minimumShare: 0.0005, claimedShare: 0},
];

function build(nowSeconds: number): Airdrop[] {
  const day = anchorDay(nowSeconds);
  const hour = anchorHour(nowSeconds);
  const tokens = fixtureTokens();
  const locks = fixtureLocks(nowSeconds);

  return PLAN.map((plan, i) => {
    const token = tokens[plan.tokenIndex % tokens.length];
    const random = seeded(`airdrop:${i}:${token.symbol}`);

    const reserve = (token.totalSupply * BigInt(Math.round(plan.reserveShare * 1_000_000))) / 1_000_000n;
    const minimumHolding =
      (token.totalSupply * BigInt(Math.round(plan.minimumShare * 1_000_000))) / 1_000_000n;

    // The qualifying balances the pool is split across. Between a fifth and a half of supply
    // sits in wallets that clear the threshold, which is what the pool is measured against.
    const eligibleSupply =
      (token.totalSupply * BigInt(rangeInt(random, 2_000, 5_000))) / 10_000n;

    const startsAt = (Math.abs(plan.opensIn) < DAY ? hour : day) + plan.opensIn;

    // Claimed is a share of what the schedule has actually released, not of the whole reserve.
    // Measured against the reserve, a drip three rounds in would look 97% unclaimed for ever,
    // and one at its last round would read as fully claimed before anyone had touched it.
    const released = plan.schedule
      ? releasedAfter(reserve, plan.schedule.rateBps, roundsElapsed({startsAt, reserve, schedule: plan.schedule}, nowSeconds))
      : nowSeconds >= startsAt
        ? reserve
        : 0n;
    const claimed = (released * BigInt(Math.round(plan.claimedShare * 1_000_000))) / 1_000_000n;

    const createdAt = startsAt - rangeInt(random, 5, 90) * DAY;

    // Tied to a real lock on the same token where there is one, so the pages can link up.
    const relatedLock = locks.find((lock) => lock.token.address === token.address);

    return {
      id: airdropId(`${token.symbol}:${i}`),
      token,
      creator: (relatedLock?.owner ?? "0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0") as Address,
      kind: plan.schedule ? "recurring" : "one-off",
      reserve,
      schedule: plan.schedule,
      // Both filled in by atTime below, which is the only thing that should set them.
      pool: 0n,
      claimed,
      minimumHolding,
      eligibleSupply,
      eligibleHolders: rangeInt(random, 180, 4200),
      startsAt,
      createdAt,
      lockId: relatedLock?.id,
      txHash: fakeHash(`${token.symbol}:${i}`),
      chainId: activeChainId,
      state: "scheduled",
      note: plan.note,
      simulated: true,
    } satisfies Airdrop;
  });
}

let cached: {hour: number; airdrops: readonly Airdrop[]} | null = null;

export function fixtureAirdrops(nowSeconds: number): Airdrop[] {
  // Keyed on the hour rather than the day so the hour-anchored plans stay put. The day-scale
  // ones are built from the day anchor and come out identical on every rebuild regardless.
  const hour = anchorHour(nowSeconds);
  if (!cached || cached.hour !== hour) cached = {hour, airdrops: build(nowSeconds)};
  // Rebuilt against the clock on every read, so a ten-minute drip visibly moves on a page
  // that is left open rather than only after a reload.
  return cached.airdrops.map((airdrop) => atTime(airdrop, nowSeconds));
}
