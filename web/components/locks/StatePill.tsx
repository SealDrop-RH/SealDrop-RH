import {Badge} from "@/components/ui/primitives";
import {LOCK_STATE_LABEL} from "@/lib/locks/derive";
import type {LockState} from "@/lib/locks/types";

/**
 * State carries a label as well as a colour. Colour alone would leave the distinction to
 * people who can use it, and the four states are not equally good news.
 */
const TONE: Record<LockState, "neutral" | "accent" | "positive" | "warn"> = {
  pending: "warn",
  active: "accent",
  unlockable: "positive",
  withdrawn: "neutral",
};

export function StatePill({state}: {state: LockState}) {
  return <Badge tone={TONE[state]}>{LOCK_STATE_LABEL[state]}</Badge>;
}
