"use client";

import {useCallback, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {activeChain, activeChainId, explorerTxUrl} from "@/lib/chain";
import {getAdapter} from "@/lib/locks/adapter";
import {describeError} from "@/lib/locks/errors";
import {useToast} from "@/components/ui/toast";
import {useWriteBridge} from "./useWriteBridge";
import {lockKeys} from "./useLocks";
import type {CreateLockInput, Hash, Lock, TxStatus} from "@/lib/locks/types";

/**
 * The one hook the form calls.
 *
 * It is deliberately thin and knows nothing about how a lock is actually created. Every
 * state transition originates in the adapter's onStatus callback, so this code cannot tell
 * whether the wallet was real, and part 2 changes nothing here.
 */

export interface LockTxState {
  status: TxStatus;
  hash?: Hash;
  error?: string;
  /** Present on success. The caller routes to the proof. */
  lock?: Lock;
}

export interface UseLockTx {
  state: LockTxState;
  busy: boolean;
  lock(input: CreateLockInput): Promise<Lock>;
  /** Take the tokens back out, once the unlock date has passed. */
  withdraw(id: string): Promise<Lock>;
  reset(): void;
  cancel(): void;
}

export function useLockTx(): UseLockTx {
  const adapter = getAdapter();
  const bridge = useWriteBridge();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [state, setState] = useState<LockTxState>({status: "idle"});
  const abort = useRef<AbortController | null>(null);

  const lock = useCallback(
    async (input: CreateLockInput) => {
      if (adapter.needsBridge && !bridge?.account) throw new Error("Wallet not connected");

      // Without this a wallet on another network signs against an address that holds no code
      // there, and the only feedback is an unexplained "execution reverted".
      if (adapter.needsBridge && bridge?.chainId !== undefined && bridge.chainId !== activeChainId) {
        throw new Error(
          `Wrong network: switch your wallet to ${activeChain.name} (chain ${activeChainId})`,
        );
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setState({status: "simulating"});

      try {
        const created = await adapter.createLock(input, {
          bridge,
          signal: controller.signal,
          onStatus: (status, context) => {
            setState((previous) => ({
              ...previous,
              status,
              hash: context.hash ?? previous.hash,
              error: undefined,
            }));
            if (status === "confirming" && context.hash) {
              toast.push({
                kind: "info",
                title: "Lock submitted",
                body: "Waiting for it to confirm.",
                link: explorerTxUrl(context.hash),
              });
            }
          },
        });

        setState({status: "success", hash: created.txHash, lock: created});
        toast.push({
          kind: "success",
          title: `${created.token.symbol} supply locked`,
          body: created.simulated ? "Simulated. No contract is deployed yet." : undefined,
        });
        // Not awaited, for the reason spelled out in lib/hooks/useAirdrops.ts: a list
        // refresh is a consequence of the write, and awaiting it here lets a failed
        // refetch throw after the lock already exists, into a caller that can only read
        // that as the lock having failed.
        void queryClient.invalidateQueries({queryKey: lockKeys.all});
        return created;
      } catch (error) {
        const message = describeError(error);
        setState({status: "error", error: message});
        toast.push({kind: "error", title: "Lock failed", body: message});
        throw error;
      }
    },
    [adapter, bridge, toast, queryClient],
  );

  const withdraw = useCallback(
    async (id: string) => {
      if (adapter.needsBridge && !bridge?.account) throw new Error("Wallet not connected");
      if (adapter.needsBridge && bridge?.chainId !== undefined && bridge.chainId !== activeChainId) {
        throw new Error(
          `Wrong network: switch your wallet to ${activeChain.name} (chain ${activeChainId})`,
        );
      }

      setState({status: "simulating"});
      try {
        const taken = await adapter.withdraw(id, {
          bridge,
          onStatus: (status, context) => {
            setState((previous) => ({
              ...previous,
              status,
              hash: context.hash ?? previous.hash,
              error: undefined,
            }));
            if (status === "confirming" && context.hash) {
              toast.push({
                kind: "info",
                title: "Withdrawal submitted",
                body: "Waiting for it to confirm.",
                link: explorerTxUrl(context.hash),
              });
            }
          },
        });

        setState({status: "success", hash: taken.txHash, lock: taken});
        toast.push({
          kind: "success",
          title: `${taken.token.symbol} withdrawn`,
          body: taken.simulated ? "Simulated. No contract is deployed yet." : undefined,
        });
        void queryClient.invalidateQueries({queryKey: lockKeys.all});
        return taken;
      } catch (error) {
        const message = describeError(error);
        setState({status: "error", error: message});
        toast.push({kind: "error", title: "Withdrawal failed", body: message});
        throw error;
      }
    },
    [adapter, bridge, toast, queryClient],
  );

  const reset = useCallback(() => setState({status: "idle"}), []);
  const cancel = useCallback(() => {
    abort.current?.abort();
    setState({status: "idle"});
  }, []);

  return {
    state,
    busy: state.status === "simulating" || state.status === "signing" || state.status === "confirming",
    lock,
    withdraw,
    reset,
    cancel,
  };
}
