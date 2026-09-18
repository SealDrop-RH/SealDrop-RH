"use client";

import {ArrowSquareOut} from "@phosphor-icons/react";
import {MICRO} from "@/components/ui/instrument";
import {explorerTxUrl} from "@/lib/chain";
import {cn} from "@/lib/cn";
import {shortAddress} from "@/lib/format";
import {useCreationTx} from "@/lib/hooks/useChainRecord";
import {recordIndex} from "@/lib/locks/chain-ids";
import type {RecordKind} from "@/lib/chain/history";

/**
 * A card's creating transaction, as its last line.
 *
 * Sits above the card's own link (z-[2] over the stretched link's z-[1]) so it opens the
 * explorer rather than the record, and renders nothing for simulated records, which have no
 * transaction to point at.
 */
export function CreationTx({kind, id, simulated}: {kind: RecordKind; id: string; simulated: boolean}) {
  const index = recordIndex(kind, id);
  const {hash, isPending} = useCreationTx(kind, index ?? "", !simulated && index !== null);
  if (simulated || index === null) return null;

  return (
    <div className="relative z-[2] flex h-8 items-center justify-between gap-2 border-t border-border px-3">
      <span className={cn(MICRO, "text-fg-subtle")}>On chain</span>
      {hash ? (
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Creating transaction ${hash}, opens the block explorer`}
          className="num inline-flex items-center gap-1 text-[11px] text-fg-muted transition-colors duration-[var(--dur-micro)] ease-out hover:text-accent"
        >
          tx {shortAddress(hash, 8, 6)}
          <ArrowSquareOut size={11} aria-hidden />
        </a>
      ) : (
        <span className="num text-[11px] text-fg-subtle">{isPending ? "finding tx..." : "tx not found"}</span>
      )}
    </div>
  );
}
