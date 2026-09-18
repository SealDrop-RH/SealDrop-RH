import {locksAdapterKind} from "@/lib/env";
import {mockAdapter} from "./mock";
import {chainAdapter} from "./chain";
import type {LocksAdapter} from "./types";

/**
 * The seam.
 *
 * Every component and every server route reads locks through this and never imports mock.ts
 * or chain.ts directly. Turning part 1 into part 2 is one environment variable, and nothing
 * above this line has to know it happened.
 */
export function getAdapter(): LocksAdapter {
  return locksAdapterKind === "chain" ? chainAdapter : mockAdapter;
}

/** True while locks are simulated. Drives the watermark on every proof surface. */
export function isSimulated(): boolean {
  return getAdapter().kind === "mock";
}
