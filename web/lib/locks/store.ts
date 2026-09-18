import {deserialiseLocks, serialiseLocks} from "./codec";
import type {Lock} from "./types";

/**
 * Locks the user created in this browser.
 *
 * Deliberately NOT a "use client" module. The mock adapter runs on both sides, so a server
 * component rendering /explore imports this file, and a "use client" export cannot be
 * called from the server at all: it becomes a reference, not a function. Every entry point
 * here guards on `window` and no-ops server-side instead, which is the honest answer, since
 * the server genuinely has no localStorage. The hook that subscribes to it,
 * lib/hooks/useLocalLocks.ts, is the client module.
 *
 * localStorage, which means they are visible to the client and not to a server component.
 * That is a real limit and it is surfaced as a named state rather than hidden: see
 * app/proof/[id]/LocalProofFallback.tsx. It goes away in part 2, when the chain becomes
 * the store and both sides read the same thing.
 */

const KEY = "pons-lock-local-locks";

export function readLocal(): Lock[] {
  if (typeof window === "undefined") return [];
  try {
    return deserialiseLocks(window.localStorage.getItem(KEY));
  } catch {
    // Private mode and locked-down Safari both throw on access rather than returning null.
    return [];
  }
}

export function saveLocal(lock: Lock): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readLocal().filter((entry) => entry.id !== lock.id);
    window.localStorage.setItem(KEY, serialiseLocks([lock, ...existing]));
    cache = null;
    // Same-tab listeners: the storage event only fires in *other* tabs.
    window.dispatchEvent(new CustomEvent("pons-lock:local-change"));
  } catch {
    // Losing a simulated lock to a full or refusing store is not worth an error state.
  }
}

export function clearLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    cache = null;
    window.dispatchEvent(new CustomEvent("pons-lock:local-change"));
  } catch {
    // Nothing to do.
  }
}

/* ---- reading the store from React ------------------------------------------
   useSyncExternalStore rather than an effect that calls setState. localStorage is an
   external store, and that is the hook for reading one: it gets the value on the first
   render instead of on a second pass, and it handles the server having no store at all.

   The snapshot has to be referentially stable or React re-renders forever, so the parsed
   array is cached and the cache is dropped only when something actually writes.
   --------------------------------------------------------------------------- */

let cache: Lock[] | null = null;

/** The server has no localStorage. One frozen constant, so the reference never changes. */
const EMPTY: Lock[] = [];

export function getLocalSnapshot(): Lock[] {
  if (cache === null) cache = readLocal();
  return cache;
}

export function getLocalServerSnapshot(): Lock[] {
  return EMPTY;
}

export function subscribeLocal(onChange: () => void): () => void {
  const handler = () => {
    cache = null;
    onChange();
  };
  // The native `storage` event fires only in other tabs, so saveLocal dispatches its own
  // for this one. Both are needed: one tab writing and another reading is a real case.
  window.addEventListener("pons-lock:local-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("pons-lock:local-change", handler);
    window.removeEventListener("storage", handler);
  };
}
