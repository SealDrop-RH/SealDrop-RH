/**
 * The dev fault dial.
 *
 * Not a "use client" module, for the same reason as store.ts: the mock adapter reads it and
 * runs on both sides. It reports "none" on the server, where there is no session storage
 * and no one to click a dial.
 *
 * Every failure path in the transaction flow has to be reachable with one click, or it is
 * written once, never seen, and quietly rots. Stored in sessionStorage so it resets when
 * the tab closes and cannot be left switched on by accident.
 */

export const FAULTS = [
  "none",
  "reject",
  "revert",
  "insufficient-gas",
  "wrong-network",
  "timeout",
  "slow-sign",
] as const;

export type Fault = (typeof FAULTS)[number];

export const FAULT_LABEL: Record<Fault, string> = {
  none: "Succeed",
  reject: "Rejected in wallet",
  revert: "Reverts on chain",
  "insufficient-gas": "Not enough ETH",
  "wrong-network": "Wrong network",
  timeout: "Never confirms",
  "slow-sign": "Slow to sign",
};

const KEY = "pons-lock-fault";

export function readFault(): Fault {
  if (typeof window === "undefined") return "none";
  try {
    const value = window.sessionStorage.getItem(KEY);
    return (FAULTS as readonly string[]).includes(value ?? "") ? (value as Fault) : "none";
  } catch {
    return "none";
  }
}

export function writeFault(fault: Fault): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, fault);
    window.dispatchEvent(new CustomEvent("pons-lock:fault-change"));
  } catch {
    // Nothing to do.
  }
}
