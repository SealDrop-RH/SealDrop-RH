"use client";

import {useAccount} from "wagmi";
import {LockSimple} from "@phosphor-icons/react";
import {Button, Hint, Mono} from "@/components/ui/primitives";
import {TxProgress} from "@/components/lock/TxProgress";
import {useLockTx} from "@/lib/hooks/useLockTx";
import {useClock} from "@/components/Clock";
import {Countdown} from "./Countdown";
import {formatAmount, formatDateTime} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";

/**
 * Taking a lock's tokens back out.
 *
 * Only the owner sees it, because it is the only wallet that can do it and the proof page is
 * public: a control that everyone can see and one wallet can use invites the reading that the
 * rest are being refused something, when in fact they were never party to it.
 *
 * Nothing here can shorten a lock. The date is the whole promise the proof above makes, so the
 * only thing this adds is the one action that was always going to be possible once it passed,
 * and which the app had no way to reach until now.
 */
export function WithdrawPanel({lock}: {lock: Lock}) {
  const {address} = useAccount();
  const now = Math.floor(useClock() / 1000);
  const {withdraw, state, busy, reset} = useLockTx();

  // Not the owner: nothing to say. The terms are on the page above for everyone alike.
  if (!address || address.toLowerCase() !== lock.owner.toLowerCase()) return null;

  const {decimals, symbol} = lock.token;
  const alreadyOut = lock.state === "withdrawn";
  const ready = now >= lock.unlockAt;

  return (
    <section className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="display text-lg font-semibold tracking-tight text-fg">
          {alreadyOut ? "This lock has been withdrawn" : "Take the tokens back out"}
        </h2>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          {alreadyOut
            ? "The tokens are back in your wallet and this record stays as the history of it."
            : "You locked these, so you are the only wallet that can withdraw them."}
        </p>
      </header>

      {alreadyOut ? null : !ready ? (
        <div className="flex items-start gap-2.5 bg-surface-2 p-3 shadow-[inset_0_0_0_1px_var(--border)]">
          <LockSimple size={15} weight="fill" className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            Still locked for <Countdown unlockAt={lock.unlockAt} className="text-fg" />, until{" "}
            <Mono>{formatDateTime(lock.unlockAt)}</Mono>. Nobody can bring that forward, you
            included: that is what the proof above is worth.
          </p>
        </div>
      ) : (
        <>
          <TxProgress
            status={state.status}
            error={state.error}
            onRetry={() => void withdraw(lock.id).catch(() => {})}
            onCancel={reset}
            done={{label: "Withdrawn", note: "The tokens are back in your wallet."}}
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              className="w-fit"
              disabled={busy}
              onClick={() => {
                void withdraw(lock.id).catch(() => {
                  // Already surfaced as a toast and in the progress panel.
                });
              }}
            >
              {busy
                ? "Withdrawing..."
                : `Withdraw ${formatAmount(lock.amount, decimals, 2)} ${symbol}`}
            </Button>
            <Hint>
              The unlock date passed on <Mono>{formatDateTime(lock.unlockAt)}</Mono>. This sends the
              whole amount back to you in one transaction.
            </Hint>
          </div>
        </>
      )}
    </section>
  );
}
