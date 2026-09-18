"use client";

import Link from "next/link";
import type {ReactNode} from "react";
import {useAccount} from "wagmi";
import {ArrowSquareOut} from "@phosphor-icons/react";
import {PageShell} from "@/components/layout/PageShell";
import {ShareCard} from "@/components/share/ShareCard";
import {appUrl} from "@/lib/env";
import {AllocationPanel} from "@/components/airdrops/AllocationPanel";
import {AdjustPanel} from "@/components/airdrops/AdjustPanel";
import {AirdropStatePill} from "@/components/airdrops/AirdropStatePill";
import {DripTimeline} from "@/components/airdrops/DripTimeline";
import {ChainRecord} from "@/components/chain/ChainRecord";
import {Countdown} from "@/components/locks/Countdown";
import {SimulatedRibbon} from "@/components/proof/SimulatedRibbon";
import {Empty, Mono, buttonClass} from "@/components/ui/primitives";
import {useClock} from "@/components/Clock";
import {useAirdrop, useAirdropTx, useAllocation} from "@/lib/hooks/useAirdrops";
import {atTime, claimedShare, releasedShare} from "@/lib/airdrops/derive";
import {
  HOUR_SECONDS,
  accrualOver,
  describeInterval,
  dripFinished,
  formatRate,
  roundsElapsed,
} from "@/lib/airdrops/schedule";
import {formatAmount, formatDateTime, formatPercent, shortAddress} from "@/lib/format";

/**
 * One airdrop, with the holder's view on the right and the creator's controls below it.
 */
export function AirdropDetail({id}: {id: string}) {
  const {address} = useAccount();
  const now = Math.floor(useClock() / 1000);
  const {data: fetched, isPending} = useAirdrop(id);
  const allocation = useAllocation(id);
  const {claim, busy} = useAirdropTx();

  if (isPending) return <PageShell title="Airdrop" />;

  if (!fetched) {
    return (
      <PageShell title="Airdrop">
        <Empty
          title="No airdrop with that id"
          body="The link may be wrong, or it may have been created in a different browser. Part 1 stores them locally."
          action={
            <Link href="/airdrops" className={buttonClass("secondary", "sm")}>
              All airdrops
            </Link>
          }
        />
      </PageShell>
    );
  }

  // Against the ticking clock, not the fetch: a drip's released figure is a function of the
  // current second, and the bar and the rows here all read off it.
  const airdrop = atTime(fetched, now);
  const {decimals, symbol} = airdrop.token;
  const {schedule} = airdrop;
  const progress = claimedShare(airdrop);
  const released = releasedShare(airdrop);

  const rounds = schedule ? roundsElapsed(airdrop, now) : 0;
  const stillReleasing = Boolean(schedule) && !dripFinished(airdrop, now);
  const perHour = schedule ? accrualOver(airdrop, now, HOUR_SECONDS) : 0n;

  return (
    <PageShell
      title={`$${symbol} airdrop`}
      lede={airdrop.note}
      actions={
        <div className="flex items-center gap-2">
          <AirdropStatePill state={airdrop.state} recurring={Boolean(airdrop.schedule)} />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {airdrop.simulated ? <SimulatedRibbon subject="airdrop" /> : null}

        

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6">
              <h2 className="display text-lg font-semibold tracking-tight text-fg">The terms</h2>

              <div className="flex flex-col gap-1.5">
                {/*
                  Two fills in one track, both measured against the whole reserve: the pale one
                  is what the schedule has let out, the solid one is what holders have actually
                  taken. A one-off releases everything at once, so its pale fill is the whole
                  track and the bar reads exactly as it always did.
                */}
                <div className="relative h-2 overflow-hidden" style={{background: "var(--surface-3)"}}>
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-[var(--dur-slow,400ms)] ease-out"
                    style={{width: `${released * 100}%`, background: "var(--accent-line)"}}
                  />
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-[var(--dur-slow,400ms)] ease-out"
                    style={{width: `${released * progress * 100}%`, background: "var(--accent)"}}
                  />
                </div>
                <p className="text-[12px] text-fg-muted">
                  <Mono className="text-fg">{formatAmount(airdrop.claimed, decimals, 0)}</Mono> of the{" "}
                  <Mono className="text-fg">{formatAmount(airdrop.pool, decimals, 0)}</Mono> {symbol}{" "}
                  released so far has been {schedule ? "sent to holders" : "claimed"} ({formatPercent(progress, 1)}).
                  {schedule ? (
                    <>
                      {" "}
                      <Mono className="text-fg-subtle">
                        {formatAmount(airdrop.reserve - airdrop.pool, decimals, 0)}
                      </Mono>{" "}
                      {/* After a stop that amount is gone, not waiting. Saying "held back for
                          later rounds" of money the creator has taken back is simply untrue. */}
                      is still held back for later rounds.
                    </>
                  ) : null}
                </p>
              </div>

              <dl className="flex flex-col divide-y divide-border">
                {schedule ? (
                  <>
                    <Row label="Set aside in total" value={`${formatAmount(airdrop.reserve, decimals, 2)} ${symbol}`} />
                    <Row
                      label="Released so far"
                      value={`${formatAmount(airdrop.pool, decimals, 2)} ${symbol} · ${formatPercent(released, 1)}`}
                    />
                    <Row
                      label="Each round"
                      value={`${formatRate(schedule.rateBps)} of what is left, ${describeInterval(schedule.intervalSeconds)}`}
                    />
                    <Row
                      label="Rounds paid out"
                      value={
                        schedule.maxRounds
                          ? `${rounds.toLocaleString("en-US")} of ${schedule.maxRounds.toLocaleString("en-US")}`
                          : rounds.toLocaleString("en-US")
                      }
                    />
                    {stillReleasing ? (
                      <Row
                        label="Releasing"
                        value={
                          <>
                            about {formatAmount(perHour, decimals, 2)} {symbol} an hour
                            <span className="text-fg-subtle">, and slowing</span>
                          </>
                        }
                      />
                    ) : null}
                    <Row
                      label="Payouts"
                      value={
                        now >= airdrop.startsAt ? (
                          <span className="text-positive">sent to holders automatically</span>
                        ) : (
                          <Countdown unlockAt={airdrop.startsAt} />
                        )
                      }
                    />
                  </>
                ) : (
                  <Row label="Pool" value={`${formatAmount(airdrop.reserve, decimals, 2)} ${symbol}`} />
                )}
                <Row
                  label="Minimum holding to qualify"
                  value={`${formatAmount(airdrop.minimumHolding, decimals, 2)} ${symbol}`}
                />
                <Row
                  label="Split across"
                  value={`${formatAmount(airdrop.eligibleSupply, decimals, 0)} ${symbol} held by ${airdrop.eligibleHolders.toLocaleString("en-US")} wallets`}
                />
                <Row
                  label={
                    schedule
                      ? now >= airdrop.startsAt
                        ? "Paying out since"
                        : "Payouts start"
                      : now >= airdrop.startsAt
                        ? "Claimable since"
                        : "Claiming opens"
                  }
                  value={formatDateTime(airdrop.startsAt)}
                />
                <Row label="Created by" value={shortAddress(airdrop.creator)} />
              </dl>

              {/*
                The schedule is described in the present tense, so it is left out once the
                schedule has ended rather than reworded. Saying nothing is an omission; saying
                tokens are still being released every minute when they are not would be a
                statement the page knows to be false, and holders act on this paragraph.
              */}
              <p className="text-[12.5px] leading-relaxed text-fg-muted">
                {schedule && stillReleasing ? (
                  <>
                    {formatRate(schedule.rateBps)} of whatever has not gone out yet is released{" "}
                    {describeInterval(schedule.intervalSeconds)}, split across the qualifying
                    wallets by how much each one holds. It arrives continuously rather than in
                    jumps, and each wallet&apos;s share is sent to it automatically, so there is nothing
                    to claim and no moment you have to be here for. Because each round takes its share
                    of the remainder rather than of the original amount, the rounds get smaller for
                    ever and the reserve is never quite emptied.
                  </>
                ) : schedule ? null : (
                  <>
                    Your cut is your balance divided by the {symbol} held in wallets that clear the
                    minimum, multiplied by the pool. Wallets below the minimum get nothing, and
                    their share goes to everyone who qualified.
                  </>
                )}
              </p>

              {airdrop.lockId ? (
                <Link
                  href={`/proof/${airdrop.lockId}`}
                  className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-accent hover:underline"
                >
                  Funded from a lock on this token
                  <ArrowSquareOut size={12} aria-hidden />
                </Link>
              ) : null}
            </section>

            {stillReleasing ? (
              <section className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6">
                <header className="flex flex-col gap-1">
                  <h2 className="display text-lg font-semibold tracking-tight text-fg">How it builds up</h2>
                  <p className="text-[13px] leading-relaxed text-fg-muted">
                    Where the release gets to, worked against the amount still held back. These are
                    the marks it passes, not moments you have to wait for: the figure in between
                    them climbs the whole time, and payouts follow it into holders&apos; wallets.
                  </p>
                </header>
                <DripTimeline
                  airdrop={airdrop}
                  token={airdrop.token}
                  now={now}
                  fromRound={rounds + 1}
                  count={6}
                  holderShare={
                    allocation && allocation.qualifies
                      ? {balance: allocation.balance, eligibleSupply: airdrop.eligibleSupply}
                      : undefined
                  }
                />
              </section>
            ) : null}

            {airdrop.simulated ? null : (
              <ChainRecord kind="airdrop" id={airdrop.id} token={airdrop.token} />
            )}

            <AdjustPanel airdrop={airdrop} />

            <ShareCard
              kind="airdrop"
              id={airdrop.id}
              url={`${appUrl}/airdrops/${airdrop.id}`}
              text={
                airdrop.simulated
                  ? `Simulated: ${formatAmount(airdrop.reserve, decimals, 0)} $${symbol} going out to holders, via SealDrop.`
                  : `${formatAmount(airdrop.reserve, decimals, 0)} $${symbol} is going out to holders.`
              }
              txHash={airdrop.txHash}
            />
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <AllocationPanel
              airdrop={airdrop}
              allocation={allocation}
              claiming={busy}
              onClaim={() => {
                if (!address) return;
                void claim(airdrop.id, address).catch(() => {
                  // Already surfaced as a toast.
                });
              }}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Row({label, value}: {label: string; value: ReactNode}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-[12.5px] text-fg-subtle">{label}</dt>
      <dd className="text-right text-[13.5px]">
        <Mono className="text-fg">{value}</Mono>
      </dd>
    </div>
  );
}
