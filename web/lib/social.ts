import {launchpadUrl} from "@/lib/pons";
import type {Address} from "@/lib/locks/types";

/**
 * Where the project lives outside this site.
 *
 * One list, read by every place that links out to it, so a handle that changes is changed
 * once and cannot end up pointing somewhere different in the header and the menu.
 */
export const SOCIAL = {
  github: {label: "GitHub", href: "https://github.com/SealDrop-RH/SealDrop-RH"},
  x: {label: "X", href: "https://x.com/sealdropfamily"},
} as const;

/**
 * The $SEAL contract address. Empty until the token is live.
 *
 * Kept in code rather than in an environment variable on purpose. For a token, the official
 * address is something people check before they buy, and a value anyone can read in the
 * repository is a better answer to "is this the real one" than a value that only exists in a
 * deployment's settings.
 *
 * While it is empty the ticker renders as SOON and is not a link at all. A placeholder like
 * 0x000... behind a working link would send people to whatever token happens to live at that
 * address, which on a public chain can be one somebody put there deliberately.
 */
export const SEAL_ADDRESS = "";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The launchpad page for a token address, or null when there is nothing safe to link to.
 *
 * Validated, not merely non-empty: a mistyped address is exactly the case the note above is
 * about, and it would otherwise produce a perfectly working link to the wrong place.
 */
export function tokenHref(address: string): string | null {
  return ADDRESS.test(address) ? launchpadUrl(address as Address) : null;
}

export const SEAL_TOKEN: {symbol: string; href: string | null} = {
  symbol: "SEAL",
  href: tokenHref(SEAL_ADDRESS),
};
