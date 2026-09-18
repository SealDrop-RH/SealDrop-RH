"use client";

import {useQuery} from "@tanstack/react-query";
import {useEffect} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {getAdapter} from "@/lib/locks/adapter";
import type {Address, LockFilter} from "@/lib/locks/types";

/**
 * react-query wrappers over the adapter.
 *
 * Query keys are declared in one place so an invalidation after a write cannot miss a
 * cache by spelling a key differently at the call site.
 */
export const lockKeys = {
  all: ["locks"] as const,
  lock: (id: string) => ["locks", "one", id] as const,
  list: (filter: LockFilter) => ["locks", "list", filter] as const,
  byOwner: (owner: Address | undefined, filter: Omit<LockFilter, "owner">) =>
    ["locks", "owner", owner, filter] as const,
  stats: () => ["locks", "stats"] as const,
};

export function useLock(id: string | undefined) {
  const adapter = getAdapter();
  return useQuery({
    queryKey: lockKeys.lock(id ?? ""),
    queryFn: () => adapter.getLock(id as string),
    enabled: Boolean(id),
  });
}

export function useLocksByOwner(owner: Address | undefined, filter: Omit<LockFilter, "owner"> = {}) {
  const adapter = getAdapter();
  return useQuery({
    queryKey: lockKeys.byOwner(owner, filter),
    queryFn: () => adapter.listLocksByOwner(owner as Address, filter),
    enabled: Boolean(owner),
  });
}

/**
 * Keeps queries in step with locks written into localStorage by this tab.
 *
 * saveLocal dispatches its own event because the native `storage` event only fires in other
 * tabs. Without this a lock created on /lock would not appear on /me until a reload, which
 * would look like the write had failed.
 */
export function useLocalLockSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => void queryClient.invalidateQueries({queryKey: lockKeys.all});
    window.addEventListener("pons-lock:local-change", invalidate);
    window.addEventListener("storage", invalidate);
    return () => {
      window.removeEventListener("pons-lock:local-change", invalidate);
      window.removeEventListener("storage", invalidate);
    };
  }, [queryClient]);
}
