"use client";

import {useCallback, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Lightning} from "@phosphor-icons/react";
import {Button, Hint, Label, Mono} from "@/components/ui/primitives";
import {AmountInput, HoldingShares} from "@/components/ui/AmountInput";
import {Chip, ChipRow, Segmented} from "@/components/ui/Choice";
import {TokenField} from "@/components/lock/TokenField";
import {TxProgress} from "@/components/lock/TxProgress";
import {SimulatedRibbon} from "@/components/proof/SimulatedRibbon";
import {DripTimeline} from "./DripTimeline";
import {
  DEFAULT_DRAFT,
  ScheduleFields,
  draftProblem,
  draftToSchedule,
  type ScheduleDraft,
} from "./ScheduleFields";
import {useAirdropTx} from "@/lib/hooks/useAirdrops";
import {useLock} from "@/lib/hooks/useLocks";
import {useTokenBalance} from "@/lib/hooks/useTokenBalance";
import {useClock} from "@/components/Clock";
import {isSimulated} from "@/lib/locks/adapter";
import {allocate} from "@/lib/airdrops/derive";
import {isOperator} from "@/lib/airdrops/operators";
import {describeInterval, formatRate, roundRelease, roundsToRelease} from "@/lib/airdrops/schedule";
import {formatAmount, formatPercent, humanDuration} from "@/lib/format";
import {formatAmountGrouped, parseAmount} from "@/lib/locks/parse";
import type {AirdropKind, AirdropSchedule} from "@/lib/airdrops/types";
import type {TokenMeta} from "@/lib/locks/types";

/**
 * Creating an airdrop.
 *
 * Two shapes, one form. A one-off puts an amount on the table and everyone takes their slice;
 * a recurring one hands out a percentage of whatever is left, over and over, so the same 5%
 * gets smaller every round and the reserve is never quite emptied. The second is the one
 * people actually mean when they say "keep rewarding holders", and until now the form could
 * only express the first.
 *
 * The right-hand panel is not a restatement of the form: it works out what a holder of a
 * given size would actually receive under these terms. Deciding a rate and an interval in the
 * abstract is guesswork, and the number that matters to the person setting it is what lands
 * in a typical holder's wallet, in the first round, and in the ones after it.
 */
export function AirdropForm({lockId, presetToken}: {lockId?: string; presetToken?: string}) {
  const router = useRouter();
  const {address, isConnected} = useAccount();
  const operator = isOperator(address);
  const now = Math.floor(useClock() / 1000);
  const {create, state, busy, reset} = useAirdropTx();

  const [kind, setKind] = useState<AirdropKind>("one-off");
  const [tokenInput, setTokenInput] = useState(presetToken ?? "");
  const [token, setToken] = useState<TokenMeta | null>(null);
  const [reserveInput, setReserveInput] = useState("");
  const [minimumInput, setMinimumInput] = useState("1");
  const [draft, setDraft] = useState<ScheduleDraft>(DEFAULT_DRAFT);

  // The lock this is being funded out of, when the flow arrived from one. Its amount is the
  // figure someone means by "5% of what I locked", so it is offered rather than retyped.
  const {data: lock} = useLock(lockId);
  const fundingLock =
    lock && token && lock.token.address.toLowerCase() === token.address.toLowerCase() ? lock : null;

  // The reserve leaves this wallet when the airdrop is created, so what it holds is the ceiling.
  const balance = useTokenBalance(token);

  const parsedReserve = token ? parseAmount(reserveInput, token.decimals) : null;
  const reserve = parsedReserve && typeof parsedReserve !== "string" ? parsedReserve.raw : null;

  const parsedMinimum = token ? parseAmount(minimumInput || "0", token.decimals) : null;
  const minimum = parsedMinimum && typeof parsedMinimum !== "string" ? parsedMinimum.raw : null;
  // One whole token, in this token's own units. A threshold below that is a threshold that
  // lets in every dust balance ever airdropped at the token, and those wallets take a share
  // of every round from the holders who actually hold it.
  const minimumFloor = token ? 10n ** BigInt(token.decimals) : 0n;

  const schedule: AirdropSchedule | null = kind === "recurring" ? draftToSchedule(draft) : null;
  const scheduleIssue = kind === "recurring" ? draftProblem(draft) : null;

  const problem = !token
    ? "Resolve a token first."
    : reserve === null || reserve === 0n
      ? kind === "recurring"
        ? "Enter how much to set aside for the rounds."
        : "Enter how much to put in the pool."
      : reserve > token.totalSupply
        ? "That is more than the entire supply."
        : balance !== undefined && reserve > balance
          ? "That is more than this wallet holds."
        : minimum === null
          ? "That is not a valid minimum holding."
          : minimum < minimumFloor
            ? `The minimum holding cannot be below 1 ${token.symbol}.`
            : (scheduleIssue ?? null);

  const ready = problem === null;

  const submit = useCallback(async () => {
    if (!ready || !address || !token || reserve === null || minimum === null) return;
    try {
      const created = await create({
        token: token.address,
        kind,
        reserve,
        schedule: schedule ?? undefined,
        minimumHolding: minimum,
        // Claimable from the moment it exists. There is no opening date to pick, which is
        // also why there is no window in which the terms could still be moved: holders can
        // act on them immediately, so they are fixed immediately.
        startsAt: now,
        creator: address,
        lockId,
      });
      router.push(`/airdrops/${created.id}`);
    } catch {
      // Already reported as a toast and in the progress panel.
    }
  }, [ready, address, token, kind, reserve, schedule, minimum, now, lockId, create, router]);

  const reserveLabel = kind === "recurring" ? "Set aside for the rounds" : "Pool";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-5">
        {isSimulated() ? <SimulatedRibbon subject="airdrop" /> : null}

        <TokenField value={tokenInput} onChange={setTokenInput} onResolved={setToken} />

        <div className="flex flex-col gap-2">
          <Label id="ad-kind-label">How it pays out</Label>
          <Segmented<AirdropKind>
            label="How it pays out"
            value={kind}
            onChange={setKind}
            options={[
              {value: "one-off", label: "All at once", hint: "One pool, claimed once"},
              {value: "recurring", label: "In rounds", hint: "A share of the rest, repeatedly"},
            ]}
          />
          <Hint>
            {kind === "recurring" ? (
              <>
                A percentage of whatever has not gone out yet is handed out each round, so the
                amount shrinks every time and holders have a reason to still be here later. Each
                wallet&apos;s share is sent to it automatically, so holders have nothing to claim.
              </>
            ) : (
              <>The whole amount becomes claimable the moment claiming opens, and that is that.</>
            )}
          </Hint>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="ad-reserve">{reserveLabel}</Label>
            {token && balance !== undefined ? (
              <span className="text-[11.5px] text-fg-subtle">
                You hold <Mono className="text-fg-muted">{formatAmountGrouped(balance, token.decimals)}</Mono>{" "}
                {token.symbol}
              </span>
            ) : null}
          </div>
          <AmountInput
            id="ad-reserve"
            value={reserveInput}
            onChange={setReserveInput}
            decimals={token?.decimals}
            max={balance}
            symbol={token?.symbol}
            shortcuts={
              token && balance !== undefined ? (
                <HoldingShares
                  balance={balance}
                  decimals={token.decimals}
                  current={reserve}
                  onPick={setReserveInput}
                />
              ) : null
            }
            hint={
              token && reserve !== null && reserve > 0n ? (
                <Hint>
                  <Mono>{formatPercent(Number((reserve * 10_000n) / token.totalSupply) / 10_000)}</Mono> of
                  the total supply of {token.symbol}.{" "}
                  {kind === "recurring"
                    ? "The rounds are carved out of this, never out of the rest of your position."
                    : "This is what gets shared out, not your whole position."}
                </Hint>
              ) : (
                <Hint>
                  {kind === "recurring"
                    ? "The amount the rounds draw down. Each one takes its percentage out of what is left of it."
                    : "How much of the supply to share out among holders."}
                </Hint>
              )
            }
          />
          {fundingLock ? (
            <ChipRow label="Amount shortcuts">
              <Chip
                selected={reserve === fundingLock.amount}
                onClick={() => setReserveInput(formatAmountGrouped(fundingLock.amount, fundingLock.token.decimals))}
              >
                All {formatAmount(fundingLock.amount, fundingLock.token.decimals, 0)} locked
              </Chip>
              {[10, 25, 50].map((percent) => (
                <Chip
                  key={percent}
                  selected={reserve === (fundingLock.amount * BigInt(percent)) / 100n}
                  onClick={() =>
                    setReserveInput(
                      formatAmountGrouped((fundingLock.amount * BigInt(percent)) / 100n, fundingLock.token.decimals),
                    )
                  }
                >
                  {percent}% of it
                </Chip>
              ))}
            </ChipRow>
          ) : null}
        </div>

        {kind === "recurring" ? (
          <section
            aria-label="Round schedule"
            className="flex flex-col gap-5 bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--border)] sm:p-5"
          >
            <ScheduleFields value={draft} onChange={setDraft} />
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="ad-min">Minimum holding to qualify</Label>
          <AmountInput
            id="ad-min"
            value={minimumInput}
            onChange={setMinimumInput}
            decimals={token?.decimals}
            placeholder="1"
            hint={
              <Hint>
                Wallets holding less than this get nothing, and their share goes to everyone who
                qualified. It cannot go below <Mono>1 {token?.symbol ?? "token"}</Mono>: a threshold
                under that lets in every dust balance in existence, and each of those takes a cut of
                every round away from the wallets actually holding the token.
              </Hint>
            }
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-md bg-surface-2 p-3.5 shadow-[inset_0_0_0_1px_var(--border)]">
          <Lightning size={15} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            <span className="text-fg">
              {kind === "recurring" ? "Payouts start the moment you sign." : "Claiming opens the moment you sign."}
            </span>{" "}
            There is no start
            date to pick and no countdown for holders to wait out
            {kind === "recurring" ? ", and the first round lands straight away" : ""}.{" "}
            {operator ? null : (
              <>
                The other side of that is that the terms are fixed from the same moment: holders can
                act on them immediately, so nothing here can be moved afterwards.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <aside
          aria-label="What holders get"
          className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6"
        >
          <header className="flex flex-col gap-0.5">
            <h2 className="display text-lg font-semibold tracking-tight text-fg">What holders get</h2>
            <p className="num text-[10.5px] tracking-wider text-fg-subtle">REVIEW BEFORE SIGNING</p>
          </header>

          {token && reserve !== null && reserve > 0n && minimum !== null ? (
            kind === "recurring" && schedule ? (
              <DripPreview
                token={token}
                reserve={reserve}
                minimum={minimum}
                schedule={schedule}
                startsAt={now}
                now={now}
              />
            ) : (
              <Preview token={token} pool={reserve} minimum={minimum} />
            )
          ) : (
            <Hint>
              Fill in a token and an amount to see what a holder would receive
              {kind === "recurring" ? ", round by round" : ""}.
            </Hint>
          )}

          <TxProgress
            status={state.status}
            error={state.error}
            onRetry={submit}
            onCancel={reset}
            done={{
              label: "Created",
              note:
                kind === "recurring"
                  ? "The first round is out, and payouts are sent to holders automatically."
                  : "Holders can claim when claiming opens.",
            }}
          />

          <div className="flex flex-col gap-2">
            {!isConnected ? (
              <ConnectButton.Custom>
                {({openConnectModal}) => (
                  <Button variant="primary" size="lg" onClick={openConnectModal}>
                    Connect wallet to create
                  </Button>
                )}
              </ConnectButton.Custom>
            ) : (
              <Button variant="primary" size="lg" disabled={!ready || busy} onClick={() => void submit()}>
                {busy ? "Creating..." : "Create airdrop"}
              </Button>
            )}
            {isConnected && problem ? <Hint>{problem}</Hint> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A plausible qualifying base: a third of supply sitting in wallets that clear the bar. */
const EXAMPLES = [
  {label: "Holds 0.1% of supply", divisor: 1_000n},
  {label: "Holds 1% of supply", divisor: 100n},
  {label: "Holds 5% of supply", divisor: 20n},
];

/**
 * Three worked examples.
 *
 * A pool and a threshold mean nothing on their own. What the person setting them wants to
 * know is what a small, a middling and a large holder each walk away with, so the panel
 * works exactly that out against the terms as typed.
 */
function Preview({token, pool, minimum}: {token: TokenMeta; pool: bigint; minimum: bigint}) {
  const eligibleSupply = token.totalSupply / 3n;

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-border">
        {EXAMPLES.map((example) => {
          const result = allocate(
            {pool, minimumHolding: minimum, eligibleSupply},
            token.totalSupply / example.divisor,
          );
          return (
            <div key={example.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <dt className="text-[12.5px] text-fg-subtle">{example.label}</dt>
              <dd className="text-right text-[13px]">
                {result.qualifies ? (
                  <Mono className="text-accent">
                    {formatAmount(result.amount, token.decimals, 2)} {token.symbol}
                  </Mono>
                ) : (
                  <Mono className="text-fg-subtle">does not qualify</Mono>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <Hint>
        Worked against an assumed third of supply in qualifying wallets. The real split uses a
        holder snapshot taken when the contract runs.
      </Hint>
    </div>
  );
}

/**
 * The same three examples, but for the first round, plus the curve they sit on.
 *
 * The first round is the honest headline for a drip: it is the largest one, it is the only one
 * anyone can act on immediately, and every round after it is a fixed fraction of it. Showing
 * the lifetime total instead would quote a number that arrives over months.
 */
function DripPreview({
  token,
  reserve,
  minimum,
  schedule,
  startsAt,
  now,
}: {
  token: TokenMeta;
  reserve: bigint;
  minimum: bigint;
  schedule: AirdropSchedule;
  startsAt: number;
  now: number;
}) {
  const eligibleSupply = token.totalSupply / 3n;
  const firstRound = roundRelease(reserve, schedule.rateBps, 1);
  const rounds99 = roundsToRelease(schedule.rateBps, 9_900);
  const capped = schedule.maxRounds !== undefined && schedule.maxRounds < rounds99;
  const runFor = capped ? schedule.maxRounds! : rounds99;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 bg-surface-2 p-3.5 shadow-[inset_0_0_0_1px_var(--border)]">
        <p className="text-[11.5px] text-fg-subtle">First round hands out</p>
        <p className="num text-[19px] text-accent">
          {formatAmount(firstRound, token.decimals, 2)} {token.symbol}
        </p>
        <p className="text-[11.5px] text-fg-muted">
          {formatRate(schedule.rateBps)} of {formatAmount(reserve, token.decimals, 0)},{" "}
          {describeInterval(schedule.intervalSeconds)}.
        </p>
      </div>

      <dl className="flex flex-col divide-y divide-border">
        {EXAMPLES.map((example) => {
          const result = allocate(
            {pool: firstRound, minimumHolding: minimum, eligibleSupply},
            token.totalSupply / example.divisor,
          );
          return (
            <div key={example.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <dt className="text-[12.5px] text-fg-subtle">{example.label}</dt>
              <dd className="text-right text-[13px]">
                {result.qualifies ? (
                  <Mono className="text-accent">
                    {formatAmount(result.amount, token.decimals, 2)} {token.symbol}
                  </Mono>
                ) : (
                  <Mono className="text-fg-subtle">does not qualify</Mono>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <Hint>
        Per round, worked against an assumed third of supply in qualifying wallets. A wallet that
        still qualifies next round gets its share of that one too.
      </Hint>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-[12.5px] font-medium text-fg-muted">The first rounds</h3>
        <DripTimeline airdrop={{startsAt, reserve, schedule}} token={token} now={now} count={4} />
      </div>

      <Hint>
        {Number.isFinite(runFor) ? (
          <>
            {capped ? "Stops after" : "Takes"} <Mono>{runFor.toLocaleString("en-US")}</Mono> rounds,
            or <Mono>{humanDuration(runFor * schedule.intervalSeconds)}</Mono>,{" "}
            {capped ? "with the rest still held back." : "to hand out 99% of the reserve."}
          </>
        ) : (
          <>At this rate the reserve barely moves. Try a larger percentage.</>
        )}
      </Hint>
    </div>
  );
}
