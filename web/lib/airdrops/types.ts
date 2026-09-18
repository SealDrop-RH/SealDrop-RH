import type {SupportedChainId} from "@/lib/chain";
import type {Address, Hash, LockId, TokenMeta, TxStatus, WriteBridge} from "@/lib/locks/types";

export type AirdropId = string;

/**
 * scheduled  created, claiming has not opened yet
 * live       claiming is open
 * finished   the pool is fully claimed
 */
export type AirdropState = "scheduled" | "live" | "finished";

/**
 * one-off    the whole reserve becomes claimable the moment claiming opens
 * recurring  a share of whatever is left is released each round, for ever
 */
export type AirdropKind = "one-off" | "recurring";

/**
 * How a recurring airdrop pays out.
 *
 * A share of the *remainder*, not of the original reserve. 5% of 100,000 is 5,000, and the
 * round after that is 5% of the 95,000 that are left, which is 4,750. See lib/airdrops/schedule.ts
 * for why the geometry is deliberate.
 */
export interface AirdropSchedule {
  /** Share of what is left released each round, in basis points. 500 is 5%. */
  rateBps: number;
  /** Seconds between rounds. A minute is the floor. */
  intervalSeconds: number;
  /** Stop after this many rounds. Undefined means it runs until the remainder is dust. */
  maxRounds?: number;
}

export interface Airdrop {
  id: AirdropId;
  token: TokenMeta;
  /** The wallet that funded it and is allowed to adjust it. */
  creator: Address;

  kind: AirdropKind;

  /**
   * The reserve: how much of the token is set aside for holders in total.
   *
   * Deliberately a separate figure from anything locked. A creator sets aside a slice, not
   * the whole position, and the two numbers are not the same thing even when the reserve is
   * funded out of a lock.
   */
  reserve: bigint;

  /**
   * How much of the reserve is claimable right now.
   *
   * Derived, not stored. A one-off reports its whole reserve; a recurring one reports only
   * what its rounds have released so far, so it climbs on its own as the clock moves. Every
   * read path goes through `atTime` in derive.ts, which is what puts the figure here, which
   * is also why every consumer of `pool` kept working when rounds were added underneath it.
   */
  pool: bigint;
  claimed: bigint;

  /** Present only on a recurring airdrop. Its absence is what makes one a one-off. */
  schedule?: AirdropSchedule;

  /**
   * When an operator halted the schedule. Nothing is released after this moment.
   *
   * Only the wallets in lib/airdrops/operators.ts can set it, and only on their own airdrops.
   * What had already been released stays claimable: stopping takes back what the rounds had
   * not handed out, not what holders were already owed.
   */
  stoppedAt?: number;
  /** What the operator took back when they stopped it. Recorded so the page can show it. */
  withdrawn?: bigint;

  /** Balances below this do not qualify at all. */
  minimumHolding: bigint;

  /**
   * The sum of the balances of every holder who clears minimumHolding.
   *
   * This, and not total supply, is what a share is measured against. Measuring against total
   * supply would leave most of the pool unallocated, since locked supply and disqualified
   * holders can never claim it. Measuring against the qualifying balances means the pool is
   * exactly distributed and a threshold genuinely redistributes toward the holders who met it.
   */
  eligibleSupply: bigint;
  /** How many wallets clear the threshold. */
  eligibleHolders: number;

  /** When claiming opens. Before this the airdrop is scheduled and shows a countdown. */
  startsAt: number;
  createdAt: number;

  /** Set when the pool was funded out of a lock, so the two can be shown together. */
  lockId?: LockId;

  txHash: Hash;
  chainId: SupportedChainId;
  state: AirdropState;
  note?: string;
  /** True while this came from the mock adapter. Drives the watermark, never optional. */
  simulated: boolean;
}

/** What one wallet gets from one airdrop. */
export interface Allocation {
  qualifies: boolean;
  /** The wallet's balance at the time of asking. */
  balance: bigint;
  /** balance / eligibleSupply, clamped to [0, 1]. Zero when it does not qualify. */
  share: number;
  /** The wallet's cut of the pool. Zero when it does not qualify. */
  amount: bigint;
  /** How much of that has already been claimed. */
  claimed: bigint;
  /** amount - claimed, never negative. */
  claimable: bigint;
  /**
   * The proven share, scaled by 1e18, when this came from a chain adapter.
   *
   * Carried through so a page can work out what is owed at any instant without another round
   * trip: it is the one input the contract's own formula needs that a browser cannot derive.
   */
  shareScaled?: bigint;
  /** Why it does not qualify, for a message that says something useful. */
  reason?: "below-minimum" | "no-balance";
}

export interface CreateAirdropInput {
  token: Address;
  kind: AirdropKind;
  /** The whole amount set aside. For a one-off this is the pool; for a drip it is the source. */
  reserve: bigint;
  /** Required for "recurring", ignored for "one-off". */
  schedule?: AirdropSchedule;
  minimumHolding: bigint;
  startsAt: number;
  creator: Address;
  lockId?: LockId;
  note?: string;
}

/**
 * What a creator can still change, and only before claiming opens. See `adjustability`.
 *
 * The schedule is in here for the same reason the pool is: until a holder can act on the
 * terms, nobody has relied on them. After that moment none of it moves, the rate and the
 * interval included, because a drip whose rate can be cut once it is running is a promise
 * that was never made.
 */
export interface AdjustAirdropInput {
  id: AirdropId;
  reserve?: bigint;
  minimumHolding?: bigint;
  startsAt?: number;
  schedule?: AirdropSchedule;
}

export interface AirdropFilter {
  token?: Address;
  creator?: Address;
  state?: AirdropState | "all";
  kind?: AirdropKind | "all";
  limit?: number;
}

export interface AirdropsAdapter {
  readonly kind: "mock" | "chain";
  getAirdrop(id: AirdropId): Promise<Airdrop | null>;
  listAirdrops(filter?: AirdropFilter): Promise<Airdrop[]>;
  /** Every airdrop a wallet could claim from, with its allocation worked out. */
  listClaimable(holder: Address): Promise<Array<{airdrop: Airdrop; allocation: Allocation}>>;
  allocationFor(id: AirdropId, holder: Address): Promise<Allocation | null>;
  createAirdrop(input: CreateAirdropInput, hooks: AirdropTxHooks): Promise<Airdrop>;
  adjustAirdrop(input: AdjustAirdropInput, hooks: AirdropTxHooks): Promise<Airdrop>;
  /** Halt the schedule and return what it has not released. Operators only. See operators.ts. */
  stopAirdrop(id: AirdropId, caller: Address, hooks: AirdropTxHooks): Promise<Airdrop>;
  claim(id: AirdropId, holder: Address, hooks: AirdropTxHooks): Promise<Allocation>;
}

export interface AirdropTxHooks {
  onStatus(status: TxStatus, context: {hash?: Hash}): void;
  /**
   * The write capability, as a port. Same reasoning as lib/locks/types.ts: a chain adapter is
   * a plain module and cannot call wagmi hooks, so the ability to approve and to send a
   * transaction is handed in rather than reached for. The mock ignores it.
   *
   * Without this, nothing in the airdrop path can move a token: the mock walks a timer and
   * calls it a transaction, which is why creating one has never asked for an approval.
   */
  bridge?: WriteBridge;
  signal?: AbortSignal;
}

export type {TokenMeta};
