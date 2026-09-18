"use client";

import {Hint, Mono} from "@/components/ui/primitives";
import {dripRounds, type Dripping} from "@/lib/airdrops/schedule";
import {formatAmount, formatDateTime, humanDuration} from "@/lib/format";
import type {TokenMeta} from "@/lib/airdrops/types";

/**
 * The next few rounds, worked out.
 *
 * A rate and an interval are two abstractions, and nobody can multiply a decay curve in their
 * head. What "5% every ten minutes" actually means is 5,000, then 4,750, then 4,512, and the
 * only way to know whether that is the shape you wanted is to see the first few and watch the
 * gap between them close.
 *
 * `holderShare` turns the same rows into what one wallet takes, because "the round hands out
 * 5,000" answers the creator's question and not the holder's.
 */
export function DripTimeline({
  airdrop,
  token,
  now,
  count = 5,
  fromRound = 1,
  holderShare,
}: {
  airdrop: Dripping;
  token: TokenMeta;
  now: number;
  count?: number;
  fromRound?: number;
  /** balance / eligibleSupply, as a pair so the cut stays in bigint. */
  holderShare?: {balance: bigint; eligibleSupply: bigint};
}) {
  const rounds = dripRounds(airdrop, fromRound, count);
  if (rounds.length === 0) {
    return <Hint>This schedule has no rounds left to pay out.</Hint>;
  }

  const cut = (release: bigint): bigint | null => {
    if (!holderShare || holderShare.eligibleSupply <= 0n) return null;
    return (release * holderShare.balance) / holderShare.eligibleSupply;
  };

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col divide-y divide-border">
        {rounds.map((round) => {
          const holderCut = cut(round.release);
          const due = round.at - now;
          return (
            <li key={round.round} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[12.5px] text-fg-subtle">Round {round.round}</span>
                <span className="num text-[11px] text-fg-subtle">
                  {/* A round landing this second is "now", not a full UTC stamp of this second. */}
                  {due > 0 ? `in ${humanDuration(due)}` : due === 0 ? "now" : formatDateTime(round.at)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <Mono className="text-[13px] text-accent">
                  {formatAmount(round.release, token.decimals, 2)} {token.symbol}
                </Mono>
                <span className="num text-[11px] text-fg-subtle">
                  {holderCut === null ? (
                    <>{formatAmount(round.remaining, token.decimals, 0)} still held back</>
                  ) : (
                    <>you: {formatAmount(holderCut, token.decimals, 2)}</>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <Hint>
        Each round is a share of what is left, so every one is smaller than the one before it and
        the reserve is approached rather than emptied. These are the marks the release passes, not
        moments anyone has to wait for: it climbs between them and payouts follow it.
      </Hint>
    </div>
  );
}
