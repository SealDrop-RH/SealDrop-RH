"use client";

import {useCallback, useEffect, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useAccount} from "wagmi";
import {getAirdropsAdapter} from "@/lib/airdrops/adapter";
import {useWriteBridge} from "@/lib/hooks/useWriteBridge";
import {subscribeAirdrops} from "@/lib/airdrops/store";
import {NothingToDoError, describeError} from "@/lib/locks/errors";
import {useToast} from "@/components/ui/toast";
import {explorerTxUrl} from "@/lib/chain";
import type {
  AdjustAirdropInput,
  Airdrop,
  AirdropFilter,
  Allocation,
  CreateAirdropInput,
} from "@/lib/airdrops/types";
import type {TxStatus} from "@/lib/locks/types";

export const airdropKeys = {
  all: ["airdrops"] as const,
  one: (id: string) => ["airdrops", "one", id] as const,
  list: (filter: AirdropFilter) => ["airdrops", "list", filter] as const,
  allocation: (id: string, holder?: string) => ["airdrops", "allocation", id, holder] as const,
  claimable: (holder?: string) => ["airdrops", "claimable", holder] as const,
};

/**
 * How often an open airdrop page asks the chain again.
 *
 * Payouts are pushed by the keeper now, so what has been sent, and to whom, changes while a
 * page sits open with nobody touching it. The release figure already ticks from the clock; these
 * are the facts only the chain knows. Without polling a page opened before a payout keeps saying
 * "0 sent" long after the tokens have landed, which reads as the airdrop being broken. Hidden
 * tabs do not poll.
 */
const LIVE_REFETCH_MS = 30_000;

export function useAirdrops(filter: AirdropFilter = {}) {
  useAirdropSync();
  return useQuery({
    queryKey: airdropKeys.list(filter),
    queryFn: () => getAirdropsAdapter().listAirdrops(filter),
    refetchInterval: LIVE_REFETCH_MS * 2,
  });
}

export function useAirdrop(id: string | undefined) {
  useAirdropSync();
  return useQuery({
    queryKey: airdropKeys.one(id ?? ""),
    queryFn: () => getAirdropsAdapter().getAirdrop(id as string),
    enabled: Boolean(id),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAllocation(id: string | undefined): Allocation | null {
  const {address} = useAccount();
  useAirdropSync();
  const {data} = useQuery({
    queryKey: airdropKeys.allocation(id ?? "", address),
    queryFn: () => getAirdropsAdapter().allocationFor(id as string, address as `0x${string}`),
    enabled: Boolean(id && address),
    refetchInterval: LIVE_REFETCH_MS,
  });
  return data ?? null;
}

export function useClaimable() {
  const {address} = useAccount();
  useAirdropSync();
  return useQuery({
    queryKey: airdropKeys.claimable(address),
    queryFn: () => getAirdropsAdapter().listClaimable(address as `0x${string}`),
    enabled: Boolean(address),
  });
}

/**
 * Keeps queries in step with airdrops written into localStorage by this tab.
 *
 * The store dispatches its own event because the native `storage` event only fires in other
 * tabs. Without this a claim would not show up until a reload, which reads as the claim
 * having failed.
 */
function useAirdropSync() {
  const queryClient = useQueryClient();
  useEffect(() => subscribeAirdrops(() => {
    void queryClient.invalidateQueries({queryKey: airdropKeys.all});
  }), [queryClient]);
}

export interface AirdropTxState {
  status: TxStatus;
  error?: string;
}

/**
 * Create, adjust and claim, sharing the transaction lifecycle the lock flow uses so the two
 * feel like one product rather than two features.
 */
export function useAirdropTx() {
  const adapter = getAirdropsAdapter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const bridge = useWriteBridge();
  const [state, setState] = useState<AirdropTxState>({status: "idle"});

  const run = useCallback(
    async <T,>(
      label: string,
      action: (hooks: {
        onStatus: (s: TxStatus, c: {hash?: `0x${string}`}) => void;
        bridge?: ReturnType<typeof useWriteBridge>;
      }) => Promise<T>,
    ) => {
      setState({status: "simulating"});
      try {
        const result = await action({
          bridge,
          onStatus: (status, context) => {
            setState({status});
            if (status === "confirming" && context.hash) {
              toast.push({kind: "info", title: `${label} submitted`, link: explorerTxUrl(context.hash)});
            }
          },
        });
        setState({status: "success"});
        toast.push({kind: "success", title: `${label} confirmed`, body: "Simulated. No contract is deployed yet."});
        /**
         * Refreshing the list is a consequence of the transaction, not part of it, so it
         * must not stand between the caller and the result.
         *
         * Awaiting it here made creating an airdrop look like it had worked and then go
         * nowhere: the four steps went green, and the redirect to the new airdrop never
         * ran. Every airdrop in the list resolves its token through the locks adapter, so
         * with locks on chain and airdrops on fixtures this refetch is a fan of RPC calls.
         * One rejection, and `run` threw after the transaction had already succeeded, into
         * a caller whose catch could only assume the write had failed.
         */
        void queryClient.invalidateQueries({queryKey: airdropKeys.all});
        return result;
      } catch (error) {
        // Nothing to do is not a failure. Saying "failed" over a button that correctly
        // declined to send a pointless transaction is how a working thing gets reported as
        // broken.
        if (error instanceof NothingToDoError) {
          setState({status: "idle"});
          toast.push({kind: "info", title: "Nothing to publish", body: error.message});
          throw error;
        }

        const message = describeError(error);
        setState({status: "error", error: message});
        toast.push({kind: "error", title: `${label} failed`, body: message});
        throw error;
      }
    },
    [toast, queryClient, bridge],
  );

  return {
    state,
    busy: ["simulating", "signing", "confirming"].includes(state.status),
    reset: useCallback(() => setState({status: "idle"}), []),
    create: useCallback(
      (input: CreateAirdropInput) => run("Airdrop", (hooks) => adapter.createAirdrop(input, hooks)),
      [adapter, run],
    ),
    adjust: useCallback(
      (input: AdjustAirdropInput) => run("Adjustment", (hooks) => adapter.adjustAirdrop(input, hooks)),
      [adapter, run],
    ),
    stop: useCallback(
      (id: string, caller: `0x${string}`) => run("Stop", (hooks) => adapter.stopAirdrop(id, caller, hooks)),
      [adapter, run],
    ),
    claim: useCallback(
      (id: string, holder: `0x${string}`) => run("Claim", (hooks) => adapter.claim(id, holder, hooks)),
      [adapter, run],
    ),
  };
}

export type {Airdrop};
