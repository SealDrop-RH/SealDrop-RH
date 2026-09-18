"use client";

import {useMemo} from "react";
import {erc20Abi} from "viem";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {activeChainId} from "@/lib/chain";
import type {WriteBridge, WriteRequest} from "@/lib/locks/types";

/**
 * Builds the WriteBridge the chain adapter will need in part 2.
 *
 * It exists now, and the mock ignores it, on purpose. lib/locks/chain.ts is a plain module
 * and cannot call wagmi hooks, so without this port createLock would have to become a hook
 * in part 2 and every caller would change. Building the bridge later means building it
 * twice; building it now means part 2 is filling in one file.
 *
 * Every read and write is pinned to the chain this deployment targets, because the contract
 * addresses only exist there.
 */
export function useWriteBridge(): WriteBridge | undefined {
  const publicClient = usePublicClient({chainId: activeChainId});
  const {writeContractAsync} = useWriteContract();
  const {address, chainId} = useAccount();

  return useMemo(() => {
    if (!publicClient) return undefined;

    return {
      account: address,
      chainId,

      async simulate(request: WriteRequest) {
        await publicClient.simulateContract({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          value: request.value,
          account: address,
        } as Parameters<typeof publicClient.simulateContract>[0]);
      },

      async write(request: WriteRequest) {
        return writeContractAsync({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          value: request.value,
          chainId: activeChainId,
        } as Parameters<typeof writeContractAsync>[0]);
      },

      async wait(hash) {
        const receipt = await publicClient.waitForTransactionReceipt({hash, confirmations: 1});
        return {status: receipt.status === "success" ? "success" : "reverted"};
      },

      async readErc20<T>(token: `0x${string}`, functionName: string, args: readonly unknown[] = []) {
        return publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName,
          args,
        } as Parameters<typeof publicClient.readContract>[0]) as Promise<T>;
      },
    } satisfies WriteBridge;
  }, [publicClient, writeContractAsync, address, chainId]);
}
