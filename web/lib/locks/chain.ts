import {erc20Abi} from "viem";
import {activeChainId} from "@/lib/chain";
import {lockedShare} from "@/lib/format";
import {ponsLockAbi} from "@/lib/contracts/PonsLock";
import {deploymentFor} from "@/lib/contracts/addresses";
import {readClient} from "./client";
import {toLockId, parseLockIndex} from "./chain-ids";
import {deriveState} from "./derive";
import {NotImplementedError} from "./errors";
import type {
  Address,
  CreateLockInput,
  Lock,
  LockFilter,
  LockId,
  LockStats,
  LocksAdapter,
  Page,
  TokenMeta,
  TxHooks,
} from "./types";

/**
 * Locks, read from and written to PonsLock.
 *
 * The same LocksAdapter the mock implements, so nothing above this file changes: swapping
 * NEXT_PUBLIC_LOCKS_ADAPTER to "chain" is the whole migration. Writes arrive through the
 * WriteBridge because this is a plain module and cannot call wagmi hooks, which is the
 * reason that port exists.
 */

/** The struct PonsLock returns, before it is turned into the app's Lock. */
interface OnChainLock {
  owner: Address;
  token: Address;
  amount: bigint;
  lockedAt: bigint;
  unlockAt: bigint;
  withdrawnAt: bigint;
}

function contract() {
  const deployment = deploymentFor(activeChainId);
  if (!deployment) {
    throw new NotImplementedError(
      `PonsLock is not deployed on chain ${activeChainId}. Run the deploy script and export the addresses`,
    );
  }
  return deployment.PonsLock;
}

/** Token metadata is immutable, so one read per token per page load is enough. */
const tokenCache = new Map<string, TokenMeta>();

async function readToken(address: Address): Promise<TokenMeta | null> {
  const key = address.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit) return hit;

  try {
    const client = readClient();
    const [symbol, name, decimals, totalSupply] = await Promise.all([
      client.readContract({address, abi: erc20Abi, functionName: "symbol"}),
      client.readContract({address, abi: erc20Abi, functionName: "name"}),
      client.readContract({address, abi: erc20Abi, functionName: "decimals"}),
      client.readContract({address, abi: erc20Abi, functionName: "totalSupply"}),
    ]);
    const meta: TokenMeta = {address, symbol, name, decimals, totalSupply};
    tokenCache.set(key, meta);
    return meta;
  } catch {
    // Not an ERC-20, or not deployed on this chain. The form shows "no token found" rather
    // than an error, because a mistyped address is the overwhelmingly likely cause.
    return null;
  }
}

async function toLock(index: bigint, raw: OnChainLock, nowSeconds: number): Promise<Lock | null> {
  const token = await readToken(raw.token);
  if (!token) return null;

  const withdrawnAt = Number(raw.withdrawnAt);
  return {
    id: toLockId(index),
    owner: raw.owner,
    token,
    amount: raw.amount,
    lockedAt: Number(raw.lockedAt),
    unlockAt: Number(raw.unlockAt),
    // PonsLock stores no transaction hash: the lock is identified by its index, and the
    // creating transaction is found from the Locked event. Filled in by the indexer when
    // there is one; until then the proof page links to the contract rather than a tx.
    txHash: "0x",
    chainId: activeChainId,
    state: deriveState({unlockAt: Number(raw.unlockAt), withdrawnAt: withdrawnAt || undefined}, nowSeconds),
    withdrawnAt: withdrawnAt || undefined,
    simulated: false,
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

interface PageRead {
  locks: Lock[];
  total: number;
  /** Unix seconds at which the chain was actually read, which is not always "now". */
  readAt: number;
}

/** Reads a window of locks, newest first, and resolves each one's token. */
async function readPageFromChain(offset: number, limit: number): Promise<PageRead> {
  const [page, total] = (await readClient().readContract({
    address: contract(),
    abi: ponsLockAbi,
    functionName: "latestLocks",
    args: [BigInt(offset), BigInt(limit)],
  })) as [readonly OnChainLock[], bigint];

  const now = nowSeconds();
  const first = Number(total) - 1 - offset;
  const resolved = await Promise.all(
    page.map((raw, i) => toLock(BigInt(first - i), raw as OnChainLock, now)),
  );
  // A lock whose token does not answer is dropped rather than rendered half-blank.
  return {
    locks: resolved.filter((lock): lock is Lock => lock !== null),
    total: Number(total),
    readAt: now,
  };
}

/**
 * How long a page read is shared, and how old a read may be before it stops being a fallback.
 *
 * The register and the dashboard each ask for the same window twice per render, once for the
 * totals and once for the list, and both fire together. Without sharing, every page view was
 * two identical latestLocks calls plus the token reads behind them, so a handful of visitors
 * arriving at once multiplied into a burst against a public RPC. That is the shape of the
 * outage these were added for: seven failed renders of the home page inside thirty seconds.
 *
 * Fifteen seconds is short enough that nobody sees a lock they just made go missing for long,
 * and long enough to turn a burst into one read. Ten minutes is how stale a register is
 * allowed to be before showing it would be less honest than showing the error.
 */
const PAGE_TTL_MS = 15_000;
const MAX_STALE_MS = 10 * 60_000;

const pageReads = new Map<string, {promise: Promise<PageRead>; startedAt: number}>();
const lastGood = new Map<string, PageRead>();

/**
 * A page read, shared across concurrent and closely spaced callers, that survives a failed RPC.
 *
 * Three behaviours, each earning its place:
 *
 *   - Calls for the same window within the TTL share one promise. That includes the two that
 *     fire together inside a single render, so the duplication is gone even with no traffic.
 *   - A failure is never cached. The entry is dropped the moment the read rejects, so the very
 *     next request tries the chain again rather than being handed the same error for fifteen
 *     seconds, and the page recovers as soon as the RPC does.
 *   - A failure falls back to the last read that succeeded, if it is recent. The RPC this
 *     reads from can reply to a batch with something viem cannot match up, which surfaces as
 *     "Cannot read properties of undefined (reading 'error')" and is not retried, so a
 *     transient hiccup used to take the whole page down to the error boundary. Now it shows
 *     data a few seconds old instead, and readAt carries the true age, so the snapshot time
 *     on the page says so rather than claiming the data is current.
 *
 * The cache lives in module scope and so is per server instance. A cold instance has no
 * fallback, and a failing read there still throws; a dedicated RPC is the fix for that case.
 */
async function readPage(offset: number, limit: number): Promise<PageRead> {
  const key = `${offset}:${limit}`;
  const shared = pageReads.get(key);
  if (shared && Date.now() - shared.startedAt < PAGE_TTL_MS) return shared.promise;

  const promise = readPageFromChain(offset, limit).then(
    (read) => {
      lastGood.set(key, read);
      return read;
    },
    (error: unknown) => {
      pageReads.delete(key);
      const fallback = lastGood.get(key);
      if (fallback && Date.now() - fallback.readAt * 1000 < MAX_STALE_MS) return fallback;
      throw error;
    },
  );

  pageReads.set(key, {promise, startedAt: Date.now()});
  return promise;
}

function applyFilter(locks: Lock[], filter: LockFilter): Lock[] {
  let items = locks;
  if (filter.owner) {
    const owner = filter.owner.toLowerCase();
    items = items.filter((lock) => lock.owner.toLowerCase() === owner);
  }
  if (filter.token) {
    const token = filter.token.toLowerCase();
    items = items.filter((lock) => lock.token.address.toLowerCase() === token);
  }
  if (filter.state && filter.state !== "all") {
    items = items.filter((lock) => lock.state === filter.state);
  }

  const sort = filter.sort ?? "newest";
  return [...items].sort((a, b) => {
    if (sort === "unlocking-soon") {
      const aOpen = a.state === "active";
      const bOpen = b.state === "active";
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return a.unlockAt - b.unlockAt;
    }
    if (sort === "largest-share") {
      return lockedShare(b.amount, b.token.totalSupply) - lockedShare(a.amount, a.token.totalSupply);
    }
    return b.lockedAt - a.lockedAt;
  });
}

export const chainAdapter: LocksAdapter = {
  kind: "chain",
  needsBridge: true,

  async getLock(id) {
    const index = parseLockIndex(id);
    // An id the mock produced, carried over in a bookmark. Not found, rather than parsed
    // into something and used to read a different lock.
    if (index === null) return null;

    try {
      const raw = (await readClient().readContract({
        address: contract(),
        abi: ponsLockAbi,
        functionName: "getLock",
        args: [index],
      })) as OnChainLock;
      return toLock(index, raw, nowSeconds());
    } catch {
      // NoSuchLock, which is a 404 rather than a failure.
      return null;
    }
  },

  async listLocks(filter = {}): Promise<Page<Lock>> {
    const limit = filter.limit ?? 24;
    const offset = filter.cursor ? Number(filter.cursor) : 0;

    // Filtering and sorting happen here rather than on chain, so the window is read a little
    // wider than the page being shown. A real index is part 3's job; this is correct and
    // fine at the sizes a single chain page reaches.
    const {locks, total} = await readPage(offset, Math.min(200, limit * 4));
    const filtered = applyFilter(locks, filter);
    const nextOffset = offset + Math.min(200, limit * 4);

    return {
      items: filtered.slice(0, limit),
      total,
      nextCursor: nextOffset < total ? String(nextOffset) : undefined,
    };
  },

  async listLocksByOwner(owner, filter = {}) {
    const ids = (await readClient().readContract({
      address: contract(),
      abi: ponsLockAbi,
      functionName: "lockIdsByOwner",
      args: [owner],
    })) as readonly bigint[];

    const now = nowSeconds();
    const raws = await Promise.all(
      ids.map(
        (index) =>
          readClient().readContract({
            address: contract(),
            abi: ponsLockAbi,
            functionName: "getLock",
            args: [index],
          }) as Promise<OnChainLock>,
      ),
    );
    const resolved = await Promise.all(raws.map((raw, i) => toLock(ids[i], raw, now)));
    const locks = resolved.filter((lock): lock is Lock => lock !== null);
    const filtered = applyFilter(locks, {...filter, owner});
    const limit = filter.limit ?? 24;

    return {items: filtered.slice(0, limit), total: filtered.length};
  },

  getToken: readToken,

  async stats(): Promise<LockStats> {
    const {locks, total, readAt} = await readPage(0, 200);
    const byToken = new Map<string, number>();
    for (const lock of locks) {
      if (lock.state === "withdrawn") continue;
      const key = lock.token.address.toLowerCase();
      byToken.set(key, (byToken.get(key) ?? 0) + lockedShare(lock.amount, lock.token.totalSupply));
    }
    const shares = [...byToken.values()].map((share) => Math.min(1, share));
    const upcoming = locks
      .filter((lock) => lock.state === "active")
      .map((lock) => lock.unlockAt)
      .sort((a, b) => a - b);

    return {
      // When the chain was read, not when this ran. Normally the same instant; after a failed
      // read falls back to the last good one, this is what keeps the snapshot time honest.
      asOf: readAt,
      lockCount: total,
      tokenCount: byToken.size,
      averageLockedShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0,
      nextUnlockAt: upcoming[0],
    };
  },

  async createLock(input: CreateLockInput, {bridge, onStatus}: TxHooks): Promise<Lock> {
    if (!bridge?.account) throw new Error("Wallet not connected");
    const locker = contract();

    onStatus("simulating", {});

    // Approve first, and only for the shortfall. Setting an allowance that is already high
    // enough is a transaction someone pays for and a signature they did not need to give.
    const allowance = await bridge.readErc20<bigint>(input.token, "allowance", [
      bridge.account,
      locker,
    ]);
    if (allowance < input.amount) {
      onStatus("signing", {});
      const approveHash = await bridge.write({
        address: input.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [locker, input.amount],
      });
      onStatus("confirming", {hash: approveHash});
      const approval = await bridge.wait(approveHash);
      if (approval.status !== "success") throw new Error("The approval did not go through");
    }

    const request = {
      address: locker,
      abi: ponsLockAbi as readonly unknown[],
      functionName: "lock",
      args: [input.token, input.amount, BigInt(input.unlockAt)],
    };

    // Simulated before signing, so a revert surfaces as a readable message instead of a
    // wallet popup the user pays for and then watches fail.
    await bridge.simulate(request);

    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("The lock reverted on chain");

    // Read back rather than assumed: a fee-on-transfer token means the amount recorded is
    // not the amount that was sent, and the contract is the only thing that knows which.
    const total = (await readClient().readContract({
      address: locker,
      abi: ponsLockAbi,
      functionName: "lockCount",
    })) as bigint;
    const index = total - 1n;
    const raw = (await readClient().readContract({
      address: locker,
      abi: ponsLockAbi,
      functionName: "getLock",
      args: [index],
    })) as OnChainLock;

    const created = await toLock(index, raw, nowSeconds());
    if (!created) throw new Error("The lock was created but could not be read back");

    onStatus("success", {hash});
    return {...created, txHash: hash};
  },

  /**
   * Take the tokens back out.
   *
   * Everything that could refuse this is checked by the contract: the caller must be the owner,
   * the unlock date must have passed, and it must not already have been withdrawn. Simulating
   * first turns each of those into a sentence before a wallet is opened, rather than into a
   * signature the person pays for and then watches revert.
   */
  async withdraw(id: LockId, {bridge, onStatus}: TxHooks): Promise<Lock> {
    if (!bridge?.account) throw new Error("Wallet not connected");
    const locker = contract();

    const request = {
      address: locker,
      abi: ponsLockAbi as readonly unknown[],
      functionName: "withdraw",
      args: [parseLockIndex(id)],
    };

    onStatus("simulating", {});
    await bridge.simulate(request);

    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("The withdrawal reverted on chain");

    const withdrawn = await chainAdapter.getLock(id);
    if (!withdrawn) throw new Error("Withdrawn, but the lock could not be read back");
    onStatus("success", {hash});
    return withdrawn;
  },
};
