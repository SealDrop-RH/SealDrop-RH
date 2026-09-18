import {airdropsAdapterKind} from "@/lib/env";
import {chainAirdropsAdapter} from "./chain";
import {mockAirdropsAdapter} from "./mock";
import type {AirdropsAdapter} from "./types";

/**
 * The seam. Nothing above this line knows which side it is on.
 */
export function getAirdropsAdapter(): AirdropsAdapter {
  return airdropsAdapterKind === "chain" ? chainAirdropsAdapter : mockAirdropsAdapter;
}
