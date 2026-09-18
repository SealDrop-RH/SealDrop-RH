"use client";

import {Button, Hint, Mono} from "@/components/ui/primitives";
import {SimulatedRibbon} from "@/components/proof/SimulatedRibbon";
import {TxProgress} from "./TxProgress";
import {formatAmount, formatDateTime, formatPercent, humanDuration, lockedShare} from "@/lib/format";
import type {TokenMeta, TxStatus} from "@/lib/locks/types";

/**
 * What is about to be signed, beside the form rather than under it.
 *
 * Every figure is restated from the parsed values, not echoed from the inputs. A summary
 * that reproduces the text someone typed reviews nothing: the point is to show what the
 * transaction will actually carry, including the slack added to the unlock date and the
 * share of supply nobody typed at all.
 *
 * Rows stay present and dashed out before they have a value, so the panel does not reflow
 * as the form fills in and the person reading it can see what is still missing.
 */
export function LockSummary({
  token,
  amount,
  unlockAt,
  now,
  simulated,
  status,
  error,
  busy,
  ready,
  problem,
  connected,
  onSubmit,
  onConnect,
  onRetry,
  onCancel,
}: {
  token: TokenMeta | null;
  amount: bigint | null;
  unlockAt: number | null;
  now: number;
  simulated: boolean;
  status: TxStatus;
  error?: string;
  busy: boolean;
  ready: boolean;
  problem: string | null;
  connected: boolean;
  onSubmit: () => void;
  onConnect: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const share = token && amount !== null ? lockedShare(amount, token.totalSupply) : null;

  return (
    <aside
      aria-label="Lock summary"
      className="flex flex-col gap-4 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="display text-lg font-semibold tracking-tight text-fg">Lock summary</h2>
        <p className="num text-[10.5px] tracking-wider text-fg-subtle">REVIEW BEFORE SIGNING</p>
      </header>

      <dl className="flex flex-col divide-y divide-border">
        <Row label="Token" value={token ? `$${token.symbol}` : null} />
        <Row label="Amount" value={token && amount !== null ? formatAmount(amount, token.decimals, 6) : null} />
        <Row
          label="Share of supply"
          value={share !== null ? formatPercent(share) : null}
          tone="accent"
        />
        <Row label="Unlocks" value={unlockAt !== null ? formatDateTime(unlockAt) : null} />
        <Row
          label="Locked for"
          value={unlockAt !== null ? humanDuration(unlockAt - now) : null}
        />
      </dl>

      {simulated ? <SimulatedRibbon /> : null}

      <TxProgress status={status} error={error} onRetry={onRetry} onCancel={onCancel} />

      <div className="flex flex-col gap-2">
        {!connected ? (
          <Button variant="primary" size="lg" onClick={onConnect}>
            Connect wallet to lock
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={!ready || busy} onClick={onSubmit}>
            {busy ? "Locking..." : "Lock supply"}
          </Button>
        )}

        {/* The reason the button is disabled, rather than leaving it to be guessed at. */}
        {connected && problem ? <Hint>{problem}</Hint> : null}
        {connected && ready ? (
          <Hint>There is no way to open this early. Check the date before you sign.</Hint>
        ) : null}
      </div>
    </aside>
  );
}

function Row({label, value, tone}: {label: string; value: string | null; tone?: "accent"}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-[12.5px] text-fg-subtle">{label}</dt>
      <dd className="text-right text-[13.5px]">
        {value === null ? (
          <span aria-label="not set yet" className="num text-fg-subtle">
            ...
          </span>
        ) : (
          <Mono className={tone === "accent" ? "text-accent" : "text-fg"}>{value}</Mono>
        )}
      </dd>
    </div>
  );
}
