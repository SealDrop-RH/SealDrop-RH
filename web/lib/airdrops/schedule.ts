import type {AirdropSchedule} from "./types";

/**
 * Paying out in rounds.
 *
 * A one-off airdrop puts a pool on the table and every holder takes their slice of it. A
 * recurring one hands out a percentage of whatever is *left* each round, so the same 5% is a
 * smaller absolute amount every time: 100,000 gives up 5,000, then 4,750 of the 95,000 that
 * remain, then 4,512 of the 90,250. The reserve is approached, never emptied.
 *
 * That geometry is the point rather than a side effect. A drip that hands out a fixed slice
 * has a last round, and a known last round is a cliff everyone sells into. A drip that takes
 * a share of the remainder has no last round, only rounds too small to matter, and nobody can
 * mark a date in a calendar to be gone by.
 *
 * Everything here is pure and works in bigint. The one place a Number appears is
 * `roundsToRelease`, which answers "roughly how long does this run for" in a sentence of
 * copy and is never what anybody is owed.
 */

export const MINUTE_SECONDS = 60;
export const HOUR_SECONDS = 60 * MINUTE_SECONDS;
export const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Rates are basis points, so a quarter of a percent is still a whole number. 5% is 500. */
export const BPS = 10_000;

export const MIN_RATE_BPS = 1; // 0.01%
export const MAX_RATE_BPS = BPS; // 100%, which empties the reserve in one round
export const MIN_INTERVAL_SECONDS = MINUTE_SECONDS;
export const MAX_INTERVAL_SECONDS = 365 * DAY_SECONDS;
export const MAX_ROUNDS_LIMIT = 100_000;

/** Fixed-point scale for the decay factor. 36 digits is far past any token's precision. */
const SCALE = 10n ** 36n;

/**
 * (numerator / denominator) ^ exponent, in SCALE fixed point.
 *
 * Binary exponentiation, because the obvious exact form, `reserve * 9500^n / 10000^n`, grows
 * the intermediate by four digits per round, and a minute-by-minute drip left running for a
 * year is half a million rounds and a two-million-digit number to divide. This holds every
 * intermediate at 72 digits and costs log2(n) multiplications, so that same year costs
 * nineteen of them.
 *
 * The cost is a last-digit rounding per multiplication, at 1e-36 relative, which a token with
 * 18 decimals cannot represent even in its dust.
 */
function powFraction(numerator: bigint, denominator: bigint, exponent: number): bigint {
  let result = SCALE;
  let base = (numerator * SCALE) / denominator;
  let remaining = Math.max(0, Math.floor(exponent));

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      result = (result * base) / SCALE;
      // Decayed past the smallest unit anything is measured in. Further rounds change nothing.
      if (result === 0n) return 0n;
    }
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) base = (base * base) / SCALE;
  }
  return result;
}

function clampRate(rateBps: number): number {
  if (!Number.isFinite(rateBps)) return 0;
  return Math.min(MAX_RATE_BPS, Math.max(0, Math.floor(rateBps)));
}

function intervalOf(schedule: AirdropSchedule): number {
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.floor(schedule.intervalSeconds)));
}

/** What the schedule is working on: the reserve, when it starts, and how it pays out. */
export interface Dripping {
  startsAt: number;
  reserve: bigint;
  schedule?: AirdropSchedule;
  /** When an operator halted it. The curve is read at this moment ever after. */
  stoppedAt?: number;
}

/* ------------------------------------------------------------------ rounds ---- */

/**
 * How many rounds have paid out by `nowSeconds`.
 *
 * Round 1 lands at `startsAt` rather than one interval after it. Someone who sets claiming to
 * open at noon expects something claimable at noon, not at ten past.
 */
export function roundsElapsed(airdrop: Dripping, nowSeconds: number): number {
  if (nowSeconds < airdrop.startsAt) return 0;
  const {schedule} = airdrop;
  if (!schedule) return 1;

  const elapsed = Math.floor((nowSeconds - airdrop.startsAt) / intervalOf(schedule)) + 1;
  const cap = schedule.maxRounds && schedule.maxRounds > 0 ? schedule.maxRounds : Infinity;
  return Math.min(elapsed, cap);
}

/** What is still held back after `rounds` have paid out. */
export function reserveAfter(reserve: bigint, rateBps: number, rounds: number): bigint {
  if (reserve <= 0n) return 0n;
  if (rounds <= 0) return reserve;

  const rate = clampRate(rateBps);
  if (rate <= 0) return reserve;
  // 100% a round is a one-off wearing a schedule's clothes: the first round takes everything.
  if (rate >= BPS) return 0n;

  return (reserve * powFraction(BigInt(BPS - rate), BigInt(BPS), rounds)) / SCALE;
}

/** What has been handed out once `rounds` have paid out. */
export function releasedAfter(reserve: bigint, rateBps: number, rounds: number): bigint {
  return reserve - reserveAfter(reserve, rateBps, rounds);
}

/**
 * The size of one round's release. Rounds are 1-indexed: round 1 is the one at `startsAt`.
 *
 * Taken as the difference between two remainders rather than as `remaining * rate`, so the
 * rounds of a schedule always add up to exactly what the schedule has released. Computing
 * each one independently would leave a unit of dust unaccounted for per round.
 */
export function roundRelease(reserve: bigint, rateBps: number, round: number): bigint {
  if (round <= 0) return 0n;
  return reserveAfter(reserve, rateBps, round - 1) - reserveAfter(reserve, rateBps, round);
}

/* ------------------------------------------------------- an airdrop in time ---- */

/**
 * How much of the reserve is claimable by now.
 *
 * A one-off reports its whole reserve at every moment, including before claiming opens: all
 * of it is going out at once and the figure on a scheduled airdrop's card is the terms, not a
 * progress reading.
 *
 * A recurring one accrues *continuously*, and this is the part worth being careful about.
 * Released in discrete steps, a holder who claimed the moment a round landed had exactly
 * nothing claimable for the next ten minutes, and the page had to tell them to come back
 * later. That makes the interval a gate on the claim button rather than what the creator
 * actually chose, which was a rate. So the round that has not landed yet is counted pro rata
 * through its interval: the same 5% per ten minutes, arriving smoothly instead of all at once.
 *
 * It stays exact at every round boundary, so `dripRounds` and the amounts a creator was shown
 * when they signed still describe this curve; the only difference is what happens between the
 * marks. Claiming is never closed for someone who is owed something.
 */
export function releasedBy(airdrop: Dripping, nowSeconds: number): bigint {
  const {schedule} = airdrop;
  if (!schedule) return airdrop.reserve;

  // A stop freezes the curve rather than rewinding it. Everything the rounds had handed out
  // by that moment stays handed out, and stays claimable; only the future is cancelled.
  const at = airdrop.stoppedAt === undefined ? nowSeconds : Math.min(nowSeconds, airdrop.stoppedAt);
  if (at < airdrop.startsAt) return 0n;

  const rounds = roundsElapsed(airdrop, at);
  const settled = releasedAfter(airdrop.reserve, schedule.rateBps, rounds);

  const cap = schedule.maxRounds && schedule.maxRounds > 0 ? schedule.maxRounds : Infinity;
  if (rounds >= cap) return settled;

  // The part of the next round that has accrued since the last one landed. Linear across the
  // interval rather than a true fractional power: it agrees with the exponential at both ends
  // of every interval, the gap between is smaller than a token's dust, and it needs no
  // fractional exponentiation in bigint to work it out.
  const interval = intervalOf(schedule);
  const into = (at - airdrop.startsAt) % interval;
  if (into <= 0) return settled;

  const next = roundRelease(airdrop.reserve, schedule.rateBps, rounds + 1);
  return settled + (next * BigInt(into)) / BigInt(interval);
}

/**
 * Roughly what accrues over the next `seconds`, at the rate it is going now.
 *
 * For copy like "about 28,000 an hour", never for anything anyone is owed. It reads the
 * current round's size, and every round is smaller than the one before it, so the real figure
 * over a long window is always a little less than this says.
 */
export function accrualOver(airdrop: Dripping, nowSeconds: number, seconds: number): bigint {
  const {schedule} = airdrop;
  if (!schedule || nowSeconds < airdrop.startsAt) return 0n;
  const next = nextRoundRelease(airdrop, nowSeconds);
  if (next <= 0n) return 0n;
  return (next * BigInt(Math.max(0, Math.floor(seconds)))) / BigInt(intervalOf(schedule));
}

/** What the schedule is still holding back. */
export function heldBack(airdrop: Dripping, nowSeconds: number): bigint {
  return airdrop.reserve - releasedBy(airdrop, nowSeconds);
}

/** When the next round pays out, or null when nothing more ever will. */
export function nextRoundAt(airdrop: Dripping, nowSeconds: number): number | null {
  const {schedule} = airdrop;
  if (!schedule) return null;
  if (airdrop.stoppedAt !== undefined) return null;
  if (nowSeconds < airdrop.startsAt) return airdrop.startsAt;

  const done = roundsElapsed(airdrop, nowSeconds);
  if (schedule.maxRounds && schedule.maxRounds > 0 && done >= schedule.maxRounds) return null;
  // Nothing left to take a percentage of.
  if (reserveAfter(airdrop.reserve, schedule.rateBps, done) <= 0n) return null;

  return airdrop.startsAt + done * intervalOf(schedule);
}

/** What the next round will hand out, or zero when there is no next round. */
export function nextRoundRelease(airdrop: Dripping, nowSeconds: number): bigint {
  if (!airdrop.schedule || nextRoundAt(airdrop, nowSeconds) === null) return 0n;
  return roundRelease(airdrop.reserve, airdrop.schedule.rateBps, roundsElapsed(airdrop, nowSeconds) + 1);
}

/** True once the schedule will never release anything again. */
export function dripFinished(airdrop: Dripping, nowSeconds: number): boolean {
  return Boolean(airdrop.schedule) && nextRoundAt(airdrop, nowSeconds) === null;
}

export interface DripRound {
  /** 1-indexed. Round 1 is the one at startsAt. */
  round: number;
  at: number;
  /** What this round hands out. */
  release: bigint;
  /** Cumulative released once this round has paid. */
  released: bigint;
  /** Still held back once this round has paid. */
  remaining: bigint;
}

/** A window of the schedule, for showing someone what they are actually signing up to. */
export function dripRounds(airdrop: Dripping, fromRound: number, count: number): DripRound[] {
  const {schedule} = airdrop;
  if (!schedule) return [];

  const interval = intervalOf(schedule);
  const cap = schedule.maxRounds && schedule.maxRounds > 0 ? schedule.maxRounds : Infinity;
  const first = Math.max(1, Math.floor(fromRound));
  const out: DripRound[] = [];

  for (let round = first; round < first + count && round <= cap; round += 1) {
    const remaining = reserveAfter(airdrop.reserve, schedule.rateBps, round);
    const release = reserveAfter(airdrop.reserve, schedule.rateBps, round - 1) - remaining;
    // A round that hands out nothing is past the end of the schedule, not part of it.
    if (release <= 0n) break;
    out.push({
      round,
      at: airdrop.startsAt + (round - 1) * interval,
      release,
      released: airdrop.reserve - remaining,
      remaining,
    });
  }
  return out;
}

/**
 * How many rounds it takes to hand out `shareBps` of the reserve.
 *
 * Reserve-independent, because `(1 - r)^n <= 1 - share` has no reserve in it. This is the one
 * function here in floating point: it answers "this runs for about a day" in a sentence, and
 * nothing is owed on the back of it.
 */
export function roundsToRelease(rateBps: number, shareBps: number): number {
  const rate = clampRate(rateBps) / BPS;
  if (rate <= 0) return Infinity;
  if (rate >= 1) return 1;
  const share = Math.min(0.999_999, Math.max(0, shareBps / BPS));
  return Math.max(1, Math.ceil(Math.log(1 - share) / Math.log(1 - rate)));
}

/** How long, in seconds, until `shareBps` of the reserve has gone out. */
export function timeToRelease(schedule: AirdropSchedule, shareBps: number): number {
  const rounds = roundsToRelease(schedule.rateBps, shareBps);
  return Number.isFinite(rounds) ? (rounds - 1) * intervalOf(schedule) : Infinity;
}

/* ---------------------------------------------------------------- wording ---- */

/** "every 10 minutes", "every hour", "every 3 days". The sentence form. */
export function describeInterval(seconds: number): string {
  const total = Math.max(MIN_INTERVAL_SECONDS, Math.floor(seconds));
  if (total % (7 * DAY_SECONDS) === 0) {
    const weeks = total / (7 * DAY_SECONDS);
    return weeks === 1 ? "every week" : `every ${weeks} weeks`;
  }
  if (total % DAY_SECONDS === 0) {
    const days = total / DAY_SECONDS;
    return days === 1 ? "every day" : `every ${days} days`;
  }
  if (total % HOUR_SECONDS === 0) {
    const hours = total / HOUR_SECONDS;
    return hours === 1 ? "every hour" : `every ${hours} hours`;
  }
  const minutes = Math.round(total / MINUTE_SECONDS);
  return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
}

/** "10m", "1h", "7d". The chip form, for a card that has no room for a sentence. */
export function shortInterval(seconds: number): string {
  const total = Math.max(MIN_INTERVAL_SECONDS, Math.floor(seconds));
  if (total % DAY_SECONDS === 0) return `${total / DAY_SECONDS}d`;
  if (total % HOUR_SECONDS === 0) return `${total / HOUR_SECONDS}h`;
  return `${Math.round(total / MINUTE_SECONDS)}m`;
}

/** 500 becomes "5%", 250 becomes "2.5%", 25 becomes "0.25%". */
export function formatRate(bps: number): string {
  return `${(clampRate(bps) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * "5", "5%", "2.5" to basis points.
 *
 * Two decimal places is the floor, because that is what a basis point is. Anything finer is
 * rejected rather than silently rounded: a rate that is not the rate someone typed is the
 * sort of difference nobody notices until a round pays out wrong.
 */
export function parseRateBps(input: string): number | null {
  const text = input.trim().replace(/%\s*$/, "").replace(/,/g, "");
  if (text === "" || text === "." || !/^\d*\.?\d*$/.test(text)) return null;

  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > 2) return null;
  const bps = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isFinite(bps) ? bps : null;
}

/* ------------------------------------------------------------- validation ---- */

/** Why this schedule cannot be used, or null when it can. Enforced, not merely displayed. */
export function scheduleProblem(schedule: AirdropSchedule): string | null {
  if (!Number.isFinite(schedule.rateBps) || schedule.rateBps < MIN_RATE_BPS) {
    return "Each round has to hand out at least 0.01%.";
  }
  if (schedule.rateBps > MAX_RATE_BPS) return "A round cannot hand out more than 100%.";
  if (!Number.isFinite(schedule.intervalSeconds) || schedule.intervalSeconds < MIN_INTERVAL_SECONDS) {
    return "Rounds cannot be closer together than a minute.";
  }
  if (schedule.intervalSeconds > MAX_INTERVAL_SECONDS) return "Rounds cannot be more than a year apart.";
  if (schedule.maxRounds !== undefined) {
    if (!Number.isInteger(schedule.maxRounds) || schedule.maxRounds < 1) {
      return "Stop after has to be a whole number of rounds, or be left empty.";
    }
    if (schedule.maxRounds > MAX_ROUNDS_LIMIT) return "That is more rounds than this can schedule.";
  }
  return null;
}

/* ---------------------------------------------------------------- presets ---- */

export const INTERVAL_PRESETS: ReadonlyArray<{label: string; seconds: number}> = [
  {label: "10 minutes", seconds: 10 * MINUTE_SECONDS},
  {label: "30 minutes", seconds: 30 * MINUTE_SECONDS},
  {label: "Hourly", seconds: HOUR_SECONDS},
  {label: "6 hours", seconds: 6 * HOUR_SECONDS},
  {label: "Daily", seconds: DAY_SECONDS},
  {label: "Weekly", seconds: 7 * DAY_SECONDS},
];

export const RATE_PRESETS: readonly number[] = [100, 250, 500, 1_000, 2_500];

export const DEFAULT_SCHEDULE: AirdropSchedule = {rateBps: 500, intervalSeconds: 10 * MINUTE_SECONDS};
