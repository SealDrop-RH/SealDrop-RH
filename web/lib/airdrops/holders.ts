import {activeChainId} from "@/lib/chain";
import {deploymentFor} from "@/lib/contracts/addresses";
import {readClient} from "@/lib/locks/client";
import {balancesAt} from "./balances";
import type {PublicClient} from "viem";
import type {Address} from "@/lib/locks/types";

/**
 * Who held a token, at a block.
 *
 * Replayed from Transfer logs rather than asked of the indexer, for two reasons. Blockscout
 * lists a token's holders as they are *now*: ask it twice a minute apart and it answers
 * differently, while a Merkle root is a commitment to one exact set of numbers and a holder
 * fetching their proof an hour later needs the tree the publisher built. And on this chain's
 * mainnet the explorer sits behind a bot challenge and answers a login page instead of JSON,
 * so anything that depended on it would work in testing and fail in production.
 *
 * Server-side only: it is a long sequence of eth_getLogs calls, which is not something a
 * browser should do once per holder per page.
 */

export interface HolderSet {
  balances: Map<string, bigint>;
  /** The L2 block these balances are as of. */
  block: number;
  total: bigint;
}

/**
 * Addresses that hold the token but can never claim from it.
 *
 * The lockbox is the important one: supply sitting in PonsLock is real balance at a real
 * address, and counting it would hand a share of every airdrop to a contract with no code to
 * claim it. That share would not go to holders, it would simply never be released. The drip
 * contract is excluded for the same reason, plus the obvious one that it is where the reserve
 * already is.
 */
function systemAddresses(): Set<string> {
  const deployment = deploymentFor(activeChainId);
  return new Set(
    [
      "0x0000000000000000000000000000000000000000",
      "0x000000000000000000000000000000000000dead",
      deployment?.PonsLock,
      deployment?.PonsAirdrop,
      deployment?.PonsDrip,
    ]
      .filter(Boolean)
      .map((address) => String(address).toLowerCase()),
  );
}

/**
 * EIP-7702: an ordinary wallet that has delegated to a contract carries exactly this, the
 * three-byte marker and the twenty-byte address it runs. Both operator wallets look like this
 * on mainnet, so "has code" alone would have cut the people this tool exists for.
 */
const DELEGATION_PREFIX = "0xef0100";
const DELEGATION_LENGTH = 2 + 2 * 23;

/** Whether this code belongs to something a person holds a key for. */
export function isWalletCode(code: string | undefined | null): boolean {
  if (!code || code === "0x") return true;
  return code.length === DELEGATION_LENGTH && code.toLowerCase().startsWith(DELEGATION_PREFIX);
}

/**
 * Accounts already known to be contracts, kept for the life of the process.
 *
 * Only that verdict is remembered, because only that verdict cannot change: code at an address
 * cannot be removed any more, but an address with none today can have a contract deployed to
 * it tomorrow, so wallets are asked again on every snapshot.
 */
const knownContracts = new Set<string>();
const CODE_BATCH = 100;

/**
 * Which of these accounts are contracts rather than wallets.
 *
 * Asked at the chain head, not at the snapshot block: this node keeps no history of code. That
 * costs nothing in practice, since the only change an address can make is from wallet to
 * contract, and a tree rebuilt after one simply drops that address.
 */
export async function contractsAmong(client: PublicClient, accounts: string[]): Promise<Set<string>> {
  const unknown = accounts.filter((account) => !knownContracts.has(account));
  for (let i = 0; i < unknown.length; i += CODE_BATCH) {
    const chunk = unknown.slice(i, i + CODE_BATCH);
    // One tick, so the batching transport folds the chunk into a single request.
    const codes = await Promise.all(
      chunk.map((account) => client.getCode({address: account as Address})),
    );
    chunk.forEach((account, index) => {
      if (!isWalletCode(codes[index])) knownContracts.add(account);
    });
  }
  return new Set(accounts.filter((account) => knownContracts.has(account)));
}

/**
 * Every holder of `token` as of `block`, minus the addresses that cannot claim.
 *
 * Contracts are dropped along with the system addresses, and this was learnt at a price. On
 * mainnet the first $DROP drip counted the launchpad's bonding curve as a holder. It held
 * 99.59% of the supply, so it was allotted 99.59% of every round, and a curve has no way to
 * call `claim`: those tokens were released to an address that could never take them. The same
 * goes for any pool or router. Tokens sitting in one are liquidity, not a holder.
 */
export async function holdersOf(token: Address, block: number): Promise<HolderSet> {
  const excluded = systemAddresses();
  const client = readClient();
  // No fromBlock hint: balancesAt finds the token's first Transfer from the chain itself, and
  // carries forward whatever it scanned last time. Handing it a guess was how a scan came to
  // start after the token already existed and quietly miss every transfer before it.
  const replayed = await balancesAt(client, token, BigInt(block));

  const candidates = [...replayed.entries()].filter(
    ([account, balance]) => balance > 0n && !excluded.has(account),
  );
  const contracts = await contractsAmong(
    client,
    candidates.map(([account]) => account),
  );

  const balances = new Map<string, bigint>();
  let total = 0n;
  for (const [account, balance] of candidates) {
    if (contracts.has(account)) continue;
    balances.set(account, balance);
    total += balance;
  }

  return {balances, block, total};
}

