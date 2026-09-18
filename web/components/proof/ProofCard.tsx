import {ArrowSquareOut} from "@phosphor-icons/react/dist/ssr";
import {explorerAddressUrl, explorerTxUrl} from "@/lib/chain";
import {formatAmount, formatDate, formatDateTime, shortAddress} from "@/lib/format";
import {StatePill} from "@/components/locks/StatePill";
import {SupplyStrip} from "@/components/strip/SupplyStrip";
import {Countdown} from "@/components/locks/Countdown";
import {SimulatedRibbon} from "./SimulatedRibbon";
import {deploymentFor} from "@/lib/contracts/addresses";
import type {Lock} from "@/lib/locks/types";

/** One labelled fact. Every row on this card is something a reader might want to verify. */
function Row({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-[12.5px] text-fg-subtle">{label}</dt>
      <dd className="text-right text-[13.5px] text-fg">{children}</dd>
    </div>
  );
}

/**
 * The shareable surface.
 *
 * Its job is to let someone who did not create the lock check it, so every figure is shown
 * at full precision alongside its rounded form, and the addresses link out to the explorer.
 * The particle strip replaces the flat bar once it exists.
 */
export function ProofCard({lock}: {lock: Lock}) {
  // "0x" is the placeholder the chain adapter uses when no hash is known. A real hash is 66
  // characters; anything shorter is the absence of one.
  const hasTxHash = lock.txHash.length > 2;
  const contractAddress = deploymentFor(lock.chainId)?.PonsLock;

  return (
    <div className="flex flex-col gap-5">
      {lock.simulated ? <SimulatedRibbon /> : null}

      <div className="flex flex-col gap-5 bg-surface p-5 shadow-[var(--shadow-1)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="display text-2xl font-semibold tracking-tight text-fg">
              ${lock.token.symbol}
            </p>
            <p className="text-[13px] text-fg-muted">{lock.token.name}</p>
          </div>
          <StatePill state={lock.state} />
        </div>

        <SupplyStrip lock={lock} play scrubber />

        <dl className="flex flex-col divide-y divide-border">
          <Row label="Amount locked">
            <span className="num">{formatAmount(lock.amount, lock.token.decimals)}</span>{" "}
            <span className="text-fg-muted">{lock.token.symbol}</span>
          </Row>
          <Row label="Total supply">
            <span className="num">{formatAmount(lock.token.totalSupply, lock.token.decimals, 0)}</span>
          </Row>
          <Row label="Unlocks">
            <span className="num">{formatDateTime(lock.unlockAt)}</span>
          </Row>
          {lock.state === "active" ? (
            <Row label="Time remaining">
              <Countdown unlockAt={lock.unlockAt} />
            </Row>
          ) : null}
          <Row label="Locked on">
            <span className="num">{formatDate(lock.lockedAt)}</span>
          </Row>
          <Row label="Owner">
            <ExplorerLink href={explorerAddressUrl(lock.owner)} disabled={lock.simulated}>
              {shortAddress(lock.owner)}
            </ExplorerLink>
          </Row>
          <Row label="Token">
            <ExplorerLink href={explorerAddressUrl(lock.token.address)} disabled={lock.simulated}>
              {shortAddress(lock.token.address)}
            </ExplorerLink>
          </Row>
          {/* Only rendered when there is a transaction to point at.
              PonsLock identifies a lock by its index and stores no hash, so a lock read
              back from chain has none until an indexer matches it to the Locked event. A
              row linking to /tx/0x is worse than no row: it looks like a verifiable
              reference and resolves to nothing. */}
          {hasTxHash ? (
            <Row label="Transaction">
              <ExplorerLink href={explorerTxUrl(lock.txHash)} disabled={lock.simulated}>
                {shortAddress(lock.txHash, 10, 8)}
              </ExplorerLink>
            </Row>
          ) : (
            <Row label="Lock contract">
              <ExplorerLink href={explorerAddressUrl(contractAddress ?? "")} disabled={!contractAddress}>
                {contractAddress ? shortAddress(contractAddress) : "not deployed"}
              </ExplorerLink>
            </Row>
          )}
        </dl>

        {lock.note ? (
          <p className="text-[13px] leading-relaxed text-fg-muted">{lock.note}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Inert while the lock is simulated. A link that opens an explorer page saying "not found"
 * is worse than no link: it looks like the explorer is wrong rather than the lock being
 * imaginary.
 */
function ExplorerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="num text-fg-subtle" title="No transaction yet. Contracts ship in part 2.">
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="num inline-flex items-center gap-1 text-accent hover:underline"
    >
      {children}
      <ArrowSquareOut size={12} aria-hidden />
    </a>
  );
}
