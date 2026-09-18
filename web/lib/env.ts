import {envText} from "@/lib/chain";

/**
 * Public configuration. Everything here is inlined into the browser bundle, so nothing
 * secret may be read in this file. Each value is a literal member access for the reason
 * spelled out in lib/chain.ts.
 */

/**
 * Absolute origin. Every shared link and every OG image URL is built from it, and metadata
 * image URLs cannot be relative, so it has to be right rather than merely present.
 *
 * The order matters, and the middle entry is the whole point:
 *
 *   NEXT_PUBLIC_APP_URL                     set it and nothing else is consulted
 *   NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL   the project's production domain
 *   NEXT_PUBLIC_VERCEL_URL                  this one deployment, for previews
 *   localhost                               so `pnpm dev` still produces working cards
 *
 * VERCEL_URL alone used to be the only fallback, and it is the *generated deployment* URL:
 * a fresh `project-a1b2c3-team.vercel.app` for every push. So a visitor on the real domain
 * was handed a share link to whichever deployment happened to build last, which is both
 * ugly and short-lived. VERCEL_PROJECT_PRODUCTION_URL is the shortest production custom
 * domain and is set even on preview deployments, which is exactly why Vercel documents it
 * as the one to use for links that have to point at production.
 *
 * VERCEL_URL stays as the next fallback so a preview with system variables only partly
 * exposed still resolves to something real. Neither is used at all once NEXT_PUBLIC_APP_URL
 * is set, which is the certain fix and costs one line of project configuration.
 */
export const appUrl: string = (() => {
  const explicit = envText(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit.replace(/\/$/, "");
  const production = envText(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return `https://${production}`;
  const deployment = envText(process.env.NEXT_PUBLIC_VERCEL_URL);
  if (deployment) return `https://${deployment}`;
  return "http://localhost:3000";
})();

/**
 * Which locks implementation is live. "mock" until the contract exists.
 *
 * This is the single switch that turns part 1 into part 2. Nothing else in the app reads
 * it: components go through lib/locks/adapter.ts.
 */
export const locksAdapterKind: "mock" | "chain" =
  envText(process.env.NEXT_PUBLIC_LOCKS_ADAPTER) === "chain" ? "chain" : "mock";

/**
 * Which airdrops implementation is live, independently of locks.
 *
 * Its own switch, not a reuse of the locks one. PonsLock and PonsAirdrop are separate
 * contracts that can be wired up on different days, and sharing a variable meant that
 * pointing locks at the chain silently switched airdrops to an adapter whose every method
 * throws. Nothing said so: the page just loaded forever.
 */
export const airdropsAdapterKind: "mock" | "chain" =
  envText(process.env.NEXT_PUBLIC_AIRDROPS_ADAPTER) === "chain" ? "chain" : "mock";

export const walletConnectProjectId = envText(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
