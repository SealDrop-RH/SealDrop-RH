import {activeChainId} from "@/lib/chain";
import {seeded, rangeInt} from "@/lib/strip/rng";
import {lockId} from "./id";
import {deriveState} from "./derive";
import type {Address, Hash, Lock, TokenMeta} from "./types";

/**
 * The part 1 data set.
 *
 * Generated from a constant seed by pure functions, so the server and the browser produce
 * byte-identical output. That is what lets /proof/[id] be a real server component with a
 * working share image before any contract exists.
 *
 * "Pons" is Latin for bridge, so the family reads as bridge components. Two real siblings
 * are included at their actual addresses.
 */

const TOKENS: ReadonlyArray<Omit<TokenMeta, "totalSupply"> & {supplyUnits: bigint}> = [
  {symbol: "SPAN", name: "Span", address: "0x4A1F9c2E7b58d0AE36c1b77De5490FBA2C81D306", decimals: 18, supplyUnits: 1_000_000_000n},
  {symbol: "ARCH", name: "Arch", address: "0x9e3B07aC1d642f8B5C0a9e37B1fD8265eA470C19", decimals: 18, supplyUnits: 250_000_000n},
  {symbol: "PIER", name: "Pier", address: "0x2C76b4ED3A91F805C6e2178dbB0439Fa1e6D5824", decimals: 18, supplyUnits: 84_000_000n},
  {symbol: "DECK", name: "Deck", address: "0xb05FA1c93e7284d6B1fc07e9a3D5862Bc1470FEd", decimals: 18, supplyUnits: 1_000_000_000n},
  {symbol: "TRUSS", name: "Truss", address: "0x6df28ac509E14B7302AbD5F19c48e0A7361Bc9d5", decimals: 18, supplyUnits: 420_690_000n},
  {symbol: "KEEL", name: "Keel", address: "0xF32c0B8e5A7146DE29B0fc4718Ad6539Be21C470", decimals: 9, supplyUnits: 12_000_000n},
  {symbol: "CAISSON", name: "Caisson", address: "0x71be4D09ac3F582610bc7ed4A19F8c05D2736bA8", decimals: 18, supplyUnits: 5_000_000n},
  {symbol: "CABLE", name: "Cable", address: "0xDa9317Fc50E8b2416AE7304Cb61f0592dB78C3E1", decimals: 18, supplyUnits: 777_000_000n},
  {symbol: "LINTEL", name: "Lintel", address: "0x38c1E7B0Ad59f642bc8073E1Fa2c9560db47a81f", decimals: 18, supplyUnits: 100_000_000n},
  {symbol: "ABUT", name: "Abutment", address: "0xCe07B31fa8452D90c6b13ED748a05F2916CD3b74", decimals: 18, supplyUnits: 64_000_000n},
  // The two real ones. $BOARD's address is the live contract from pons-board.
  {symbol: "BOARD", name: "Pons Board", address: "0xF6b2A3258C7F8B839b7903f49FF31753cf84B0cf", decimals: 18, supplyUnits: 1_000_000_000n},
  {symbol: "GEMS", name: "Chest Rewards", address: "0x5d3F9E02aC718b4610DF9c3782bE05416aC79d2b", decimals: 18, supplyUnits: 500_000_000n},
];

const OWNERS: readonly Address[] = [
  "0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0",
  "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42",
  "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
];

const NOTES: readonly (string | undefined)[] = [
  "Team allocation, locked through launch.",
  undefined,
  "Liquidity, not going anywhere.",
  undefined,
  "Treasury reserve.",
  undefined,
  undefined,
  "Locked after the community vote.",
];

const DAY = 86_400;
/** Two locks per token, so a token's page has more than one row and shares must add up. */
const LOCKS_PER_TOKEN = 2;
const COUNT = TOKENS.length * LOCKS_PER_TOKEN;

/**
 * Dates are offsets from today, not absolute constants.
 *
 * An earlier version pinned them to a fixed epoch, and as real time passed the whole set
 * drifted: by the time anyone looked, most of it had quietly become unlockable and the
 * spread the fixtures existed to demonstrate was gone. Offsets keep the shape stable
 * forever.
 *
 * The anchor is the start of the current UTC day rather than the current second, so a
 * server render and the browser render that follows it agree. They can only disagree
 * across a midnight boundary, and the next render corrects it.
 */
function anchorDay(nowSeconds: number): number {
  return Math.floor(nowSeconds / DAY) * DAY;
}

/** Deliberate spread, so every state and every corner of the strip's range is reachable. */
const PLAN: ReadonlyArray<{unlockInDays: number; withdrawn?: boolean}> = [
  {unlockInDays: 3},
  {unlockInDays: 14},
  {unlockInDays: 31},
  {unlockInDays: -9}, // already unlockable
  {unlockInDays: 74},
  {unlockInDays: 120},
  {unlockInDays: 186},
  {unlockInDays: -21, withdrawn: true}, // unlocked, then taken back out
  {unlockInDays: 240},
  {unlockInDays: 305},
  {unlockInDays: 365},
  {unlockInDays: -2}, // just became unlockable
  {unlockInDays: 400},
  {unlockInDays: 480},
  {unlockInDays: 548},
  {unlockInDays: 610},
  {unlockInDays: 700},
  {unlockInDays: 730},
  {unlockInDays: 820},
  {unlockInDays: 900},
  {unlockInDays: 1000},
  {unlockInDays: 1100},
  {unlockInDays: 1300},
  {unlockInDays: 1460},
];

function token(index: number): TokenMeta {
  const base = TOKENS[index % TOKENS.length];
  return {
    address: base.address,
    symbol: base.symbol,
    name: base.name,
    decimals: base.decimals,
    totalSupply: base.supplyUnits * 10n ** BigInt(base.decimals),
  };
}

function fakeHash(seed: string): Hash {
  // Shaped like a real hash but derived from the seed, so a fixture's transaction reference
  // is stable. It is never rendered as a working link while the lock is simulated.
  const random = seeded(`hash:${seed}`);
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += "0123456789abcdef"[Math.floor(random() * 16)];
  return out as Hash;
}

/**
 * How much of each token is locked in total, and how that total splits between its two
 * locks. Written out rather than drawn from the seeded generator, for two reasons.
 *
 * A token's locks have to sum to no more than its whole supply. Locking 140% of a token is
 * not a thing that can happen, and a fixture set implying it teaches the wrong arithmetic.
 *
 * And the set exists to exercise the strip across its full range, which means something
 * near 90% and something near 3% have to be present by construction. Leaving that to chance
 * produced a set where every lock sat between 20% and 36% and the interesting ends were
 * never drawn at all.
 */
const TOKEN_BUDGET: ReadonlyArray<{total: number; firstShare: number}> = [
  {total: 0.94, firstShare: 0.96}, // 90.2% in one lock: the top of the strip's range
  {total: 0.88, firstShare: 0.62},
  {total: 0.72, firstShare: 0.55},
  {total: 0.61, firstShare: 0.7},
  {total: 0.55, firstShare: 0.5},
  {total: 0.47, firstShare: 0.8},
  {total: 0.41, firstShare: 0.45},
  {total: 0.33, firstShare: 0.66},
  {total: 0.27, firstShare: 0.58},
  {total: 0.19, firstShare: 0.74},
  {total: 0.12, firstShare: 0.5},
  {total: 0.08, firstShare: 0.62}, // 3.0% in the smaller lock: the bottom of the range
];

function tokenBudget(tokenIndex: number): number[] {
  const {total, firstShare} = TOKEN_BUDGET[tokenIndex % TOKEN_BUDGET.length];
  return [total * firstShare, total * (1 - firstShare)];
}

function build(nowSeconds: number): Lock[] {
  const day = anchorDay(nowSeconds);
  const locks: Lock[] = [];

  for (let i = 0; i < COUNT; i += 1) {
    const tokenIndex = i % TOKENS.length;
    const slot = Math.floor(i / TOKENS.length);
    const meta = token(tokenIndex);
    const random = seeded(`pons-lock-fixture:${i}`);

    const share = tokenBudget(tokenIndex)[slot];
    const amount = (meta.totalSupply * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;

    const plan = PLAN[i];
    const unlockAt = day + plan.unlockInDays * DAY;

    /**
     * When the lock was created, spread across the past two years.
     *
     * Derived from `day` rather than by subtracting an offset from `unlockAt`. The earlier
     * version did the latter and then clamped the result to "at most yesterday", which
     * collapsed every long-dated lock onto the same creation date: subtract 300 days from an
     * unlock four years out and you are still in the future, so the clamp caught all of them.
     * The activity chart on the landing page drew that as a single column, which is exactly
     * what a degenerate distribution should look like and not at all what the data meant.
     */
    const created = day - rangeInt(random, 8, 700) * DAY;
    // A lock cannot start after it ends. For the few already-unlockable entries the plan
    // puts in the past, back the creation date up behind them instead.
    const lockedAt = created < unlockAt ? created : unlockAt - rangeInt(random, 14, 180) * DAY;
    const withdrawnAt = plan.withdrawn ? unlockAt + 2 * DAY : undefined;
    const seed = `${meta.symbol}:${i}`;

    locks.push({
      id: lockId(seed),
      owner: OWNERS[i % OWNERS.length],
      token: meta,
      amount,
      lockedAt,
      unlockAt,
      txHash: fakeHash(seed),
      chainId: activeChainId,
      state: deriveState({unlockAt, withdrawnAt}, nowSeconds),
      withdrawnAt,
      note: NOTES[i % NOTES.length],
      simulated: true,
    });
  }

  return locks;
}

/**
 * The fixture set, with state derived against the supplied clock.
 *
 * Cached per anchor day so repeated calls inside one render return the identical array
 * rather than rebuilding it, and so a page of 24 cards does not regenerate the set 24 times.
 */
let cached: {day: number; locks: readonly Lock[]} | null = null;

export function fixtureLocks(nowSeconds: number): Lock[] {
  const day = anchorDay(nowSeconds);
  if (!cached || cached.day !== day) cached = {day, locks: build(nowSeconds)};
  return cached.locks.map((lock) => ({...lock, state: deriveState(lock, nowSeconds)}));
}

export function fixtureTokens(): TokenMeta[] {
  return TOKENS.map((_, i) => token(i));
}
