import {robinhood, robinhoodTestnet, type Chain} from "viem/chains";

/**
 * Robinhood Chain ships in viem, so there is no `defineChain` here on purpose: a hand-rolled
 * definition is one more place for an RPC URL or a chain id to drift.
 */
export const SUPPORTED_CHAINS = {
  4663: robinhood,
  46630: robinhoodTestnet,
} as const satisfies Record<number, Chain>;

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

export function isSupportedChainId(id: number): id is SupportedChainId {
  return id in SUPPORTED_CHAINS;
}

/** Blank env values are treated as unset: an empty line in .env is not a setting. */
export function envText(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, "");
  return trimmed ? trimmed : undefined;
}

/**
 * The chain this deployment targets. Defaults to mainnet, because the Pons family tokens a
 * holder would actually want to lock live there, and part 1 signs nothing anyway.
 *
 * Written as a literal `process.env.NEXT_PUBLIC_...` member access on purpose: a dynamic
 * index defeats Next's build-time inlining, so the browser would read `undefined` and
 * silently fall back to the default.
 */
export const activeChainId: SupportedChainId = (() => {
  const raw = envText(process.env.NEXT_PUBLIC_CHAIN_ID);
  const id = Number(raw ?? 4663);
  if (!isSupportedChainId(id)) throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID ${raw}`);
  return id;
})();

export const activeChain: Chain = SUPPORTED_CHAINS[activeChainId];

/** viem's built-in points at the public endpoint, which is rate limited. Override in production. */
export const publicRpcUrl: string =
  envText(process.env.NEXT_PUBLIC_RPC_URL) ?? activeChain.rpcUrls.default.http[0];

export const explorerUrl: string =
  activeChain.blockExplorers?.default.url ?? "https://robinhoodchain.blockscout.com";

export const explorerTxUrl = (hash: string) => `${explorerUrl}/tx/${hash}`;
export const explorerAddressUrl = (address: string) => `${explorerUrl}/address/${address}`;

/** The lock contract. Empty until part 2 deploys one, which is what keeps the mock honest. */
export const lockerAddress = (envText(process.env.NEXT_PUBLIC_LOCKER_ADDRESS) ?? "") as
  | `0x${string}`
  | "";
