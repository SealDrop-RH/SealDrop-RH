"use client";

import {useState} from "react";
import {useAccount} from "wagmi";
import {LockSimple, Warning} from "@phosphor-icons/react";
import {Button, Hint, Input, Label, Mono} from "@/components/ui/primitives";
import {
  ScheduleFields,
  draftProblem,
  draftToSchedule,
  scheduleToDraft,
  type ScheduleDraft,
} from "./ScheduleFields";
import {useAirdropTx} from "@/lib/hooks/useAirdrops";
import {adjustability} from "@/lib/airdrops/derive";
import {canStop} from "@/lib/airdrops/operators";
import {describeInterval, formatRate, heldBack} from "@/lib/airdrops/schedule";
import {useClock} from "@/components/Clock";
import {formatAmount, formatDateTime} from "@/lib/format";
import {formatAmountInput, parseAmount, parseUnlockDate, toDateTimeLocal} from "@/lib/locks/parse";
import type {Airdrop} from "@/lib/airdrops/types";

/**
 * The creator's controls.
 *
 * Only before claiming opens, and never after. Once a holder can act on the terms, moving them
 * is a rug in slow motion: someone decides to keep holding because the threshold is X, and the
 * creator raises it afterwards. Before anyone can claim, nobody has relied on anything yet.
 *
 * The schedule sits under the same rule and for a sharper version of the same reason. A drip
 * is a promise about the next hundred rounds; a rate that could be cut once the first one had
 * paid out would make that promise worth exactly one round.
 *
 * The rule is enforced in the adapter as well as here. A control that is merely hidden is not
 * a rule, it is a suggestion.
 */
export function AdjustPanel({airdrop}: {airdrop: Airdrop}) {
  const {address} = useAccount();
  const now = Math.floor(useClock() / 1000);
  const {adjust, stop, busy} = useAirdropTx();

  const can = adjustability(airdrop, address, now);
  const stoppable = canStop(airdrop, address);
  const isCreator = Boolean(address) && address?.toLowerCase() === airdrop.creator.toLowerCase();
  /*
    On chain none of the terms can move. PonsDrip has no function that changes a reserve, a
    rate or an interval, and deliberately so: holders are already claiming against them. The
    fields below only mean anything against the simulated adapter, and showing them as inputs
    on a real drip would offer an edit that silently did nothing.
  */
  const termsEditable = airdrop.simulated;
  const held = heldBack(airdrop, now);
  const {decimals, symbol} = airdrop.token;
  const recurring = airdrop.kind === "recurring";

  const [reserve, setReserve] = useState(() => formatAmountInput(airdrop.reserve, decimals));
  const [minimum, setMinimum] = useState(() => formatAmountInput(airdrop.minimumHolding, decimals));
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(airdrop.startsAt));
  const [draft, setDraft] = useState<ScheduleDraft | null>(() =>
    airdrop.schedule ? scheduleToDraft(airdrop.schedule) : null,
  );
  // Stopping cannot be undone and it takes tokens back out of a live giveaway, so it asks
  // twice. One click is for things you can put back.
  const [confirmingStop, setConfirmingStop] = useState(false);

  // Anyone who is not the creator sees nothing: the terms are already on the page above.
  if (!address || address.toLowerCase() !== airdrop.creator.toLowerCase()) return null;

  const parsedReserve = parseAmount(reserve, decimals);
  const parsedMinimum = parseAmount(minimum, decimals);
  const parsedStart = parseUnlockDate(startsAt);

  const nextReserve = typeof parsedReserve === "string" ? null : parsedReserve.raw;
  const nextMinimum = typeof parsedMinimum === "string" ? null : parsedMinimum.raw;
  const nextSchedule = (recurring && draft ? draftToSchedule(draft) : null) ?? undefined;
  const scheduleIssue = recurring && draft ? draftProblem(draft) : null;

  const problem =
    nextReserve === null || nextReserve <= 0n
      ? recurring
        ? "The amount set aside has to be greater than zero."
        : "The pool has to be greater than zero."
      : nextMinimum === null
        ? "That is not a valid minimum holding."
        : scheduleIssue
          ? scheduleIssue
          : parsedStart === null
            ? "Pick when claiming opens."
            : nextReserve < airdrop.claimed
              ? "It cannot go below what has already been claimed."
              : null;

  const scheduleChanged =
    nextSchedule !== undefined &&
    (nextSchedule.rateBps !== airdrop.schedule?.rateBps ||
      nextSchedule.intervalSeconds !== airdrop.schedule?.intervalSeconds ||
      nextSchedule.maxRounds !== airdrop.schedule?.maxRounds);

  const changed =
    nextReserve !== airdrop.reserve ||
    nextMinimum !== airdrop.minimumHolding ||
    parsedStart !== airdrop.startsAt ||
    scheduleChanged;

  return (
    <section className="flex flex-col gap-5 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="display text-lg font-semibold tracking-tight text-fg">
          {can.allowed ? "Adjust this airdrop" : "The terms of this airdrop"}
        </h2>
      </header>

      {!can.allowed ? (
        <div className="flex items-start gap-2.5 bg-surface-2 p-3 shadow-[inset_0_0_0_1px_var(--border)]">
          <LockSimple size={15} weight="fill" className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            {can.reason}
            {recurring && airdrop.schedule ? (
              <>
                {" "}
                It keeps paying out {formatRate(airdrop.schedule.rateBps)} of what is left,{" "}
                {describeInterval(airdrop.schedule.intervalSeconds)}, on the terms it opened with.
              </>
            ) : null}
          </p>
        </div>
      ) : !termsEditable ? (
        <div className="flex items-start gap-2.5 bg-surface-2 p-3 shadow-[inset_0_0_0_1px_var(--border)]">
          <LockSimple size={15} weight="fill" className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            The reserve, the rate and the interval are fixed on chain and nobody can change them,
            you included: holders are already claiming against them. What you can still do is
            below.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ad-reserve">{recurring ? "Set aside for the rounds" : "Pool"}</Label>
              <Input
                id="ad-reserve"
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                inputMode="decimal"
                className="num"
              />
              <Hint>
                Currently <Mono>{formatAmount(airdrop.reserve, decimals, 2)}</Mono> {symbol}.
              </Hint>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ad-min">Minimum holding</Label>
              <Input
                id="ad-min"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                inputMode="decimal"
                className="num"
              />
              <Hint>Wallets below this get nothing, and the pool splits across the rest.</Hint>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="ad-start">Claiming opens</Label>
              <Input
                id="ad-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="num"
              />
              <Hint>
                Currently <Mono>{formatDateTime(airdrop.startsAt)}</Mono>. After this moment the
                terms are fixed{recurring ? ", the rate and the interval included" : ""}.
              </Hint>
            </div>
          </div>

          {recurring && draft ? (
            <section
              aria-label="Round schedule"
              className="flex flex-col gap-5 bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--border)] sm:p-5"
            >
              <ScheduleFields value={draft} onChange={setDraft} idPrefix="adjust-drip" />
            </section>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              disabled={Boolean(problem) || !changed || busy}
              onClick={() => {
                if (problem || nextReserve === null || nextMinimum === null || parsedStart === null) return;
                void adjust({
                  id: airdrop.id,
                  reserve: nextReserve,
                  minimumHolding: nextMinimum,
                  startsAt: parsedStart,
                  schedule: nextSchedule,
                }).catch(() => {
                  // Already reported as a toast and in the panel's own state.
                });
              }}
            >
              {busy ? "Saving..." : "Save changes"}
            </Button>
            {problem ? <Hint tone="error">{problem}</Hint> : null}
            {!problem && !changed ? <Hint>Nothing has changed yet.</Hint> : null}
          </div>
        </>
      )}

      {/*
        Handing over what has accrued.

        A drip's schedule runs on its own and the scheduled job both restates the split and
        sends holders their payouts. This control restates the split on demand, signed here
        rather than by anything holding a key on a server, for when waiting for the job is not
        what you want.
      */}
      {isCreator && airdrop.stoppedAt === undefined && airdrop.schedule ? (
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[13.5px] font-medium text-fg">Refresh who is counted</h3>
            <p className="text-[12.5px] leading-relaxed text-fg-muted">
              Takes a fresh snapshot of who holds the token, so wallets that have bought or sold
              since the last one are counted on their current holdings. The scheduled job does
              this on its own before every payout, and this is here for when you do not want to
              wait for it.
            </p>
          </div>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={busy}
            onClick={() => {
              void adjust({id: airdrop.id}).catch(() => {
                // Already surfaced as a toast.
              });
            }}
          >
            {busy ? "Refreshing..." : "Refresh the holder snapshot"}
          </Button>
        </div>
      ) : null}

      {/*
        Stopping ends the schedule and returns what it has not released yet. It deliberately
        does not touch what holders are already owed: the amounts that have accrued stay
        accrued and stay claimable, which is the difference between calling off the rest of a
        giveaway and taking one back.
      */}
      {stoppable.allowed && held > 0n ? (
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[13.5px] font-medium text-fg">Stop it and take back the rest</h3>
            <p className="text-[12.5px] leading-relaxed text-fg-muted">
              Ends the schedule now and returns the{" "}
              <Mono className="text-fg">{formatAmount(held, decimals, 2)}</Mono> {symbol} it has not
              released. What holders have already accrued stays theirs and stays claimable, and
              nothing further is released after this. It cannot be undone.
            </p>
          </div>
          {confirmingStop ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (!address) return;
                  void stop(airdrop.id, address).catch(() => {
                    // Already surfaced as a toast.
                  });
                }}
              >
                {busy ? "Stopping..." : `Yes, take back ${formatAmount(held, decimals, 2)} ${symbol}`}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmingStop(false)}>
                Keep it running
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="w-fit" onClick={() => setConfirmingStop(true)}>
              Stop this airdrop
            </Button>
          )}
        </div>
      ) : null}

      {airdrop.stoppedAt !== undefined ? (
        <div className="flex items-start gap-2.5 rounded-md bg-warn-dim p-3 shadow-[inset_0_0_0_1px_var(--warn-dim)]">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-warn">
            You stopped this on <Mono>{formatDateTime(airdrop.stoppedAt)}</Mono> and took back{" "}
            <Mono>{formatAmount(airdrop.withdrawn ?? 0n, decimals, 2)}</Mono> {symbol}. What was
            already released is still claimable by the holders it was released to.
          </p>
        </div>
      ) : null}
    </section>
  );
}
