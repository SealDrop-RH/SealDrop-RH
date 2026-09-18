"use client";

import {useQuery} from "@tanstack/react-query";
import {useAccount} from "wagmi";
import {isSimulated} from "@/lib/locks/adapter";
import {fixtureTokens} from "@/lib/locks/fixtures";
import {simulatedBalance} from "@/lib/locks/balance";
import type {Address} from "@/lib/locks/types";

export interface HeldToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw units, as a string: bigint does not survive JSON. */
  balance: string;
}

/**
 * What the connected wallet holds, for the token picker.
 *
 * On fixtures the sample tokens do not exist on any chain, so an indexer has nothing to say
 * about them; the same deterministic stand-in balance the rest of the simulated path uses is
 * returned instead, and the picker works against sample data exactly as it does against real.
 */
export function useHeldTokens(): {tokens: HeldToken[]; isPending: boolean} {
  const {address} = useAccount();
  const simulated = isSimulated();

  const {data, isPending} = useQuery({
    queryKey: ["held-tokens", address],
    queryFn: async (): Promise<HeldToken[]> => {
      const response = await fetch(`/api/tokens/held?address=${address}`);
      if (!response.ok) return [];
      const body = (await response.json()) as {tokens?: HeldToken[]};
      return body.tokens ?? [];
    },
    enabled: Boolean(address) && !simulated,
    staleTime: 30_000,
  });

  if (!address) return {tokens: [], isPending: false};

  if (simulated) {
    const tokens = fixtureTokens()
      .map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance: simulatedBalance(address, token).toString(),
      }))
      .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? 1 : -1));
    return {tokens, isPending: false};
  }

  return {tokens: data ?? [], isPending};
}
