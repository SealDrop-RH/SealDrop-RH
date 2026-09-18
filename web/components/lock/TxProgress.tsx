"use client";

import {CheckCircle, CircleNotch, Warning} from "@phosphor-icons/react";
import {Button} from "@/components/ui/primitives";
import {cn} from "@/lib/cn";
import type {TxStatus} from "@/lib/locks/types";

/**
 * The four steps a transaction goes through, and the one place it can stop.
 *
 * Shown as steps rather than a spinner because they are not interchangeable: "waiting for
 * you to sign" and "waiting for the chain" fail for different reasons and need different
 * things from the person watching. A single spinner hides which one you are in.
 *
 * Only the last step names what was done, which is why it is the only one a caller can
 * change. The airdrop form was showing "Locked / The supply is locked" on a screen that had
 * just created an airdrop, because the three shared steps carried a fourth that was not.
 */

const STEPS: Array<{status: TxStatus; label: string; note: string}> = [
  {status: "simulating", label: "Checking", note: "Making sure this will not revert."},
  {status: "signing", label: "Waiting for your signature", note: "Approve it in your wallet."},
  {status: "confirming", label: "Confirming", note: "Waiting for the chain."},
  {status: "success", label: "Locked", note: "The supply is locked."},
];

const ORDER: TxStatus[] = ["idle", "simulating", "signing", "confirming", "success"];

export function TxProgress({
  status,
  error,
  onRetry,
  onCancel,
  done,
}: {
  status: TxStatus;
  error?: string;
  onRetry: () => void;
  onCancel: () => void;
  /** What the final step says. Defaults to the lock's wording. */
  done?: {label: string; note: string};
}) {
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3 bg-negative-dim p-4 shadow-[inset_0_0_0_1px_var(--negative-dim)]">
        <div className="flex items-start gap-2.5">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-negative" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-[13.5px] font-medium text-negative">That did not go through</p>
            {/* The adapter's own sentence. Every failure path is written to be readable by
                the person it happened to, rather than being a hex code. */}
            <p className="text-[12.5px] leading-relaxed text-fg-muted">{error}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Back to the form
          </Button>
        </div>
      </div>
    );
  }

  const current = ORDER.indexOf(status);
  const steps = done ? STEPS.map((step) => (step.status === "success" ? {...step, ...done} : step)) : STEPS;

  return (
    <ol className="flex flex-col gap-2 bg-surface-2 p-4 shadow-[inset_0_0_0_1px_var(--border)]">
      {steps.map((step) => {
        const index = ORDER.indexOf(step.status);
        const done = index < current;
        const active = index === current;

        return (
          <li key={step.status} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {done || step.status === "success" ? (
                <CheckCircle
                  size={15}
                  weight="fill"
                  className={done || active ? "text-positive" : "text-fg-subtle"}
                  aria-hidden
                />
              ) : active ? (
                <CircleNotch size={14} weight="bold" className="animate-spin text-accent" aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{background: "var(--fg-subtle)"}}
                />
              )}
            </span>
            <div className="flex flex-col gap-0.5">
              <p
                className={cn(
                  "text-[13px]",
                  active ? "font-medium text-fg" : done ? "text-fg-muted" : "text-fg-subtle",
                )}
              >
                {step.label}
              </p>
              {active ? (
                <p className="text-[12px] leading-relaxed text-fg-muted">{step.note}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
