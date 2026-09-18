import Link from "next/link";
import {cn} from "@/lib/cn";
import {formatCompact, formatDate, formatPercent, lockedShare, shortAddress} from "@/lib/format";
import {AXIS, MICRO} from "@/components/ui/instrument";
import {RecordTag} from "@/components/ui/RecordTag";
import {StatePill} from "./StatePill";
import {Countdown} from "./Countdown";
import {CreationTx} from "@/components/chain/CreationTx";
import type {Lock} from "@/lib/locks/types";

/**
 * One lock, as it appears in a list.
 *
 * The share bar is a flat stand-in for the particle strip. The real canvas replaces it once
 * it exists, but the geometry is already the thing that matters: the filled portion is
 * exactly the locked share, so a row of these reads as a comparison at a glance.
 *
 * It is ruled at the same 25% graduations as the register's profile column, from the same
 * AXIS constant, so a reader who has learned the scale on the landing page already knows
 * how to read this one. Without the rules a bar is only comparable to the bars beside it;
 * with them it is comparable to every bar in the product.
 */
export function LockCard({lock}: {lock: Lock}) {
  const share = lockedShare(lock.amount, lock.token.totalSupply);

  return (
    <article
      className={cn(
        "group relative flex flex-col border border-border",
        "transition-[background-color,box-shadow] duration-[var(--dur-micro)] ease-out",
        "hover:bg-surface-2 hover:shadow-[inset_0_0_0_1px_var(--border-strong)]",
      )}
    >
      {/* A stretched link rather than a link wrapping the card: the card now carries its own
          transaction link, and an anchor inside an anchor is invalid and unpredictable. This one
          covers the card; the transaction row sits above it. */}
      <Link
        href={`/proof/${lock.id}`}
        aria-label={`$${lock.token.symbol}: ${formatPercent(share)} of supply locked`}
        className="absolute inset-0 z-[1]"
      />
      <div className="flex h-8 items-center justify-between gap-3 border-b border-border px-3">
        <p className={cn(MICRO, "flex min-w-0 items-center gap-2 text-fg")}>
          <span className="truncate">${lock.token.symbol}</span>
          <span className="num hidden shrink-0 text-[10px] normal-case tracking-normal text-fg-subtle sm:inline">
            {shortAddress(lock.token.address)}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <RecordTag kind="lock" />
          <StatePill state={lock.state} />
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div
          className="relative flex h-10 overflow-hidden"
          style={{background: "var(--supply-field)"}}
          role="img"
          aria-label={`${formatPercent(share)} of supply locked`}
        >
          <div style={{width: `${share * 100}%`, background: "var(--supply-locked)"}} />
          <div className="flex-1" style={{background: "var(--supply-free)"}} />
          {/* Drawn over the fill rather than under it, so the graduation stays readable
              across the locked block as well as the circulating field. */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={AXIS} />
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <p className="num text-[13px] text-fg">{formatPercent(share)} locked</p>
          <p className="num text-[11px] text-fg-subtle">
            {formatCompact(lock.amount, lock.token.decimals)} of{" "}
            {formatCompact(lock.token.totalSupply, lock.token.decimals)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {lock.state === "active" ? (
          <>
            <span className={cn(MICRO, "text-fg-subtle")}>Unlocks in</span>
            <Countdown unlockAt={lock.unlockAt} className="num text-[12px] text-fg" />
          </>
        ) : (
          <>
            <span className={cn(MICRO, "text-fg-subtle")}>
              {lock.state === "withdrawn" ? "Withdrawn" : "Unlocked"}
            </span>
            <span className="num text-[12px] text-fg">
              {formatDate(lock.withdrawnAt ?? lock.unlockAt)}
            </span>
          </>
        )}
      </div>

      <CreationTx kind="lock" id={lock.id} simulated={lock.simulated} />
    </article>
  );
}
