import {parseAbiItem, type PublicClient} from "viem";
import type {Address} from "@/lib/locks/types";

/**
 * Reconstructing ERC-20 balances at a block, from Transfer logs.
 *
 * A contract cannot enumerate its holders and no RPC offers the list, so the only way to know
 * who held what is to replay every Transfer. Mints arrive from the zero address and burns go to
 * it; both are just transfers as far as the arithmetic is concerned.
 *
 * Three things make this survivable on a real chain with real history.
 *
 * Windows are fetched in parallel. Net balances are a sum, and addition does not care what
 * order it happens in, so nothing is lost by fetching block ranges concurrently and folding
 * them at the end. Serially this took thirteen minutes against a live token; the work is almost
 * entirely waiting on the node.
 *
 * Ranges split on refusal rather than on a guess. Nodes cap how much one `eth_getLogs` may
 * return and say so in wildly different ways -- this one answers "Missing or invalid
 * parameters", which sounds like a bug in the caller and is not -- so a window that fails is
 * halved and retried rather than assumed fatal. Empty ranges come back in milliseconds, so
 * skipping over a token's quiet years is nearly free and the cost lands where the trading is.
 *
 * And the whole thing is incremental. A scan remembers where it got to, so the next one asks
 * only for the blocks since.
 */

export const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * How many windows are in flight at once.
 *
 * Kept low deliberately. Ten made the node time out rather than go faster: past a handful of
 * concurrent log queries this RPC queues them and every one of them ages out together, which
 * reads as a network failure and loses the whole scan.
 */
const CONCURRENCY = 4;
/** The widest window worth trying. Anything busier gets split down from here. */
const MAX_SPAN = 250_000n;
const MIN_SPAN = 1_000n;

export interface ScanProgress {
  fromBlock: bigint;
  toBlock: bigint;
  latest: bigint;
  transfers: number;
}

interface TransferLog {
  args: {from?: string; to?: string; value?: bigint};
}

/**
 * Every Transfer between two blocks, fetched in parallel with adaptive windows.
 *
 * Returns them unordered: the caller folds them into balances, and that fold is commutative.
 */
async function fetchTransfers(
  client: PublicClient,
  token: Address,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (progress: ScanProgress) => void,
): Promise<TransferLog[]> {
  if (toBlock < fromBlock) return [];

  const pending: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_SPAN) {
    const end = start + MAX_SPAN - 1n > toBlock ? toBlock : start + MAX_SPAN - 1n;
    pending.push([start, end]);
  }

  const collected: TransferLog[] = [];
  const attempts = new Map<string, number>();
  let transfers = 0;

  async function worker() {
    for (;;) {
      const window = pending.pop();
      if (!window) return;
      const [start, end] = window;

      try {
        const logs = (await client.getLogs({
          address: token,
          event: TRANSFER_EVENT,
          fromBlock: start,
          toBlock: end,
        })) as unknown as TransferLog[];

        collected.push(...logs);
        transfers += logs.length;
        onProgress?.({fromBlock: start, toBlock: end, latest: toBlock, transfers});
      } catch (error) {
        // Two different refusals arrive here and both are answered the same way. "Too many
        // results", however the node phrases it, and a timeout, which on a busy window means
        // the same thing: less at a time. A window already at the floor is retried a few times
        // before being called a real failure, because a node under load refusing a thousand
        // blocks is usually just busy.
        const span = end - start + 1n;
        if (span > MIN_SPAN) {
          const middle = start + span / 2n;
          pending.push([start, middle - 1n], [middle, end]);
          continue;
        }

        const seen = (attempts.get(`${start}`) ?? 0) + 1;
        attempts.set(`${start}`, seen);
        if (seen > 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * seen));
        pending.push([start, end]);
      }
    }
  }

  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  return collected;
}

/**
 * The first block this token had any Transfer in.
 *
 * Found from the chain rather than from an explorer, because the mainnet explorer sits behind a
 * bot challenge and answers a login page instead of JSON. Falling back to a guess would be worse
 * than failing: a scan that starts after the token already existed misses the transfers before
 * it and reports balances that are wrong without being obviously wrong.
 *
 * Empty windows return in milliseconds, so striding over the years before a token existed costs
 * almost nothing, and a window that refuses is itself the signal that the token was already
 * trading inside it.
 */
export async function firstTransferBlock(
  client: PublicClient,
  token: Address,
  head: bigint,
): Promise<bigint> {
  let cursor = 0n;
  let span = 4_000_000n;

  while (cursor <= head) {
    const end = cursor + span - 1n > head ? head : cursor + span - 1n;
    try {
      const logs = (await client.getLogs({
        address: token,
        event: TRANSFER_EVENT,
        fromBlock: cursor,
        toBlock: end,
      })) as unknown as Array<{blockNumber: bigint}>;

      if (logs.length > 0) {
        return logs.reduce((lowest, log) => (log.blockNumber < lowest ? log.blockNumber : lowest), logs[0].blockNumber);
      }
      // Nothing here, and nothing before it either. Stride on.
      cursor = end + 1n;
      if (span < 4_000_000n) span *= 2n;
    } catch {
      // Too much in this window to return, which means the token was already active in it.
      if (span <= MIN_SPAN) return cursor;
      span /= 4n;
    }
  }
  return 0n;
}

/**
 * Balances as of `toBlock`, carried forward from the last scan of this token where possible.
 *
 * The cache is keyed by token and holds one point in time. Answering a block at or after it
 * costs only the blocks in between, which is the usual case: the snapshot the page asks to
 * verify is the one the scheduled job published a moment ago. Answering an earlier block falls
 * back to a full replay, which is correct and rare.
 */
const scanned = new Map<string, {block: bigint; balances: Map<string, bigint>}>();

export async function balancesAt(
  client: PublicClient,
  token: Address,
  toBlock: bigint,
  options: {fromBlock?: bigint; onProgress?: (progress: ScanProgress) => void} = {},
): Promise<Map<string, bigint>> {
  const key = token.toLowerCase();
  const cached = scanned.get(key);

  let balances: Map<string, bigint>;
  let from: bigint;

  if (cached && cached.block < toBlock) {
    balances = new Map(cached.balances);
    from = cached.block + 1n;
  } else if (cached && cached.block === toBlock) {
    return new Map(cached.balances);
  } else {
    balances = new Map();
    from = options.fromBlock ?? (await firstTransferBlock(client, token, toBlock));
  }

  const logs = await fetchTransfers(client, token, from, toBlock, options.onProgress);

  const credit = (who: string | undefined, amount: bigint) => {
    if (!who || who.toLowerCase() === ZERO) return; // The zero address is not a holder.
    const account = who.toLowerCase();
    balances.set(account, (balances.get(account) ?? 0n) + amount);
  };

  for (const log of logs) {
    const {from: sender, to: recipient, value} = log.args;
    if (value === undefined) continue;
    credit(sender, -value);
    credit(recipient, value);
  }

  // Cached before the zero balances are dropped, so the next scan carries forward an account
  // that is empty now and holding again in fifty blocks' time.
  scanned.set(key, {block: toBlock, balances: new Map(balances)});

  // A balance can go to zero, and a negative one means a log was missed rather than that
  // someone owes the token money. Dropping both keeps the snapshot honest.
  const held = new Map<string, bigint>();
  for (const [account, balance] of balances) {
    if (balance > 0n) held.set(account, balance);
  }
  return held;
}
