import {envText} from "@/lib/chain";
import type {Address} from "@/lib/locks/types";

/**
 * Where to send someone who wants to buy the token an airdrop pays out in.
 *
 * Pons runs the launchpad these tokens are issued from, so its page for a token is the one
 * place a reader can act on "I need more of this to qualify". Configurable because the
 * launchpad's host is not this app's to assume, and because a deployment pointed at a test
 * chain wants a different one from a deployment pointed at mainnet.
 *
 * Literal member access for the reason in lib/chain.ts: a dynamic index defeats Next's
 * build-time inlining and the browser reads undefined.
 */
export const launchpadBase: string = (
  envText(process.env.NEXT_PUBLIC_PONS_LAUNCHPAD_URL) ?? "https://www.ponsfamily.com/launchpad"
).replace(/\/$/, "");

/** The launchpad page for one token. */
export function launchpadUrl(token: Address): string {
  return `${launchpadBase}/${token}`;
}
