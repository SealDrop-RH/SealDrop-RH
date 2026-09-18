import {getAirdropsAdapter} from "@/lib/airdrops/adapter";
import {atTime} from "@/lib/airdrops/derive";
import type {Airdrop} from "@/lib/airdrops/types";
import type {Address} from "@/lib/locks/types";

/**
 * The project's own airdrop, for the front page.
 *
 * Read on every visit to the register, which is the page that went down when a burst of
 * visitors met a flaky RPC, so it follows the same rules as the lock page reads in
 * lib/locks/chain.ts: one read is shared for fifteen seconds, a failure is never cached, and a
 * failure falls back to the last good read for up to ten minutes.
 *
 * It never throws. With nothing to show it returns null, and the page features a lock instead,
 * which is a worse front page but a working one.
 */

const TTL_MS = 15_000;
const MAX_STALE_MS = 10 * 60_000;

const shared = new Map<string, {promise: Promise<Airdrop | null>; startedAt: number}>();
const lastGood = new Map<string, {airdrop: Airdrop | null; at: number}>();

/** Still running first, then the largest reserve: the one most worth putting on the fold. */
function pick(list: Airdrop[]): Airdrop | null {
  const ranked = [...list].sort((a, b) => {
    const stopped = Number(a.stoppedAt !== undefined) - Number(b.stoppedAt !== undefined);
    if (stopped !== 0) return stopped;
    return a.reserve === b.reserve ? 0 : a.reserve > b.reserve ? -1 : 1;
  });
  return ranked[0] ?? null;
}

async function read(token: Address): Promise<Airdrop | null> {
  const list = await getAirdropsAdapter().listAirdrops({token});
  return pick(list);
}

export async function featuredAirdropFor(token: Address): Promise<Airdrop | null> {
  const key = token.toLowerCase();
  const entry = shared.get(key);

  let promise: Promise<Airdrop | null>;
  if (entry && Date.now() - entry.startedAt < TTL_MS) {
    promise = entry.promise;
  } else {
    promise = read(token).then(
      (airdrop) => {
        lastGood.set(key, {airdrop, at: Date.now()});
        return airdrop;
      },
      () => {
        shared.delete(key);
        const fallback = lastGood.get(key);
        return fallback && Date.now() - fallback.at < MAX_STALE_MS ? fallback.airdrop : null;
      },
    );
    shared.set(key, {promise, startedAt: Date.now()});
  }

  const airdrop = await promise;
  // Released is a function of the current second, so it is recomputed on every call rather
  // than frozen at whatever moment the shared read happened to run. The clock is read here and
  // not passed in: a page render may not call Date.now, and this is not a render.
  return airdrop ? atTime(airdrop, Math.floor(Date.now() / 1000)) : null;
}
