import {activeChain, activeChainId} from "@/lib/chain";
import {lockedShare} from "@/lib/format";
import {fixtureLocks, fixtureTokens} from "./fixtures";
import {deriveState} from "./derive";
import {lockId} from "./id";
import {readFault} from "./faults";
import {readLocal, saveLocal} from "./store";
import {ContractRevertError, UserRejectedError} from "./errors";
import {seeded} from "@/lib/strip/rng";
import type {
  Address,
  CreateLockInput,
  Hash,
  Lock,
  LockFilter,
  LockStats,
  LocksAdapter,
  Page,
  TokenMeta,
  TxHooks,
} from "./types";

/** Resolves after `ms`, or rejects if the caller aborts first. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Cancelled"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Cancelled"));
      },
      {once: true},
    );
  });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Fixtures plus whatever this browser created, newest first, state derived against now. */
function allLocks(): Lock[] {
  const now = nowSeconds();
  const local = readLocal().map((lock) => ({...lock, state: deriveState(lock, now)}));
  const seen = new Set(local.map((lock) => lock.id));
  return [...local, ...fixtureLocks(now).filter((lock) => !seen.has(lock.id))];
}

function applyFilter(locks: Lock[], filter: LockFilter = {}): Page<Lock> {
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
  items = [...items].sort((a, b) => {
    if (sort === "unlocking-soon") {
      // Anything already unlockable or withdrawn has no countdown left to sort by, so it
      // goes to the end rather than to the front with a negative remainder.
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

  const total = items.length;
  const limit = filter.limit ?? 24;
  const start = filter.cursor ? Number(filter.cursor) : 0;
  const slice = items.slice(start, start + limit);
  const nextStart = start + limit;

  return {items: slice, total, nextCursor: nextStart < total ? String(nextStart) : undefined};
}

/**
 * Shaped like a real transaction hash, derived from the input so a given lock always shows
 * the same one. It is never presented as a working explorer link: SimulatedRibbon marks it,
 * and the link is rendered inert while `simulated` is true.
 */
function deterministicHash(input: CreateLockInput): Hash {
  const random = seeded(`${input.token}:${input.amount}:${input.unlockAt}:${input.owner}`);
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += "0123456789abcdef"[Math.floor(random() * 16)];
  return out as Hash;
}

export const mockAdapter: LocksAdapter = {
  kind: "mock",
  needsBridge: false,

  async getLock(id) {
    return allLocks().find((lock) => lock.id === id) ?? null;
  },

  async listLocks(filter) {
    return applyFilter(allLocks(), filter);
  },

  async listLocksByOwner(owner, filter) {
    return applyFilter(allLocks(), {...filter, owner});
  },

  async getToken(address) {
    const wanted = address.toLowerCase();
    return fixtureTokens().find((token) => token.address.toLowerCase() === wanted) ?? null;
  },

  async stats(): Promise<LockStats> {
    const locks = allLocks();

    // Shares are summed per token first, then averaged across tokens. Averaging across
    // locks instead would let a token with six small locks outvote one with a single large
    // one, and the figure is meant to answer "how much of a typical token is locked".
    //
    // Withdrawn locks are excluded: those tokens are back in circulation, and counting them
    // would describe supply that is demonstrably not locked.
    const byToken = new Map<string, number>();
    for (const lock of locks) {
      if (lock.state === "withdrawn") continue;
      const key = lock.token.address.toLowerCase();
      byToken.set(key, (byToken.get(key) ?? 0) + lockedShare(lock.amount, lock.token.totalSupply));
    }

    // Clamped because a share above 1 is arithmetically impossible: a token cannot have
    // more than all of its supply locked. If one appears, the data is wrong rather than the
    // token being unusual, and rendering "102.3% average" would present the bug as a fact.
    const shares = [...byToken.values()].map((share) => Math.min(1, share));
    const upcoming = locks
      .filter((lock) => lock.state === "active")
      .map((lock) => lock.unlockAt)
      .sort((a, b) => a - b);

    return {
      asOf: nowSeconds(),
      lockCount: locks.length,
      tokenCount: byToken.size,
      averageLockedShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0,
      nextUnlockAt: upcoming[0],
    };
  },

  /**
   * The simulated transaction.
   *
   * It walks the real TxStatus union with realistic timing, so every state in TxProgress is
   * reachable and every failure path is one click away via the dev fault dial. The point is
   * not to fake success: it is that the flow around a transaction, which is most of the
   * work, is fully built and judged before the contract exists.
   */
  async createLock(input: CreateLockInput, {onStatus, signal}: TxHooks): Promise<Lock> {
    const fault = readFault();
    const hash = deterministicHash(input);

    onStatus("simulating", {});
    await wait(420, signal);

    if (fault === "wrong-network") {
      throw new Error(`Wrong network: switch your wallet to ${activeChain.name} (chain ${activeChainId})`);
    }
    if (fault === "revert") {
      throw new ContractRevertError("PonsLock: unlock date must be at least one hour from now");
    }
    if (fault === "insufficient-gas") {
      throw new Error(
        "Not enough ETH. Your wallet needs about 0.00042 ETH to cover this transaction's gas budget " +
          "and it holds 0.00009 ETH. It only spends about 0.00007 ETH, but the network reserves the " +
          "rest until the transaction lands.",
      );
    }

    onStatus("signing", {});
    await wait(fault === "slow-sign" ? 9000 : 900, signal);
    if (fault === "reject") throw new UserRejectedError();

    onStatus("confirming", {hash});
    // Robinhood Chain's blockTime is 100ms in viem's own definition, so one confirmation is
    // about a second rather than twelve. A twelve-second mock would train everyone to expect
    // the wrong thing and make the real thing feel broken when it turns out to be instant.
    await wait(1200, signal);
    if (fault === "timeout") {
      throw new Error("Transaction not confirmed after 60 seconds. It may still land.");
    }

    const token = await mockAdapter.getToken(input.token);
    if (!token) throw new ContractRevertError("No token at that address");

    const created: Lock = {
      id: lockId(`${input.owner}:${input.token}:${input.unlockAt}:${input.amount}`),
      owner: input.owner,
      token,
      amount: input.amount,
      lockedAt: nowSeconds(),
      unlockAt: input.unlockAt,
      txHash: hash,
      chainId: activeChainId,
      state: "active",
      note: input.note,
      simulated: true,
    };

    saveLocal(created);
    onStatus("success", {hash});
    return created;
  },

  async withdraw(id, {onStatus, signal}) {
    const existing = await mockAdapter.getLock(id);
    if (!existing) throw new ContractRevertError("No lock with that id");
    if (existing.owner === undefined) throw new ContractRevertError("PonsLock: not the owner");
    if (existing.state === "withdrawn") throw new ContractRevertError("PonsLock: already withdrawn");
    if (existing.state !== "unlockable") {
      throw new ContractRevertError("PonsLock: still locked until the unlock date");
    }

    // The same walk createLock does, so both flows feel like one product and the fault dial
    // exercises this path as well.
    const fault = readFault();
    const hash = deterministicHash({
      owner: existing.owner,
      token: existing.token.address,
      amount: existing.amount,
      unlockAt: existing.unlockAt,
    });

    onStatus("simulating", {});
    await wait(420, signal);
    if (fault === "revert") throw new ContractRevertError("PonsLock: still locked");
    if (fault === "wrong-network") {
      throw new Error(`Wrong network: switch your wallet to ${activeChain.name} (chain ${activeChainId})`);
    }

    onStatus("signing", {});
    await wait(fault === "slow-sign" ? 9000 : 900, signal);
    if (fault === "reject") throw new UserRejectedError();

    onStatus("confirming", {hash});
    await wait(1200, signal);
    if (fault === "timeout") {
      throw new Error("Transaction not confirmed after 60 seconds. It may still land.");
    }

    const withdrawn: Lock = {...existing, state: "withdrawn", withdrawnAt: nowSeconds()};
    saveLocal(withdrawn);
    onStatus("success", {hash});
    return withdrawn;
  },
};

export type {Address, TokenMeta};
