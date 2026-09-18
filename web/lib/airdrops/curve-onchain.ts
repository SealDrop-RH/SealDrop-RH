/**
 * The release curve, computed exactly the way PonsDrip computes it.
 *
 * A deliberate duplicate of lib/airdrops/schedule.ts, and the duplication is the point. That
 * one is the app's own model and carries 36 digits of fixed point because nothing on screen is
 * constrained by a uint256. This one mirrors the Solidity operation for operation, at the same
 * RAY scale and with the same truncating integer division, because the number it produces has
 * to be byte-identical to the contract's.
 *
 * It matters at exactly one moment: the root published when a drip is created commits to the
 * amounts released at that instant, and the contract will only pay out against its own reading
 * of the curve. A root built from a figure that is one unit different is a root nobody can
 * claim against. Everywhere after creation the contract is asked directly, via `releasedAt`.
 */

const RAY = 10n ** 27n;
const BPS = 10_000n;

/** Mirror of PonsDrip._remainingAfter. Same scale, same order, same truncation. */
export function remainingAfterOnChain(reserve: bigint, rateBps: number, rounds: number): bigint {
  if (reserve === 0n) return 0n;
  if (rounds <= 0) return reserve;
  if (BigInt(rateBps) >= BPS) return 0n;

  let factor = RAY;
  let base = ((BPS - BigInt(rateBps)) * RAY) / BPS;
  let n = BigInt(rounds);

  while (n > 0n) {
    if (n & 1n) {
      factor = (factor * base) / RAY;
      if (factor === 0n) return 0n;
    }
    n >>= 1n;
    if (n > 0n) base = (base * base) / RAY;
  }
  return (reserve * factor) / RAY;
}

/**
 * What the contract will say it has released at the instant of creation.
 *
 * `startsAt` is set to the creation timestamp, so at that moment exactly one round has landed
 * and nothing has accrued into the next one.
 */
export function releasedAtCreationOnChain(reserve: bigint, rateBps: number): bigint {
  return reserve - remainingAfterOnChain(reserve, rateBps, 1);
}

/**
 * Mirror of PonsDrip.releasedAt, operation for operation.
 *
 * So a figure can tick on screen every second without asking the chain every second. What a
 * wallet is owed is `releasedAt(now) * share / 1e18`, and both halves of that are knowable
 * here: the share came from the proof and the curve is arithmetic. Polling the contract at one
 * second intervals would be the same answer at the cost of an RPC round trip per tick, and the
 * proof route behind it replays logs, so it would be a great deal worse than that.
 *
 * It mirrors rather than approximates on purpose. lib/airdrops/schedule.ts models the same
 * curve at more precision for the app's own use; this one has to agree with the contract to the
 * last unit, because it sits directly above a button that spends the number.
 */
export function releasedAtOnChain(
  drip: {
    startsAt: number;
    reserve: bigint;
    rateBps: number;
    intervalSeconds: number;
    maxRounds?: number;
    /** When it was stopped, if it was. The curve is frozen from that moment. */
    stoppedAt?: number;
    /** What had been released at the stop. */
    stoppedRelease?: bigint;
  },
  timestamp: number,
): bigint {
  if (drip.stoppedAt !== undefined && timestamp >= drip.stoppedAt) {
    return drip.stoppedRelease ?? 0n;
  }
  if (timestamp < drip.startsAt) return 0n;

  const interval = Math.max(1, Math.floor(drip.intervalSeconds));
  const elapsed = timestamp - drip.startsAt;
  const rounds = Math.floor(elapsed / interval) + 1;

  if (drip.maxRounds && drip.maxRounds > 0 && rounds > drip.maxRounds) {
    return drip.reserve - remainingAfterOnChain(drip.reserve, drip.rateBps, drip.maxRounds);
  }

  const remaining = remainingAfterOnChain(drip.reserve, drip.rateBps, rounds);
  const settled = drip.reserve - remaining;

  const into = elapsed % interval;
  if (into === 0) return settled;

  const next = remaining - remainingAfterOnChain(drip.reserve, drip.rateBps, rounds + 1);
  return settled + (next * BigInt(into)) / BigInt(interval);
}
