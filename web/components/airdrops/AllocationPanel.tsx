"use client";

import {useAccount} from "wagmi";
import {ArrowSquareOut, CheckCircle, Warning} from "@phosphor-icons/react";
import {Button, ButtonLink, Hint, Mono} from "@/components/ui/primitives";
import {Countdown} from "@/components/locks/Countdown";
import {useClock} from "@/components/Clock";
import {atTime} from "@/lib/airdrops/derive";
import {HOUR_SECONDS, accrualOver, describeInterval, dripFinished, formatRate} from "@/lib/airdrops/schedule";
import {releasedAtOnChain} from "@/lib/airdrops/curve-onchain";
import {SHARE_SCALE, payoutFor} from "@/lib/airdrops/allocations";
import {launchpadUrl} from "@/lib/pons";
import {formatAmount, formatDate, formatPercent} from "@/lib/format";
import type {Airdrop, Allocation} from "@/lib/airdrops/types";

/**
 * What this wallet gets, when, and what it has taken already.
 *
 * The three questions a holder actually has, answered in that order and never hidden behind
 * a connect wall: the terms are public, so the panel shows what a qualifying wallet would
 * receive even before one is connected.
 *
 * The figures are recomputed against the ticking clock rather than taken from the query that
 * fetched them. A drip's claimable amount is a function of the current second, and a number
 * that only moved when react-query happened to refetch would sit still for a minute and then
 * jump, which reads as a broken page rather than as an airdrop paying out.
 */
export function AllocationPanel({
  airdrop: fetched,
  allocation: fetchedAllocation,
  onClaim,
  claiming,
}: {
  airdrop: Airdrop;
  allocation: Allocation | null;
  onClaim: () => void;
  claiming: boolean;
}) {
  const {isConnected} = useAccount();
  const now = Math.floor(useClock() / 1000);

  const airdrop = atTime(fetched, now);
  const {decimals, symbol} = airdrop.token;
  const {schedule} = airdrop;

  /*
    The adapter's figures are the ones shown, not a re-derivation of them.

    They used to be recomputed here against the ticking clock, which was right while the whole
    thing was simulated and wrong the moment it was not. On chain a wallet can only take what
    it can *prove*, and the proof comes from the published snapshot; the release curve is the
    ceiling on that, not a promise independent of it. Recomputing put a number on the page that
    the contract would refuse, and a Claim button under it that could only revert.

    Nothing is held back pending a publish any more: a leaf is a share, so the contract applies
    it to the curve every second and what is on this line is genuinely everything owed right
    now. Republishing changes who is counted, not whether anyone is paid.
  */
  /*
    The claimable figure has to be two things at once: exactly what the contract will pay, and
    alive. Taking it straight from the fetch is exact but frozen until something refetches;
    recomputing it from the app's own model ticks but drifts from what the contract will pay,
    which is how a Claim button ends up offering a number that reverts.

    So it is the contract's own formula, evaluated here against the ticking clock:
    releasedAt(now) * share / 1e18, minus what has been taken. Both inputs are known --- the
    share came from the proof, the curve is arithmetic --- and `releasedAtOnChain` mirrors the
    Solidity operation for operation, so the answer is the contract's to the last unit.
  */
  const allocation = fetchedAllocation
    ? liveAllocation(fetchedAllocation, airdrop, now)
    : null;

  const open = now >= airdrop.startsAt;

  /*
    How much more of the token this wallet needs before it is in the split at all.

    Shown to anyone who is short and to anyone not connected, because the threshold is a public
    term and the useful thing to know about it is the gap. Not shown to a wallet that already
    qualifies: it is past the bar, and telling it to go and buy more would be advice rather
    than information.
  */
  const shortBy =
    allocation && !allocation.qualifies && airdrop.minimumHolding > allocation.balance
      ? airdrop.minimumHolding - allocation.balance
      : null;
  const offerToBuy = airdrop.minimumHolding > 0n && (!isConnected || shortBy !== null);
  const perHour = schedule ? accrualOver(airdrop, now, HOUR_SECONDS) : 0n;
  const yourPerHour =
    allocation && allocation.qualifies && airdrop.eligibleSupply > 0n
      ? (perHour * allocation.balance) / airdrop.eligibleSupply
      : 0n;

  return (
    <aside
      aria-label="Your allocation"
      className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="display text-lg font-semibold tracking-tight text-fg">Your allocation</h2>
        <p className="num text-[10.5px] tracking-wider text-fg-subtle">
          {!open ? "OPENS LATER" : schedule ? "SENT TO YOUR WALLET AUTOMATICALLY" : "BASED ON YOUR HOLDING"}
        </p>
      </header>

      {!open ? (
        <div className="flex flex-col gap-1 bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--border)]">
          <p className="text-[12px] text-fg-subtle">Claiming opens in</p>
          <Countdown unlockAt={airdrop.startsAt} className="num text-2xl text-fg" />
          <p className="num text-[11.5px] text-fg-muted">{formatDate(airdrop.startsAt)}</p>
        </div>
      ) : allocation && allocation.qualifies ? (
        /*
          On a drip the headline is the next payout: it ticks up every second and drops back
          when the keeper sends it, which is what arriving without a claim looks like. On a
          one-off pool it is still what the wallet can claim.
        */
        <div className="flex flex-col gap-1 bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--border)]">
          <p className="text-[12px] text-fg-subtle">{schedule ? "Next payout" : "Claimable now"}</p>
          <p className="num text-2xl text-positive" aria-live="off">
            {formatAmount(schedule ? allocation.pending : allocation.claimable, decimals, 4)}{" "}
            <span className="text-base text-fg-muted">{symbol}</span>
          </p>
          {schedule && yourPerHour > 0n ? (
            <p className="num text-[11.5px] text-fg-muted">
              growing by about {formatAmount(yourPerHour, decimals, 2)} an hour
            </p>
          ) : null}
        </div>
      ) : null}

      {!isConnected ? (
        <Hint>Connect a wallet to see what it qualifies for. The terms below apply to everyone.</Hint>
      ) : allocation === null ? (
        <Hint>Working out your allocation.</Hint>
      ) : (
        <dl className="flex flex-col divide-y divide-border">
          <Row label={`Your ${symbol} balance`} value={formatAmount(allocation.balance, decimals, 2)} />
          <Row
            label="Share of eligible supply"
            value={allocation.qualifies ? formatPercent(allocation.share, 4) : "0%"}
          />
          <Row
            label={schedule ? "Owed so far" : "You qualify for"}
            value={`${formatAmount(allocation.amount, decimals, 2)} ${symbol}`}
            tone={allocation.qualifies ? "accent" : undefined}
          />
          <Row
            label={schedule ? "Sent to you so far" : "Already claimed"}
            value={formatAmount(allocation.claimed, decimals, 2)}
          />
          <Row
            label={schedule ? "Next payout" : "Claimable now"}
            value={`${formatAmount(schedule ? allocation.pending : allocation.claimable, decimals, 2)} ${symbol}`}
            tone={(schedule ? allocation.pending : allocation.claimable) > 0n ? "positive" : undefined}
          />
        </dl>
      )}

      {allocation && !allocation.qualifies ? (
        <div className="flex items-start gap-2.5 bg-warn-dim p-3 shadow-[inset_0_0_0_1px_var(--warn-dim)]">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-warn">
            {allocation.reason === "no-balance" ? (
              <>This wallet holds no {symbol}, so it does not qualify.</>
            ) : (
              <>
                This airdrop needs at least{" "}
                <Mono>{formatAmount(airdrop.minimumHolding, decimals, 2)}</Mono> {symbol}. This
                wallet holds <Mono>{formatAmount(allocation.balance, decimals, 2)}</Mono>.
              </>
            )}
          </p>
        </div>
      ) : null}

      {offerToBuy ? (
        <div className="flex flex-col gap-2">
          <ButtonLink
            variant="primary"
            size="lg"
            href={launchpadUrl(airdrop.token.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy {symbol} on Pons
            <ArrowSquareOut size={14} weight="bold" aria-hidden />
          </ButtonLink>
          <Hint>
            {shortBy !== null ? (
              <>
                <Mono className="text-fg">{formatAmount(shortBy, decimals, 2)}</Mono> more {symbol}{" "}
                and this wallet qualifies, and then earns a share of every round for as long as it
                holds.
              </>
            ) : (
              <>
                Hold at least{" "}
                <Mono className="text-fg">{formatAmount(airdrop.minimumHolding, decimals, 2)}</Mono>{" "}
                {symbol} to qualify and earn a share of every round, for as long as you hold.
              </>
            )}
          </Hint>
        </div>
      ) : null}

      {allocation && allocation.qualifies && allocation.claimable === 0n && allocation.claimed > 0n ? (
        <div className="flex items-start gap-2.5 bg-positive-dim p-3 shadow-[inset_0_0_0_1px_var(--positive-dim)]">
          <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-positive" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-positive">
            {schedule
              ? "Everything this wallet is owed so far has been sent to it."
              : "You have claimed everything this wallet is owed from this airdrop."}
          </p>
        </div>
      ) : null}

      {/*
        Same rule as the page above: the running-schedule sentence is dropped once it has
        stopped rather than replaced with one that is not true.
      */}
      {schedule && airdrop.stoppedAt !== undefined ? null : schedule ? (
        <Hint>
          {formatRate(schedule.rateBps)} of whatever has not gone out yet is released{" "}
          {describeInterval(schedule.intervalSeconds)}, split by how much each qualifying wallet
          holds, and it builds up second by second rather than in jumps. It is sent to every
          qualifying wallet automatically, so there is nothing to claim and nothing to sign.
        </Hint>
      ) : null}

      {/*
        The only two conditions are that claiming has opened and that this wallet is owed
        something. Nothing about rounds, and nothing about the airdrop's overall state: a
        holder who is owed tokens can always take them.

        On a drip it is demoted to a quiet option rather than removed. Payouts arrive on their
        own, but the keeper runs on a schedule and on gas, and a holder should never be left
        unable to take what the contract says is theirs because a job is late or a wallet is dry.
      */}
      {isConnected && open && allocation && allocation.claimable > 0n ? (
        schedule ? (
          <Button variant="secondary" className="w-fit" disabled={claiming} onClick={onClaim}>
            {claiming ? "Sending..." : `Get ${formatAmount(allocation.claimable, decimals, 2)} ${symbol} now instead of waiting`}
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={claiming} onClick={onClaim}>
            {claiming ? "Claiming..." : `Claim ${formatAmount(allocation.claimable, decimals, 2)} ${symbol}`}
          </Button>
        )
      ) : null}
    </aside>
  );
}

/**
 * Rolls the fetched allocation forward to this second.
 *
 * Only the figures that move are recomputed. Everything else --- the balance, what has already
 * been paid, whether the wallet qualifies --- is a fact from the fetch and is left exactly as it
 * came.
 *
 * `pending` is what the keeper's next payout sends, from the same `payoutFor` the keeper sends
 * with, so the number on the page is the number that arrives.
 * `claimable` is what a claim would take instead, which can be more for a wallet that bought in
 * after others were paid.
 */
function liveAllocation(
  fetched: Allocation,
  airdrop: Airdrop,
  nowSeconds: number,
): Allocation & {pending: bigint} {
  const {schedule, shareScaled} = {...airdrop, shareScaled: fetched.shareScaled};
  if (!schedule || !shareScaled || shareScaled <= 0n) return {...fetched, pending: fetched.claimable};

  const released = releasedAtOnChain(
    {
      startsAt: airdrop.startsAt,
      reserve: airdrop.reserve,
      rateBps: schedule.rateBps,
      intervalSeconds: schedule.intervalSeconds,
      maxRounds: schedule.maxRounds,
      stoppedAt: airdrop.stoppedAt,
      // What the schedule had released when it was stopped; the contract keeps this and the
      // app records the other half of the same subtraction.
      stoppedRelease:
        airdrop.stoppedAt === undefined ? undefined : airdrop.reserve - (airdrop.withdrawn ?? 0n),
    },
    nowSeconds,
  );

  const entitled = (released * shareScaled) / SHARE_SCALE;
  const owed = entitled > fetched.claimed ? entitled - fetched.claimed : 0n;
  // The contract will not pay past what the whole drip has released either, so neither does
  // this: showing a wallet more than the pool can cover would be a button that reverts.
  const headroom = released > airdrop.claimed ? released - airdrop.claimed : 0n;

  const claimable = owed < headroom ? owed : headroom;
  const pending = payoutFor({
    released,
    room: headroom,
    share: shareScaled,
    taken: fetched.claimed,
    // Once nothing more will be released the keeper settles in full, capped by what is left.
    settling: airdrop.stoppedAt !== undefined || dripFinished(airdrop, nowSeconds),
  });

  return {...fetched, amount: entitled, claimable, pending};
}

function Row({label, value, tone}: {label: string; value: string; tone?: "accent" | "positive"}) {
  const colour = tone === "accent" ? "text-accent" : tone === "positive" ? "text-positive" : "text-fg";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-[12.5px] text-fg-subtle">{label}</dt>
      <dd className="text-right text-[13.5px]">
        <Mono className={colour}>{value}</Mono>
      </dd>
    </div>
  );
}
