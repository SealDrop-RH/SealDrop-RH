import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

/**
 * The chain adapter's page reads, against a scripted RPC.
 *
 * These pin the fix for the home page going down to the error boundary: seven failed renders
 * in thirty seconds, every one a latestLocks call the RPC answered with something viem could
 * not match up. The properties that matter are easy to get subtly wrong with a promise cache,
 * so each one is stated as its own test rather than trusted.
 */

const mocks = vi.hoisted(() => ({latestLocks: vi.fn()}));

vi.mock("@/lib/contracts/addresses", () => ({
  deploymentFor: () => ({PonsLock: "0x00000000000000000000000000000000000000cc"}),
}));

vi.mock("@/lib/locks/client", () => ({
  readClient: () => ({
    readContract: async ({functionName}: {functionName: string}) => {
      if (functionName === "latestLocks") return mocks.latestLocks();
      const token: Record<string, unknown> = {symbol: "TKN", name: "Token", decimals: 18, totalSupply: 1_000n};
      return token[functionName];
    },
  }),
}));

const T0 = Date.UTC(2026, 8, 16, 12, 0, 0);
const TOKEN = "0x00000000000000000000000000000000000000aa";
const OWNER = "0x00000000000000000000000000000000000000bb";
const page = (count: number) => [
  Array.from({length: count}, () => ({
    owner: OWNER,
    token: TOKEN,
    amount: 10n,
    lockedAt: 1n,
    unlockAt: 9_999_999_999n,
    withdrawnAt: 0n,
  })),
  BigInt(count),
];

/** A fresh module, so the page cache from one test cannot leak into the next. */
async function freshAdapter() {
  vi.resetModules();
  return (await import("@/lib/locks/chain")).chainAdapter;
}

beforeEach(() => {
  mocks.latestLocks.mockReset();
  // Only Date: the cache reads the clock, and faking timers too would stall promise resolution.
  vi.useFakeTimers({toFake: ["Date"]});
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("page reads", () => {
  it("make one RPC call for the two reads a single render fires together", async () => {
    mocks.latestLocks.mockResolvedValue(page(3));
    const adapter = await freshAdapter();

    // Exactly what the register and the dashboard do on every request.
    await Promise.all([adapter.stats(), adapter.listLocks({limit: 100})]);

    expect(mocks.latestLocks).toHaveBeenCalledTimes(1);
  });

  it("share a read inside the window and read again after it", async () => {
    mocks.latestLocks.mockResolvedValue(page(3));
    const adapter = await freshAdapter();

    await adapter.stats();
    vi.setSystemTime(T0 + 10_000);
    await adapter.stats();
    expect(mocks.latestLocks).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 16_000);
    await adapter.stats();
    expect(mocks.latestLocks).toHaveBeenCalledTimes(2);
  });

  it("fall back to the last good read when the RPC fails, instead of throwing", async () => {
    const adapter = await freshAdapter();

    mocks.latestLocks.mockResolvedValueOnce(page(3));
    const good = await adapter.stats();

    vi.setSystemTime(T0 + 20_000);
    mocks.latestLocks.mockRejectedValueOnce(
      new TypeError("Cannot read properties of undefined (reading 'error')"),
    );
    const afterFailure = await adapter.stats();

    expect(afterFailure.lockCount).toBe(good.lockCount);
  });

  it("report the time the fallback was actually read, not the time it was served", async () => {
    const adapter = await freshAdapter();

    mocks.latestLocks.mockResolvedValueOnce(page(3));
    const good = await adapter.stats();

    vi.setSystemTime(T0 + 20_000);
    mocks.latestLocks.mockRejectedValueOnce(new Error("rpc hiccup"));
    const afterFailure = await adapter.stats();

    // The snapshot on the page must not claim twenty-second-old data is current.
    expect(afterFailure.asOf).toBe(good.asOf);
    expect(afterFailure.asOf).toBe(Math.floor(T0 / 1000));
  });

  it("never cache a failure: the very next call tries the chain again", async () => {
    const adapter = await freshAdapter();

    mocks.latestLocks.mockRejectedValueOnce(new Error("rpc down"));
    await expect(adapter.stats()).rejects.toThrow("rpc down");

    // Same instant, well inside the window. A cached failure would throw again here.
    mocks.latestLocks.mockResolvedValueOnce(page(2));
    await expect(adapter.stats()).resolves.toMatchObject({lockCount: 2});
    expect(mocks.latestLocks).toHaveBeenCalledTimes(2);
  });

  it("still throw when there is no earlier read to fall back to", async () => {
    const adapter = await freshAdapter();
    mocks.latestLocks.mockRejectedValueOnce(new Error("rpc down"));
    await expect(adapter.stats()).rejects.toThrow("rpc down");
  });

  it("stop falling back once the last good read is too old to be honest", async () => {
    const adapter = await freshAdapter();

    mocks.latestLocks.mockResolvedValueOnce(page(3));
    await adapter.stats();

    vi.setSystemTime(T0 + 11 * 60_000);
    mocks.latestLocks.mockRejectedValueOnce(new Error("rpc down"));
    await expect(adapter.stats()).rejects.toThrow("rpc down");
  });
});
