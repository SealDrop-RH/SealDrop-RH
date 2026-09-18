"use client";

import Link from "next/link";
import {Repeat} from "@phosphor-icons/react";
import {AirdropStatePill} from "./AirdropStatePill";
import {CreationTx} from "@/components/chain/CreationTx";
import {Countdown} from "@/components/locks/Countdown";
import {useClock} from "@/components/Clock";
import {atTime, claimedShare, releasedShare} from "@/lib/airdrops/derive";
import {dripFinished, formatRate, shortInterval} from "@/lib/airdrops/schedule";
import {formatCompact, formatDate, formatPercent, shortAddress} from "@/lib/format";
import type {Airdrop, Allocation} from "@/lib/airdrops/types";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import {RecordTag} from "@/components/ui/RecordTag";

/**
 * One airdrop in a list.
 *
 * When a wallet is connected the card leads with what that wallet gets, because that is the
 * only number the reader is looking for. Without one it falls back to the pool and the
 * threshold, which are the terms anyone can check.
 */
export function AirdropCard({airdrop: fetched, allocation}: {airdrop: Airdrop; allocation?: Allocation}) {
  const now = Math.floor(useClock() / 1000);
  const airdrop = atTime(fetched, now);
  const {decimals, symbol} = airdrop.token;
  const {schedule} = airdrop;
  const progress = claimedShare(airdrop);
  const released = releasedShare(airdrop);
  const releasing = Boolean(schedule) && now >= airdrop.startsAt && !dripFinished(airdrop, now);
  const stopped = airdrop.stoppedAt !== undefined;

  return (
    <article
      className={cn(
        "group relative flex flex-col border border-border",
        "transition-[background-color,box-shadow] duration-[var(--dur-micro)] ease-out",
        "hover:bg-surface-2 hover:shadow-[inset_0_0_0_1px_var(--border-strong)]",
      )}
    >
      {/* Stretched, for the same reason as LockCard: the transaction row is its own link. */}
      <Link
        href={`/airdrops/${airdrop.id}`}
        aria-label={`$${symbol} airdrop`}
        className="absolute inset-0 z-[1]"
      />
      {/* The same head LockCard wears, so a mixed grid on Explore reads as one register
          rather than as two lists that happen to be next to each other. */}
      <div className="flex h-8 items-center justify-between gap-3 border-b border-border px-3">
        <p className={cn(MICRO, "flex min-w-0 items-center gap-2 text-fg")}>
          <span className="truncate">${symbol}</span>
          <span className="num hidden shrink-0 text-[10px] normal-case tracking-normal text-fg-subtle sm:inline">
            by {shortAddress(airdrop.creator)}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <RecordTag kind="airdrop" />
          <AirdropStatePill state={airdrop.state} recurring={Boolean(airdrop.schedule)} />
        </span>
      </div>

      <div className="flex flex-col gap-4 p-3">
        {schedule && !stopped ? (
          <span className={cn(MICRO, "inline-flex w-fit items-center gap-1.5 text-accent")}>
            <Repeat size={10} weight="bold" aria-hidden />
            <span className="num normal-case tracking-normal">
              {formatRate(schedule.rateBps)} / {shortInterval(schedule.intervalSeconds)}
            </span>
          </span>
        ) : null}

        {allocation ? (
          <div className="flex flex-col gap-1 bg-surface-2 p-3 shadow-[inset_0_0_0_1px_var(--border)]">
            <p className="text-[11px] text-fg-subtle">
              {allocation.qualifies ? "You qualify for" : "You do not qualify"}
            </p>
            {allocation.qualifies ? (
              <p className="num text-[15px] text-accent">
                {formatCompact(allocation.amount, decimals)} {symbol}
              </p>
            ) : (
              <p className="num text-[12px] text-fg-muted">
                Needs {formatCompact(airdrop.minimumHolding, decimals)} {symbol}
              </p>
            )}
          </div>
        ) : null}

        <dl className="flex flex-col gap-1.5 text-[12.5px]">
          <Row
            label={schedule ? "Set aside" : "Pool"}
            value={`${formatCompact(airdrop.reserve, decimals)} ${symbol}`}
          />
          {schedule ? (
            <Row
              label="Released so far"
              value={`${formatCompact(airdrop.pool, decimals)} · ${formatPercent(released, 0)}`}
            />
          ) : (
            <Row label="Minimum holding" value={formatCompact(airdrop.minimumHolding, decimals)} />
          )}
          <Row label="Eligible wallets" value={airdrop.eligibleHolders.toLocaleString("en-US")} />
        </dl>

        <div className="flex flex-col gap-1.5">
          {/* Pale fill: released by the schedule. Solid: claimed out of it. Both against the reserve. */}
          <div className="relative h-1.5 overflow-hidden" style={{background: "var(--surface-3)"}}>
            <div
              className="absolute inset-y-0 left-0"
              style={{width: `${released * 100}%`, background: "var(--accent-line)"}}
            />
            <div
              className="absolute inset-y-0 left-0"
              style={{width: `${released * progress * 100}%`, background: "var(--accent)"}}
            />
          </div>
          <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="num text-fg-muted">
              {formatPercent(progress, 1)} {schedule ? "sent" : "claimed"}
            </span>
            {now < airdrop.startsAt ? (
              <span className="text-fg-subtle">
                opens in <Countdown unlockAt={airdrop.startsAt} className="text-fg" />
              </span>
            ) : releasing ? (
              /* Not a countdown. Nothing about a drip is worth being early for. */
              <span className="text-positive">paid automatically</span>
            ) : (
              <span className="num text-fg-subtle">{formatDate(airdrop.startsAt)}</span>
            )}
          </div>
        </div>
      </div>

      <CreationTx kind="airdrop" id={airdrop.id} simulated={airdrop.simulated} />
    </article>
  );
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(MICRO, "text-fg-subtle")}>{label}</dt>
      <dd className="num text-[12px] text-fg">{value}</dd>
    </div>
  );
}
