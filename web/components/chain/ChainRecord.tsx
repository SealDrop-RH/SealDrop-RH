"use client";

import {useState} from "react";
import {ArrowSquareOut, Check, Copy, SealCheck, SealWarning} from "@phosphor-icons/react";
import {Button, Hint, Skeleton} from "@/components/ui/primitives";
import {MICRO} from "@/components/ui/instrument";
import {activeChain, activeChainId, explorerAddressUrl, explorerTxUrl} from "@/lib/chain";
import {deploymentFor} from "@/lib/contracts/addresses";
import {cn} from "@/lib/cn";
import {formatAmount, formatDateTime, shortAddress} from "@/lib/format";
import {useChainRecord} from "@/lib/hooks/useChainRecord";
import {recordIndex} from "@/lib/locks/chain-ids";
import type {ChainEvent, RecordKind} from "@/lib/chain/history";

/**
 * The record behind a page, laid out so a reader can check it without trusting the page.
 *
 * Every figure elsewhere on the page is already read live from the contract. What that cannot
 * show is provenance: which contract, whether that contract's published source is the code that
 * is actually deployed, and the transactions that made the record what it is. Those are here,
 * each one in full and each one a link out to the explorer, because a verification that only
 * works if you believe this site is not a verification.
 *
 * Full values, not shortened ones, for the contract and the creating transaction: those are the
 * two things someone pastes somewhere else. The running list shortens, since it is for scanning.
 */

const PAGE = 10;

export function ChainRecord({
  kind,
  id: appId,
  token,
}: {
  kind: RecordKind;
  /** The app's id for the record ("pl_0" for a lock). Converted to the contract index here. */
  id: string;
  token: {decimals: number; symbol: string};
}) {
  const id = recordIndex(kind, appId) ?? appId;
  const {data, isPending, isError} = useChainRecord(kind, id, recordIndex(kind, appId) !== null);
  const [shown, setShown] = useState(PAGE);
  const fallbackContract = kind === "lock" ? deploymentFor(activeChainId)?.PonsLock : deploymentFor(activeChainId)?.PonsDrip;
  const contract = data?.contract ?? fallbackContract;
  const verified = data?.verification.match ?? null;
  const call = kind === "lock" ? `getLock(${id})` : `getDrip(${id})`;

  return (
    <section aria-labelledby={`chain-${kind}-${id}`} className="flex flex-col bg-surface shadow-[var(--shadow-1)]">
      <header className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`chain-${kind}-${id}`} className="display text-lg font-semibold tracking-tight text-fg">
            On chain
          </h2>
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-fg-muted">
            Every figure on this page is read from the contract. These are the transactions behind
            it, so you can check them on the explorer yourself.
          </p>
        </div>
        {data ? <VerificationBadge match={verified} /> : null}
      </header>

      <dl className="border-t border-border">
        <Fact label="Network">
          <span className="num text-[12px] text-fg">
            {activeChain.name} · {activeChainId}
          </span>
        </Fact>
        {contract ? (
          <Fact label="Contract">
            <FullValue value={contract} href={`${explorerAddressUrl(contract)}?tab=contract`} />
          </Fact>
        ) : null}
        <Fact label="Source code">
          {isPending ? (
            <Skeleton className="h-3.5 w-40" />
          ) : verified ? (
            <a
              href={`${explorerAddressUrl(contract ?? "")}?tab=contract`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-positive hover:underline"
            >
              Published and matches the deployed bytecode
              <ArrowSquareOut size={11} aria-hidden />
            </a>
          ) : (
            <span className="text-[12px] text-fg-subtle">Not verified yet</span>
          )}
        </Fact>
        <Fact label={kind === "lock" ? "Lock" : "Airdrop"}>
          <span className="num text-[12px] text-fg">
            #{id} <span className="text-fg-subtle">· {call}</span>
          </span>
        </Fact>
        <Fact label="Created in">
          {isPending ? (
            <Skeleton className="h-3.5 w-56" />
          ) : data?.created ? (
            <span className="flex min-w-0 max-w-full flex-col items-end gap-0.5">
              <FullValue value={data.created.txHash} href={explorerTxUrl(data.created.txHash)} />
              <span className="num text-[11px] text-fg-subtle">
                {formatDateTime(data.created.timestamp)} · block {data.created.blockNumber}
              </span>
            </span>
          ) : (
            <span className="text-[12px] text-fg-subtle">Not found</span>
          )}
        </Fact>
      </dl>

      <div className="flex h-9 items-center justify-between gap-3 border-t border-border px-5 sm:px-6">
        <p className={cn(MICRO, "text-fg-subtle")}>Transactions</p>
        {data ? <p className="num text-[11px] text-fg-subtle">{data.total.toLocaleString("en-US")}</p> : null}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3 border-t border-border p-5 sm:px-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : isError || !data ? (
        <div className="border-t border-border p-5 sm:px-6">
          <Hint>
            The transaction list could not be read right now. It tries again on its own, and the
            contract above can always be checked directly.
          </Hint>
        </div>
      ) : (
        <>
          <ol className="flex flex-col border-t border-border">
            {data.events.slice(0, shown).map((event) => (
              <EventRow key={`${event.txHash}:${event.logIndex}`} event={event} token={token} />
            ))}
          </ol>
          {data.events.length > shown ? (
            <div className="border-t border-border px-5 py-3 sm:px-6">
              <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, data.events.length - shown)} more
              </Button>
            </div>
          ) : data.total > data.events.length ? (
            <div className="border-t border-border px-5 py-3 sm:px-6">
              <a
                href={`${explorerAddressUrl(data.contract)}?tab=logs`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
              >
                Older transactions on the explorer
                <ArrowSquareOut size={11} aria-hidden />
              </a>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function VerificationBadge({match}: {match: "exact_match" | "match" | null}) {
  return match ? (
    <span className={cn(MICRO, "inline-flex shrink-0 items-center gap-1.5 bg-positive-dim px-2 py-1.5 text-positive")}>
      <SealCheck size={12} weight="fill" aria-hidden />
      {match === "exact_match" ? "Verified contract" : "Verified source"}
    </span>
  ) : (
    <span className={cn(MICRO, "inline-flex shrink-0 items-center gap-1.5 bg-surface-2 px-2 py-1.5 text-fg-subtle")}>
      <SealWarning size={12} aria-hidden />
      Source not verified
    </span>
  );
}

function Fact({label, children}: {label: string; children: React.ReactNode}) {
  return (
    // A grid, not a flex row: the value column needs a hard width for a 66-character hash to
    // truncate inside it. In a flex row it grows to fit and pushes out over its own label.
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b border-border px-5 py-2.5 last:border-b-0 sm:px-6">
      <dt className={cn(MICRO, "text-fg-subtle")}>{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

/** A value shown whole, with copy and a way out to the explorer. */
function FullValue({value, href}: {value: string; href: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2">
      <span className="num min-w-0 truncate text-[11.5px] text-fg-muted" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label="Copy"
        className="shrink-0 text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
      >
        {copied ? <Check size={12} weight="bold" aria-hidden /> : <Copy size={12} aria-hidden />}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in the block explorer"
        className="shrink-0 text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-accent"
      >
        <ArrowSquareOut size={12} aria-hidden />
      </a>
    </span>
  );
}

function EventRow({event, token}: {event: ChainEvent; token: {decimals: number; symbol: string}}) {
  const {title, detail} = describe(event, token);
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border px-5 py-2.5 last:border-b-0 sm:px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] text-fg">{title}</p>
        {detail ? <p className="num text-[11.5px] leading-snug text-fg-muted">{detail}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <a
          href={explorerTxUrl(event.txHash)}
          target="_blank"
          rel="noreferrer"
          className="num inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
        >
          {shortAddress(event.txHash, 8, 6)}
          <ArrowSquareOut size={11} aria-hidden />
        </a>
        <span className="num text-[11px] text-fg-subtle">{formatDateTime(event.timestamp)}</span>
      </div>
    </li>
  );
}

function describe(event: ChainEvent, token: {decimals: number; symbol: string}): {title: string; detail?: string} {
  const amount = (key: string) => `${formatAmount(BigInt(String(event.args[key] ?? "0")), token.decimals, 4)} ${token.symbol}`;
  const when = (key: string) => formatDateTime(Number(event.args[key] ?? 0));
  switch (event.name) {
    case "Locked":
      return {title: "Locked", detail: `${amount("amount")} until ${when("unlockAt")}`};
    case "Extended":
      return {title: "Unlock extended", detail: `from ${when("previousUnlockAt")} to ${when("newUnlockAt")}`};
    case "ToppedUp":
      return {title: "Topped up", detail: `+${amount("added")}, ${amount("newAmount")} in total`};
    case "Withdrawn":
      return {title: "Withdrawn", detail: `${amount("amount")} to ${shortAddress(String(event.args.to))}`};
    case "Created":
      return {title: "Created and funded", detail: amount("reserve")};
    case "RootUpdated":
      return {title: "Holder list refreshed", detail: `snapshot at block ${event.args.snapshotBlock}`};
    case "Distributed": {
      const wallets = Number(event.args.accounts ?? 0);
      return {title: "Paid out", detail: `${amount("amount")} to ${wallets} ${wallets === 1 ? "wallet" : "wallets"}`};
    }
    case "Stopped":
      return {title: "Stopped", detail: `${amount("returned")} returned to the creator`};
    default:
      return {title: event.name};
  }
}
