import {describe, expect, it} from "vitest";
import {fixtureLocks, fixtureTokens} from "@/lib/locks/fixtures";
import {lockedShare} from "@/lib/format";
import {lockId} from "@/lib/locks/id";
import {isAddress} from "viem";
import {normaliseAddress} from "@/lib/locks/parse";

const NOW = 1_760_000_000;

describe("fixtures", () => {
  const locks = fixtureLocks(NOW);

  it("produces a set big enough to fill a page", () => {
    expect(locks.length).toBe(24);
  });

  /**
   * The whole reason fixtures are generated from a constant seed rather than randomly: a
   * server component and the browser build the same array, so a proof page server-renders
   * and its share image matches what the page shows.
   */
  it("is identical across calls, which is what lets the server and the browser agree", () => {
    const again = fixtureLocks(NOW);
    expect(JSON.stringify(again, (_, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(
      JSON.stringify(locks, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    );
  });

  it("has no id collisions", () => {
    expect(new Set(locks.map((l) => l.id)).size).toBe(locks.length);
  });

  it("gives every id the recognisable prefix", () => {
    for (const lock of locks) expect(lock.id).toMatch(/^pl_[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it("never locks more than the supply, and never locks nothing", () => {
    for (const lock of locks) {
      expect(lock.amount).toBeGreaterThan(0n);
      expect(lock.amount).toBeLessThanOrEqual(lock.token.totalSupply);
    }
  });

  it("spreads locked share across the range the strip has to draw", () => {
    const shares = locks.map((l) => lockedShare(l.amount, l.token.totalSupply));
    expect(Math.min(...shares)).toBeLessThan(0.15);
    expect(Math.max(...shares)).toBeGreaterThan(0.85);
  });

  /** Every pill has to be reachable in /explore without waiting for a date to pass. */
  it("covers every lock state", () => {
    const states = new Set(locks.map((l) => l.state));
    expect(states).toContain("active");
    expect(states).toContain("unlockable");
    expect(states).toContain("withdrawn");
  });

  it("marks every fixture as simulated", () => {
    for (const lock of locks) expect(lock.simulated).toBe(true);
  });

  it("never dates a lock as unlocking before it was locked, unless it was withdrawn", () => {
    for (const lock of locks) {
      if (lock.withdrawnAt === undefined) expect(lock.unlockAt).toBeGreaterThan(lock.lockedAt);
    }
  });

  it("uses distinct tokens with plausible supplies", () => {
    const tokens = fixtureTokens();
    expect(new Set(tokens.map((t) => t.address.toLowerCase())).size).toBe(tokens.length);
    for (const token of tokens) expect(token.totalSupply).toBeGreaterThan(0n);
  });
});

describe("lockId", () => {
  it("is stable for the same seed and different for different ones", () => {
    expect(lockId("a")).toBe(lockId("a"));
    expect(lockId("a")).not.toBe(lockId("b"));
  });
});

describe("fixture arithmetic", () => {
  const locks = fixtureLocks(NOW);

  /**
   * The bug this pins: shares were drawn independently per lock, so two locks on one token
   * could add up past its entire supply and /explore proudly reported "102.3% average".
   */
  it("never locks more than a token's whole supply across all its locks", () => {
    const byToken = new Map<string, bigint>();
    const supply = new Map<string, bigint>();
    for (const lock of locks) {
      const key = lock.token.address.toLowerCase();
      byToken.set(key, (byToken.get(key) ?? 0n) + lock.amount);
      supply.set(key, lock.token.totalSupply);
    }
    for (const [key, locked] of byToken) {
      expect(locked, `${key} locks more than its supply`).toBeLessThanOrEqual(supply.get(key) as bigint);
    }
  });

  /**
   * And this one: dates were pinned to a fixed epoch, so as real time passed the set drifted
   * until almost everything had become unlockable and the intended spread was gone.
   */
  it("keeps its shape as real time passes", () => {
    const YEAR = 365 * 86_400;
    for (const at of [NOW, NOW + YEAR, NOW + 5 * YEAR, NOW + 20 * YEAR]) {
      const set = fixtureLocks(at);
      const active = set.filter((l) => l.state === "active").length;
      const unlockable = set.filter((l) => l.state === "unlockable").length;
      const withdrawn = set.filter((l) => l.state === "withdrawn").length;
      expect(active, `active at ${at}`).toBeGreaterThanOrEqual(15);
      expect(unlockable, `unlockable at ${at}`).toBe(2);
      expect(withdrawn, `withdrawn at ${at}`).toBe(1);
    }
  });

  it("never dates a lock as starting in the future", () => {
    for (const lock of fixtureLocks(NOW)) expect(lock.lockedAt).toBeLessThan(NOW);
  });
});

describe("fixture addresses", () => {
  /**
   * viem's isAddress validates the EIP-55 checksum, so a hand-typed address with the wrong
   * capitalisation is rejected by the form's own validator. Eleven of the twelve fixture
   * tokens were exactly that, which made every one of them unresolvable: the sample data
   * could not be used against the product it was sample data for.
   */
  it("are all valid EIP-55 checksums, or the form cannot resolve its own fixtures", () => {
    for (const lock of fixtureLocks(NOW)) {
      expect(isAddress(lock.token.address), `token ${lock.token.symbol}: ${lock.token.address}`).toBe(true);
      expect(isAddress(lock.owner), `owner ${lock.owner}`).toBe(true);
    }
    for (const token of fixtureTokens()) {
      expect(isAddress(token.address), `${token.symbol}: ${token.address}`).toBe(true);
    }
  });

  it("round-trips every address through normaliseAddress, which is what the form uses", () => {
    for (const token of fixtureTokens()) {
      expect(normaliseAddress(token.address)).toBe(token.address);
    }
  });
});

describe("fixture creation dates", () => {
  /**
   * The bug this pins: lockedAt was `unlockAt` minus an offset, clamped to "at most
   * yesterday". Subtracting 300 days from an unlock four years out is still in the future,
   * so the clamp caught every long-dated lock and collapsed them onto one date. The landing
   * page's activity chart drew that as a single column.
   */
  it("spreads creation dates instead of collapsing them onto one day", () => {
    const days = fixtureLocks(NOW).map((lock) => Math.floor(lock.lockedAt / 86_400));
    const distinct = new Set(days).size;
    expect(distinct, `only ${distinct} distinct creation days across 24 locks`).toBeGreaterThan(14);

    // And no single day may hold a quarter of the set, which is what made the chart one bar.
    const counts = new Map<number, number>();
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(5);
  });
});
