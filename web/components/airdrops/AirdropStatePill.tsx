import {Badge} from "@/components/ui/primitives";
import {AIRDROP_STATE_LABEL} from "@/lib/airdrops/derive";
import type {AirdropState} from "@/lib/airdrops/types";

const TONE: Record<AirdropState, "warn" | "accent" | "neutral"> = {
  scheduled: "warn",
  live: "accent",
  finished: "neutral",
};

/**
 * A drip's holders are paid without asking, so "Claimable" would be telling them to do
 * something they no longer have to. A one-off pool is still claimed, and keeps its words.
 */
const DRIP_LABEL: Record<AirdropState, string> = {
  scheduled: "Scheduled",
  live: "Paying out",
  finished: "Fully paid out",
};

export function AirdropStatePill({state, recurring = false}: {state: AirdropState; recurring?: boolean}) {
  return <Badge tone={TONE[state]}>{(recurring ? DRIP_LABEL : AIRDROP_STATE_LABEL)[state]}</Badge>;
}
