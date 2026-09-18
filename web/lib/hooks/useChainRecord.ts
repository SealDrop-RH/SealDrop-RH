"use client";

import {useQuery} from "@tanstack/react-query";
import type {ChainEvent, RecordKind, SourceVerification} from "@/lib/chain/history";

export interface ChainRecordData {
  chainId: number;
  contract: `0x${string}`;
  id: string;
  created: ChainEvent | null;
  events: ChainEvent[];
  total: number;
  verification: SourceVerification;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "The chain could not be reached");
  return body as T;
}

/** One record's transactions and its contract's verification, kept current while the page is open. */
export function useChainRecord(kind: RecordKind, id: string, enabled = true) {
  return useQuery({
    queryKey: ["chain", "record", kind, id],
    queryFn: () => getJson<ChainRecordData>(`/api/chain/record?kind=${kind}&id=${id}`),
    enabled,
    refetchInterval: 30_000,
  });
}

/**
 * The creating transaction of one record, for a list card.
 *
 * Every card on a page asks through the same query key, so a grid of fifty cards is one request
 * for the whole index, not fifty.
 */
export function useCreationTx(kind: RecordKind, id: string, enabled = true) {
  const query = useQuery({
    queryKey: ["chain", "created", kind],
    queryFn: () => getJson<{txs: Record<string, `0x${string}`>}>(`/api/chain/created?kind=${kind}`),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return {hash: query.data?.txs[id] ?? null, isPending: query.isPending && enabled, isError: query.isError};
}
