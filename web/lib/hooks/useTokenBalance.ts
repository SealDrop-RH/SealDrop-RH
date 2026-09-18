"use client";

import {erc20Abi} from "viem";
import {useAccount, useReadContract} from "wagmi";
import {activeChainId} from "@/lib/chain";
import {isSimulated} from "@/lib/locks/adapter";
import type {TokenMeta} from "@/lib/locks/types";

/**
 * What the connected wallet holds of a token.
 *
 * While locks are simulated the fixture tokens do not exist on chain, so a real balanceOf
 * would fail and the form would be unusable against its own sample data. A deterministic
 * stand-in is derived from the address instead, and it is stated plainly in the UI that the
 * balance is simulated. In part 2 this returns the real read and nothing else changes.
 */
export function useTokenBalance(token: TokenMeta | null): bigint | undefined {
  const {address} = useAccount();

  const {data} = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: {enabled: Boolean(token && address && !isSimulated())},
  });

  if (!token || !address) return undefined;

  if (isSimulated()) {
    // Between 1% and 12% of supply, derived from the wallet and the token so it is stable
    // across reloads rather than changing every render.
    const seed = BigInt(`0x${address.slice(2, 10)}`) % 1100n;
    return (token.totalSupply * (100n + seed)) / 10_000n;
  }

  return data as bigint | undefined;
}
