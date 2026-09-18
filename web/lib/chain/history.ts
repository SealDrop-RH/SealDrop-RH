import "server-only";
import {decodeEventLog, encodeEventTopics, numberToHex, pad, toHex, type Hex, type Log} from "viem";
import {activeChainId} from "@/lib/chain";
import {deploymentFor} from "@/lib/contracts/addresses";
import {ponsDripAbi} from "@/lib/contracts/PonsDrip";
import {ponsLockAbi} from "@/lib/contracts/PonsLock";
import {readClient} from "@/lib/locks/client";
import type {Address} from "@/lib/locks/types";

/**
 * The transactions behind a lock or an airdrop, read back from the contract's own events.
 *
 * Neither contract stores a transaction hash: a record is an index into an array, and the
 * transaction that created it, moved it or paid out of it exists only as an event log. So
 * "show the tx" means finding those logs. Every event on both contracts carries the record's id
 * as its first indexed topic, which lets one filter fetch everything that ever happened to one
 * record without knowing in advance which kinds of event there were.
 *
 * Holder-level `Claimed` events are left out on purpose. A drip paying a hundred wallets every
 * minute emits a hundred of them a minute, and `Distributed` already records each payout with its
 * wallet count and total. Fetching the per-wallet logs would make the page's record the most
 * expensive query in the app for no extra information a reader acts on.
 *
 * Server-side only, and remembered per process: the next request scans only the blocks since.
 */

export type RecordKind = "lock" | "airdrop";

export interface ChainEvent {
  name: string;
  txHash: Hex;
  blockNumber: string;
  logIndex: number;
  /** Unix seconds. */
  timestamp: number;
  /** Decoded arguments, bigints as decimal strings so they survive JSON. */
  args: Record<string, string | boolean>;
}

const LOCK_EVENTS = ["Locked", "Extended", "ToppedUp", "Withdrawn"] as const;
const DRIP_EVENTS = ["Created", "RootUpdated", "Distributed", "Stopped"] as const;

function contractFor(kind: RecordKind): {address: Address; abi: typeof ponsLockAbi | typeof ponsDripAbi; from: bigint} {
  const deployment = deploymentFor(activeChainId);
  if (!deployment) throw new Error(`No contracts on chain ${activeChainId}`);
  const address = kind === "lock" ? deployment.PonsLock : deployment.PonsDrip;
  if (!address) throw new Error(`No ${kind} contract on chain ${activeChainId}`);
  return {address, abi: kind === "lock" ? ponsLockAbi : ponsDripAbi, from: BigInt(deployment.deployedAtBlock)};
}

function topicsFor(kind: RecordKind): Hex[] {
  const {abi} = contractFor(kind);
  const names = kind === "lock" ? LOCK_EVENTS : DRIP_EVENTS;
  return names.map((eventName) => encodeEventTopics({abi, eventName} as never)[0] as Hex);
}

/* ------------------------------------------------------------------ scanning ---- */

const MAX_SPAN = 250_000n;
const MIN_SPAN = 2_000n;
const CONCURRENCY = 4;

type RawLog = Log<bigint, number, false>;

/**
 * Every log matching `topics` between two blocks, in windows, split on refusal.
 *
 * Same shape as the Transfer replay in lib/airdrops/balances.ts and for the same reasons: this
 * node refuses a window with too many results in terms that look like a malformed request, so a
 * failed window is halved rather than treated as fatal. Contract events are sparse next to token
 * transfers, so in practice almost every window comes back whole on the first try.
 */
async function scan(address: Address, topics: (Hex | Hex[] | null)[], from: bigint, to: bigint): Promise<RawLog[]> {
  if (to < from) return [];
  const client = readClient();
  const pending: Array<[bigint, bigint, number]> = [];
  for (let start = from; start <= to; start += MAX_SPAN) {
    pending.push([start, start + MAX_SPAN - 1n > to ? to : start + MAX_SPAN - 1n, 0]);
  }
  const found: RawLog[] = [];

  async function worker() {
    for (let next = pending.shift(); next; next = pending.shift()) {
      const [start, end, attempt] = next;
      try {
        const logs = (await client.request({
          method: "eth_getLogs",
          params: [{address, topics, fromBlock: numberToHex(start), toBlock: numberToHex(end)}],
        })) as unknown as Array<Record<string, string | string[] | boolean>>;
        for (const log of logs) {
          found.push({
            ...(log as unknown as RawLog),
            blockNumber: BigInt(log.blockNumber as string),
            logIndex: Number(log.logIndex),
          });
        }
      } catch (error) {
        const span = end - start + 1n;
        if (span > MIN_SPAN) {
          const middle = start + span / 2n;
          pending.push([start, middle - 1n, 0], [middle, end, 0]);
        } else if (attempt < 3) {
          pending.push([start, end, attempt + 1]);
        } else {
          throw error;
        }
      }
    }
  }

  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  return found.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
}

/* ------------------------------------------------------------------- records ---- */

const records = new Map<string, {to: bigint; logs: RawLog[]}>();
const timestamps = new Map<string, number>();

async function withTimestamps(logs: RawLog[]): Promise<Map<string, number>> {
  const client = readClient();
  const missing = [...new Set(logs.map((log) => log.blockNumber.toString()))].filter((b) => !timestamps.has(b));
  // One tick, so the batching transport folds these into a single request.
  const blocks = await Promise.all(missing.map((b) => client.getBlock({blockNumber: BigInt(b)})));
  blocks.forEach((block) => timestamps.set(block.number.toString(), Number(block.timestamp)));
  return timestamps;
}

function decode(kind: RecordKind, log: RawLog, when: Map<string, number>): ChainEvent | null {
  const {abi} = contractFor(kind);
  try {
    const decoded = decodeEventLog({abi, data: log.data, topics: log.topics as [Hex, ...Hex[]]}) as {
      eventName: string;
      args: Record<string, unknown>;
    };
    const args: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(decoded.args ?? {})) {
      args[key] = typeof value === "boolean" ? value : String(value);
    }
    return {
      name: decoded.eventName,
      txHash: log.transactionHash as Hex,
      blockNumber: log.blockNumber.toString(),
      logIndex: log.logIndex,
      timestamp: when.get(log.blockNumber.toString()) ?? 0,
      args,
    };
  } catch {
    return null;
  }
}

export interface RecordHistory {
  chainId: number;
  contract: Address;
  id: string;
  /** The transaction that created the record, when it has been found. */
  created: ChainEvent | null;
  /** Newest first, at most `limit`. */
  events: ChainEvent[];
  total: number;
}

export async function historyFor(kind: RecordKind, id: bigint, limit = 50): Promise<RecordHistory> {
  const {address, from} = contractFor(kind);
  const head = await readClient().getBlockNumber();
  const key = `${activeChainId}:${kind}:${id}`;
  const cached = records.get(key);
  const start = cached ? cached.to + 1n : from;
  const idTopic = pad(toHex(id), {size: 32});
  const fresh = await scan(address, [topicsFor(kind), idTopic], start, head);
  const logs = [...(cached?.logs ?? []), ...fresh];
  records.set(key, {to: head, logs});

  const creationName = kind === "lock" ? "Locked" : "Created";
  const creationLog = logs.find((log) => log.topics[0] === topicsFor(kind)[0]);
  const recent = logs.slice(-limit).reverse();
  const when = await withTimestamps(creationLog ? [creationLog, ...recent] : recent);
  const events = recent.map((log) => decode(kind, log, when)).filter((e): e is ChainEvent => e !== null);
  const created = creationLog ? decode(kind, creationLog, when) : null;

  return {
    chainId: activeChainId,
    contract: address,
    id: id.toString(),
    created: created && created.name === creationName ? created : null,
    events,
    total: logs.length,
  };
}

/* ------------------------------------------------------------ creation index ---- */

const creations = new Map<string, {to: bigint; byId: Map<string, Hex>}>();

/**
 * The creating transaction of every record of one kind, keyed by id.
 *
 * One filter on the creation event across the whole contract, so a list of fifty cards costs one
 * scan rather than fifty.
 */
export async function creationTxs(kind: RecordKind): Promise<Record<string, Hex>> {
  const {address, from} = contractFor(kind);
  const head = await readClient().getBlockNumber();
  const key = `${activeChainId}:${kind}`;
  const cached = creations.get(key) ?? {to: from - 1n, byId: new Map<string, Hex>()};
  const logs = await scan(address, [topicsFor(kind)[0]], cached.to + 1n, head);
  for (const log of logs) {
    if (log.topics[1]) cached.byId.set(BigInt(log.topics[1]).toString(), log.transactionHash as Hex);
  }
  creations.set(key, {to: head, byId: cached.byId});
  return Object.fromEntries(cached.byId);
}

/* -------------------------------------------------------------- verification ---- */

export interface SourceVerification {
  /** Sourcify's verdict: "exact_match" means the deployed bytecode, metadata and all, is this source. */
  match: "exact_match" | "match" | null;
  checkedAt: number;
}

const verdicts = new Map<string, SourceVerification>();
const RECHECK_MS = 10 * 60_000;

/**
 * Whether the contract's published source is the code actually deployed.
 *
 * Asked of Sourcify, which recompiles the published source and compares it with the bytecode on
 * chain, so the answer does not rest on anyone's say-so, including this app's. A positive verdict
 * cannot be revoked, so it is kept; a negative one is asked again after a while.
 */
export async function verificationOf(address: Address): Promise<SourceVerification> {
  const key = `${activeChainId}:${address.toLowerCase()}`;
  const known = verdicts.get(key);
  if (known && (known.match || Date.now() - known.checkedAt < RECHECK_MS)) return known;
  try {
    const response = await fetch(`https://sourcify.dev/server/v2/contract/${activeChainId}/${address}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json()) as {match?: string | null};
    const match = body.match === "exact_match" || body.match === "match" ? body.match : null;
    const verdict = {match, checkedAt: Date.now()} as SourceVerification;
    verdicts.set(key, verdict);
    return verdict;
  } catch {
    return known ?? {match: null, checkedAt: 0};
  }
}
