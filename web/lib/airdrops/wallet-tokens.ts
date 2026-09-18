import {erc20Abi, parseAbiItem} from "viem";
import {readClient} from "@/lib/locks/client";
import type {Address} from "@/lib/locks/types";

/**
 * Which ERC-20s a wallet has received lately, found from the chain.
 *
 * The indexer is the natural place to ask, and on this chain's mainnet it sits behind a bot
 * challenge and answers 403, so the picker came up empty exactly where someone had just bought
 * a token and expected to see it.
 *
 * A Transfer log is indexed by recipient, so asking the node for "every Transfer to this
 * address" is a cheap, selective query that needs no per-token filter and no indexer: one
 * wallet's incoming transfers are a handful of logs, not a chain's worth. The addresses that
 * come back are the tokens it has touched; balances are then read directly.
 *
 * It looks back over a window rather than over all history, so this finds what a wallet has
 * been given recently and not everything it has ever held. That is the right trade for a
 * convenience: the picker is a shortcut, and pasting an address is always available and always
 * works.
 */

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/** Roughly two days at this chain's ten blocks a second. */
const LOOKBACK = 1_700_000n;
const MAX_SPAN = 250_000n;
const MAX_TOKENS = 25;

export interface WalletToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}

export async function tokensReceivedBy(wallet: Address): Promise<WalletToken[]> {
  const client = readClient();
  const head = await client.getBlockNumber();
  const start = head > LOOKBACK ? head - LOOKBACK : 0n;

  const windows: Array<[bigint, bigint]> = [];
  for (let from = start; from <= head; from += MAX_SPAN) {
    windows.push([from, from + MAX_SPAN - 1n > head ? head : from + MAX_SPAN - 1n]);
  }

  const seen = new Set<string>();
  await Promise.all(
    windows.map(async ([from, to]) => {
      try {
        const logs = await client.getLogs({event: TRANSFER, args: {to: wallet}, fromBlock: from, toBlock: to});
        for (const log of logs) if (log.address) seen.add(log.address.toLowerCase());
      } catch {
        // One window refusing is a gap in a convenience, not a failure worth propagating: the
        // field behind this still takes a pasted address.
      }
    }),
  );

  const candidates = [...seen].slice(0, MAX_TOKENS) as Address[];
  const tokens = await Promise.all(
    candidates.map(async (address) => {
      try {
        const [symbol, name, decimals, balance] = await Promise.all([
          client.readContract({address, abi: erc20Abi, functionName: "symbol"}),
          client.readContract({address, abi: erc20Abi, functionName: "name"}),
          client.readContract({address, abi: erc20Abi, functionName: "decimals"}),
          client.readContract({address, abi: erc20Abi, functionName: "balanceOf", args: [wallet]}),
        ]);
        if ((balance as bigint) <= 0n) return null;
        return {
          address,
          symbol: String(symbol),
          name: String(name),
          decimals: Number(decimals),
          balance: (balance as bigint).toString(),
        } satisfies WalletToken;
      } catch {
        return null; // Not an ERC-20, or a token that will not answer. Leave it out.
      }
    }),
  );

  return tokens
    .filter((token): token is WalletToken => token !== null)
    .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? 1 : -1));
}
