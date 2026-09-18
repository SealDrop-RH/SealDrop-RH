import Link from "next/link";
import type {ReactNode} from "react";
import {cn} from "@/lib/cn";
import {
  formatCompact,
  formatDate,
  formatPercent,
  humanDuration,
  lockedShare,
  shortAddress,
} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";
import type {Airdrop} from "@/lib/airdrops/types";
import {claimedShare, releasedShare} from "@/lib/airdrops/derive";
import {describeInterval, formatRate, shortInterval} from "@/lib/airdrops/schedule";
import {AXIS, MICRO, Readout, SectionHead, Spec, actionClass} from "@/components/ui/instrument";
import {StripField} from "./StripField";

/**
 * The second measurement of the same lock: not how much, but how long.
 *
 * The strip is a span of supply and says nothing about time; the countdown in the specs is
 * a number and says nothing about proportion. This is the one thing that shows where the
 * lock currently sits between the day it was signed and the day it opens, ruled at the same
 * quarter graduations the register uses, so both axes on the page read the same way.
 */
function Period({
  lockedAt,
  unlockAt,
  asOf,
}: {
  lockedAt: number;
  unlockAt: number;
  asOf: number;
}) {
  const span = Math.max(1, unlockAt - lockedAt);
  const elapsed = Math.min(1, Math.max(0, (asOf - lockedAt) / span));

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn(MICRO, "text-fg-subtle")}>Lock period</p>
        <p className={cn(MICRO, "text-fg-subtle")}>
          Elapsed{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {(elapsed * 100).toFixed(0)}%
          </span>
        </p>
      </div>

      <div className="relative h-8 overflow-hidden bg-bg-elev shadow-[inset_0_0_0_1px_var(--border)]">
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full bg-surface-2"
          style={{width: `${elapsed * 100}%`}}
        />
        <div aria-hidden className="absolute inset-0" style={AXIS} />
        {/* Today. A single rule, because the whole point of the lock is that this line only
            ever moves one way. */}
        <div
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-accent"
          style={{left: `${elapsed * 100}%`}}
        />
      </div>

      <div className={cn(MICRO, "flex items-baseline justify-between gap-3 text-fg-subtle")}>
        <p>
          Signed{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {formatDate(lockedAt)}
          </span>
        </p>
        <p>
          Opens{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {formatDate(unlockAt)}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * The fold.
 *
 * There is no headline. The largest type on the page is a measurement, and the sentence
 * that would normally be the headline is set at caption size in the right hand column,
 * below the totals, where a specification sheet would put it.
 *
 * Left: one real lock, stated twice. Once as a number large enough to read across a room,
 * once as the strip, which is the same fact drawn. Right: the totals for the whole register
 * and the two things a visitor can do.
 *
 * Both columns are bounded by the same hairline grid, so the fold reads as one panel rather
 * than as a hero with a sidebar bolted to it.
 */
export function Instrument({
  featured,
  asOf,
  records,
  tokens,
  meanShare,
  largestShare,
  nextUnlockAt,
}: {
  /** The left column: a FeaturedLock or a FeaturedAirdrop. */
  featured: ReactNode;
  /** Unix seconds. The adapter's snapshot, so the server and the browser agree on "now". */
  asOf: number;
  records: number;
  tokens: number;
  meanShare: number;
  largestShare: number;
  nextUnlockAt?: number;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:grid-cols-12">
        {/* ---- the featured record ---- */}
        <div className="flex min-w-0 flex-col lg:col-span-8 lg:border-r lg:border-border">{featured}</div>

        {/* ---- the totals, and the only sales copy on the fold ---- */}
        <aside className="flex min-w-0 flex-col border-t border-border bg-bg-elev lg:col-span-4 lg:border-t-0">
          <SectionHead tag="Sum" title="Register totals" note="All locks" />

          <Readout label="Records" value={records.toLocaleString("en-US")} />
          <Readout label="Tokens" value={tokens.toLocaleString("en-US")} />
          <Readout label="Mean share locked" value={(meanShare * 100).toFixed(1)} unit="%" />
          <Readout label="Largest share" value={(largestShare * 100).toFixed(1)} unit="%" />
          <Readout
            label="Next release"
            value={nextUnlockAt ? humanDuration(Math.max(0, nextUnlockAt - asOf)) : "None"}
            unit={nextUnlockAt ? formatDate(nextUnlockAt) : undefined}
          />

          <div className="flex flex-1 flex-col justify-end gap-4 px-3 py-4 sm:px-4">
            {/* The pitch, at caption grade. On a trust product the claim is a footnote to
                the evidence, not the other way round. */}
            <p className="max-w-[46ch] font-mono text-[11px] leading-[1.7] text-fg-muted">
              SealDrop moves token supply into a contract that will not release it before a
              date the issuer sets, and publishes a page anyone can check against the chain.
              No admin key over locked funds. No early exit.
            </p>
            <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-1">
              <Link href="/lock" className={actionClass("primary")}>
                Lock supply
                <span aria-hidden className="num">
                  &gt;
                </span>
              </Link>
              <Link href="/explore" className={actionClass("ghost")}>
                Verify a lock
                <span aria-hidden className="num">
                  &gt;
                </span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

/** One lock as the featured record: the number, the strip, and where it sits in its period. */
export function FeaturedLock({lock, asOf}: {lock: Lock; asOf: number}) {
  const share = lockedShare(lock.amount, lock.token.totalSupply);
  const [whole, fraction] = (share * 100).toFixed(1).split(".");
  const circulating = lock.token.totalSupply - lock.amount;
  const unit = formatCompact(lock.token.totalSupply / 2200n, lock.token.decimals);
  const remaining = humanDuration(Math.max(0, lock.unlockAt - asOf));

  return (
    <>
      <SectionHead
        tag="Fig. 01"
        title="Featured record"
        note={<span className="num normal-case tracking-normal">{lock.id}</span>}
      />

      <div className="flex min-w-0 flex-col gap-4 px-3 py-4 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className={cn(MICRO, "text-fg-subtle")}>Share of total supply immobilised</p>
            <p className="flex items-start gap-1 text-fg">
              <span
                className="num text-[clamp(3.5rem,7vw,6.75rem)] leading-[0.78]"
                // Inline, not a tracking utility: .num is declared unlayered in
                // globals.css and beats anything Tailwind puts in a layer.
                style={{letterSpacing: "-0.045em"}}
              >
                {whole}
                <span className="text-fg-muted">.{fraction}</span>
              </span>
              <span className="num text-[clamp(1rem,1.7vw,1.75rem)] leading-none text-accent">
                %
              </span>
            </p>
            <p className="font-mono text-[11px] leading-relaxed text-fg-muted">
              <span className="text-fg">${lock.token.symbol}</span> held by the locker
              contract until <span className="num text-fg">{formatDate(lock.unlockAt)}</span>.
              No key opens it early.
            </p>
          </div>

          <dl className="w-full min-w-0 flex-1 basis-[17rem] border-t border-border">
            <Spec label="Token" value={`${lock.token.name} / ${lock.token.symbol}`} />
            <Spec
              label="Locked"
              value={`${formatCompact(lock.amount, lock.token.decimals)} ${lock.token.symbol}`}
            />
            <Spec
              label="Circulating"
              value={`${formatCompact(circulating, lock.token.decimals)} ${lock.token.symbol}`}
            />
            <Spec label="Remaining" value={remaining} />
            <Spec label="Owner" value={shortAddress(lock.owner)} />
          </dl>
        </div>

        {/* The strip runs the full width of the column. It is the product's one picture,
            so it is given the whole measure rather than a card to sit in. */}
        <StripField
          seed={lock.id}
          share={share}
          play
          className="aspect-[320/104] w-full sm:aspect-[1400/190] lg:aspect-[1400/168]"
        />

        <p className={cn(MICRO, "flex flex-wrap items-center gap-x-5 gap-y-2 text-fg-subtle")}>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-supply-locked" />
            Locked
            <span className="num normal-case tracking-normal text-fg">
              {formatCompact(lock.amount, lock.token.decimals)}
            </span>
            <span className="num normal-case tracking-normal text-fg-muted">
              {formatPercent(share, 1)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-supply-free" />
            Circulating
            <span className="num normal-case tracking-normal text-fg-muted">
              {formatCompact(circulating, lock.token.decimals)}
            </span>
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            1 tick
            <span className="num normal-case tracking-normal text-fg-muted">
              {unit} {lock.token.symbol}
            </span>
          </span>
        </p>

        <Period lockedAt={lock.lockedAt} unlockAt={lock.unlockAt} asOf={asOf} />
      </div>
    </>
  );
}

/**
 * The airdrop's second measurement: not how much was set aside, but how much has gone out.
 *
 * Drawn on the same axis as a lock's period so the fold reads the same whichever record it
 * features. The filled span is the share of the reserve the schedule has released; the rule
 * is where that stands now.
 */
function ReleaseTrack({airdrop}: {airdrop: Airdrop}) {
  const {symbol, decimals} = airdrop.token;
  const released = Math.min(1, Math.max(0, releasedShare(airdrop)));
  const stopped = airdrop.stoppedAt !== undefined;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn(MICRO, "text-fg-subtle")}>Release</p>
        <p className={cn(MICRO, "text-fg-subtle")}>
          Released{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {(released * 100).toFixed(1)}%
          </span>
        </p>
      </div>

      <div className="relative h-8 overflow-hidden bg-bg-elev shadow-[inset_0_0_0_1px_var(--border)]">
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full bg-surface-2"
          style={{width: `${released * 100}%`}}
        />
        <div aria-hidden className="absolute inset-0" style={AXIS} />
        <div
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-accent"
          style={{left: `${released * 100}%`}}
        />
      </div>

      <div className={cn(MICRO, "flex items-baseline justify-between gap-3 text-fg-subtle")}>
        <p>
          Opened{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {formatDate(airdrop.startsAt)}
          </span>
        </p>
        <p>
          {stopped ? "Stopped" : "Still to release"}{" "}
          <span className="num normal-case tracking-normal text-fg-muted">
            {stopped
              ? formatDate(airdrop.stoppedAt as number)
              : `${formatCompact(airdrop.reserve - airdrop.pool, decimals)} ${symbol}`}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * One airdrop as the featured record.
 *
 * The same parts as FeaturedLock, in the same places, so featuring the project's own airdrop
 * does not turn the fold into a different page. The large number is the share of the token's
 * supply set aside for holders, and the strip draws that same share: the block is the reserve,
 * the field is the rest of the supply.
 *
 * Every figure here is read from the contract or computed from its schedule. The count of
 * eligible wallets is deliberately absent: it comes from a holder snapshot the server cannot
 * reach from here, and a confident "0 wallets" on the front page would be wrong.
 */
export function FeaturedAirdrop({airdrop}: {airdrop: Airdrop}) {
  const {token} = airdrop;
  const {symbol, decimals} = token;
  const share = token.totalSupply > 0n ? Number(airdrop.reserve) / Number(token.totalSupply) : 0;
  const [whole, fraction] = (share * 100).toFixed(1).split(".");
  const rest = token.totalSupply - airdrop.reserve;
  const unit = formatCompact(token.totalSupply / 2200n, decimals);
  const schedule = airdrop.schedule;

  return (
    <>
      <SectionHead
        tag="Fig. 01"
        title="Featured airdrop"
        note={
          <Link
            href={`/airdrops/${airdrop.id}`}
            className="num normal-case tracking-normal transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
          >
            Airdrop {airdrop.id} &gt;
          </Link>
        }
      />

      <div className="flex min-w-0 flex-col gap-4 px-3 py-4 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className={cn(MICRO, "text-fg-subtle")}>Share of total supply set aside for holders</p>
            <p className="flex items-start gap-1 text-fg">
              <span
                className="num text-[clamp(3.5rem,7vw,6.75rem)] leading-[0.78]"
                // Inline, not a tracking utility: .num is declared unlayered in globals.css and
                // beats anything Tailwind puts in a layer.
                style={{letterSpacing: "-0.045em"}}
              >
                {whole}
                <span className="text-fg-muted">.{fraction}</span>
              </span>
              <span className="num text-[clamp(1rem,1.7vw,1.75rem)] leading-none text-accent">
                %
              </span>
            </p>
            <p className="font-mono text-[11px] leading-relaxed text-fg-muted">
              <span className="text-fg">${symbol}</span> set aside for holders
              {schedule ? (
                <>
                  , released at <span className="num text-fg">{formatRate(schedule.rateBps)}</span> of
                  what is left {describeInterval(schedule.intervalSeconds)}
                </>
              ) : null}
              {schedule ? ". Sent to holders automatically." : ". Claimable as it builds."}
            </p>
          </div>

          <dl className="w-full min-w-0 flex-1 basis-[17rem] border-t border-border">
            <Spec label="Token" value={`${token.name} / ${symbol}`} />
            <Spec label="Set aside" value={`${formatCompact(airdrop.reserve, decimals)} ${symbol}`} />
            <Spec
              label="Released so far"
              value={`${formatCompact(airdrop.pool, decimals)} ${symbol}`}
            />
            {schedule ? (
              <Spec
                label="Each round"
                value={`${formatRate(schedule.rateBps)} / ${shortInterval(schedule.intervalSeconds)}`}
              />
            ) : null}
            <Spec
              label={schedule ? "Sent" : "Claimed"}
              value={`${formatCompact(airdrop.claimed, decimals)} ${symbol} / ${formatPercent(claimedShare(airdrop), 1)}`}
            />
          </dl>
        </div>

        <StripField
          seed={airdrop.id}
          share={share}
          play
          className="aspect-[320/104] w-full sm:aspect-[1400/190] lg:aspect-[1400/168]"
        />

        <p className={cn(MICRO, "flex flex-wrap items-center gap-x-5 gap-y-2 text-fg-subtle")}>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-supply-locked" />
            Set aside
            <span className="num normal-case tracking-normal text-fg">
              {formatCompact(airdrop.reserve, decimals)}
            </span>
            <span className="num normal-case tracking-normal text-fg-muted">
              {formatPercent(share, 1)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-supply-free" />
            Rest of supply
            <span className="num normal-case tracking-normal text-fg-muted">
              {formatCompact(rest, decimals)}
            </span>
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            1 tick
            <span className="num normal-case tracking-normal text-fg-muted">
              {unit} {symbol}
            </span>
          </span>
        </p>

        <ReleaseTrack airdrop={airdrop} />
      </div>
    </>
  );
}
