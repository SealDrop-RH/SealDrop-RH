"use client";

import {Info} from "@phosphor-icons/react";
import {ProofCard} from "@/components/proof/ProofCard";
import {Empty} from "@/components/ui/primitives";
import {useLocalLock} from "@/lib/hooks/useLocalLocks";

/**
 * A lock the server has never heard of.
 *
 * In part 1 the fixtures are shared by both sides, but a lock the user just created lives
 * only in this browser's localStorage, so the server component cannot find it. That is a
 * real limit of having no database, and it is shown as a named state rather than papered
 * over with a spinner that never resolves.
 *
 * It disappears in part 2: the chain becomes the store and both sides read the same thing.
 */
export function LocalProofFallback({id}: {id: string}) {
  const lock = useLocalLock(id);

  if (!lock) {
    return (
      <Empty
        title="No lock with that id"
        body="The link may be wrong, or the lock may have been created in a different browser. Part 1 stores locks locally, so they do not follow you between devices."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 bg-info-dim p-3 shadow-[inset_0_0_0_1px_var(--info-dim)]">
        <Info size={16} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-info">
          <strong className="font-medium">Local draft.</strong> This lock exists only in this
          browser, so the link will not open for anyone else until the contract ships in part 2.
        </p>
      </div>
      <ProofCard lock={lock} />
    </div>
  );
}
