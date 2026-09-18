"use client";

import {useSyncExternalStore} from "react";
import {getLocalSnapshot, getLocalServerSnapshot, subscribeLocal} from "@/lib/locks/store";
import type {Lock} from "@/lib/locks/types";

/** Locks this browser created. Empty on the server, which is the honest answer there. */
export function useLocalLocks(): Lock[] {
  return useSyncExternalStore(subscribeLocal, getLocalSnapshot, getLocalServerSnapshot);
}

export function useLocalLock(id: string): Lock | null {
  const locks = useLocalLocks();
  return locks.find((lock) => lock.id === id) ?? null;
}
