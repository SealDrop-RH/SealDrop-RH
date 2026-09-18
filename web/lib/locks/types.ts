import type {SupportedChainId} from "@/lib/chain";

export type Address = `0x${string}`;
export type Hash = `0x${string}`;
/** Short, URL-safe, and prefixed so it is recognisable in a log. "pl_7k2m9q". */
export type LockId = string;

/**
 * pending    created but not yet confirmed
 * active     confirmed, unlock date still ahead
 * unlockable unlock date passed, tokens not withdrawn
 * withdrawn  taken back out after the unlock date
 */
export type LockState = "pending" | "active" | "unlockable" | "withdrawn";

export interface TokenMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw units. bigint everywhere internally; codec.ts stringifies at any wire boundary. */
  totalSupply: bigint;
}

export interface Lock {
  id: LockId;
  owner: Address;
  token: TokenMeta;
  amount: bigint;
  /** Unix seconds. Seconds rather than millis because that is what a contract will store. */
  lockedAt: number;
  unlockAt: number;
  txHash: Hash;
  chainId: SupportedChainId;
  state: LockState;
  withdrawnAt?: number;
  /** Optional, shown on the proof card and the share image. */
  note?: string;
  /**
   * True when this record came from the mock adapter.
   *
   * Not optional, and never defaulted. A proof card that cannot tell whether it is
   * describing a real lock is a rug-pull instrument, so every render path has to be handed
   * the answer rather than being able to forget to ask.
   */
  simulated: boolean;
}

export interface LockFilter {
  owner?: Address;
  token?: Address;
  state?: LockState | "all";
  sort?: "newest" | "unlocking-soon" | "largest-share";
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  total: number;
}

export interface LockStats {
  /**
   * Unix seconds: when this snapshot was taken.
   *
   * Returned as data rather than read from the clock at render time. A component that calls
   * Date.now() while rendering is impure, and on the server it also means the markup and the
   * hydration that follows it can disagree about which day "today" is. The adapter reads the
   * clock once, as part of fetching; in part 2 this becomes the block timestamp, which is
   * the more honest answer anyway.
   */
  asOf: number;
  lockCount: number;
  tokenCount: number;
  /** Mean locked share across distinct tokens, for the landing headline. */
  averageLockedShare: number;
  nextUnlockAt?: number;
}

export interface CreateLockInput {
  token: Address;
  amount: bigint;
  unlockAt: number;
  owner: Address;
  note?: string;
}

/* ---- the transaction seam ---- */

/** The same union StockBound's useTx walks. Part 2 changes nothing about it. */
export type TxStatus = "idle" | "simulating" | "signing" | "confirming" | "success" | "error";

export interface WriteRequest {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

/**
 * The write capability, as a port. This is the most important type in part 1.
 *
 * lib/locks/chain.ts will be a plain module and cannot call wagmi hooks, while
 * lib/locks/mock.ts needs no wallet at all. useLockTx builds one of these out of
 * usePublicClient and useWriteContract and hands it to whichever adapter is selected.
 *
 * Without it, part 2 would have to turn createLock into a hook, every caller would change,
 * and the seam would have bought nothing. It exists now, unused by the mock, precisely so
 * that it does not have to be built twice.
 */
export interface WriteBridge {
  account?: Address;
  chainId?: number;
  simulate(request: WriteRequest): Promise<void>;
  write(request: WriteRequest): Promise<Hash>;
  wait(hash: Hash): Promise<{status: "success" | "reverted"}>;
  readErc20<T>(
    address: Address,
    functionName: "balanceOf" | "allowance" | "decimals" | "symbol" | "name" | "totalSupply",
    args?: readonly unknown[],
  ): Promise<T>;
}

export interface TxHooks {
  onStatus(status: TxStatus, context: {hash?: Hash; label?: string}): void;
  bridge?: WriteBridge;
  signal?: AbortSignal;
}

export interface LocksAdapter {
  readonly kind: "mock" | "chain";
  /** Whether createLock needs a WriteBridge. The mock does not. */
  readonly needsBridge: boolean;

  getLock(id: LockId): Promise<Lock | null>;
  listLocks(filter?: LockFilter): Promise<Page<Lock>>;
  listLocksByOwner(owner: Address, filter?: Omit<LockFilter, "owner">): Promise<Page<Lock>>;
  getToken(address: Address): Promise<TokenMeta | null>;
  stats(): Promise<LockStats>;
  createLock(input: CreateLockInput, hooks: TxHooks): Promise<Lock>;
  /**
   * Take the tokens back out, once the unlock date has passed.
   *
   * The owner and nobody else, and only after the date; both rules live in the contract, and
   * the adapters enforce them too so that a control which is merely hidden is not mistaken for
   * a rule. Nothing about a lock can be shortened, so this is the only way tokens ever leave.
   */
  withdraw(id: LockId, hooks: TxHooks): Promise<Lock>;
}
