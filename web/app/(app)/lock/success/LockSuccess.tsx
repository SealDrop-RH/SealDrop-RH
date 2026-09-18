"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {motion, useReducedMotion} from "motion/react";
import {SupplyStrip} from "@/components/strip/SupplyStrip";
import {ShareActions} from "@/components/proof/ShareActions";
import {SimulatedRibbon} from "@/components/proof/SimulatedRibbon";
import {Empty, buttonClass} from "@/components/ui/primitives";
import {useLocalLock} from "@/lib/hooks/useLocalLocks";
import {useLock} from "@/lib/hooks/useLocks";
import {formatAmount, formatDateTime, formatPercent, lockedShare} from "@/lib/format";

/**
 * The moment.
 *
 * The strip plays its freeze here, and everything else arrives after it rather than with
 * it: the numbers at 1.2s, the share row at 1.45s. That ordering is the whole point. The
 * freeze is the thing being watched, and a page that lands its buttons at the same instant
 * asks you to look at two things at once.
 */
export function LockSuccess() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const reduced = useReducedMotion();

  // A lock just created lives in this browser only, so the local store is checked first and
  // the adapter covers the case of arriving at this URL with a fixture id.
  const local = useLocalLock(id);
  const {data: remote, isPending} = useLock(local ? undefined : id);
  const lock = local ?? remote ?? null;

  if (!id) {
    return <Empty title="No lock to show" body="This page is reached by locking something." />;
  }

  if (!lock) {
    if (isPending) return null;
    return (
      <Empty
        title="That lock is not in this browser"
        body="Locks made in part 1 are stored locally, so they do not follow you between devices."
        action={
          <Link href="/lock" className={buttonClass("primary", "sm")}>
            Lock supply
          </Link>
        }
      />
    );
  }

  const share = lockedShare(lock.amount, lock.token.totalSupply);
  // Sequenced after the 1400ms freeze, so the reward lands once the thing being rewarded
  // has finished. Collapses to no delay under reduced motion: the ordering was the point,
  // and without motion there is no ordering to preserve.
  const enter = (delay: number) =>
    reduced
      ? {initial: false as const}
      : {
          initial: {opacity: 0, y: 8},
          animate: {opacity: 1, y: 0},
          transition: {duration: 0.25, delay, ease: [0.16, 1, 0.3, 1] as const},
        };

  return (
    <div className="flex max-w-3xl flex-col gap-7">
      {lock.simulated ? <SimulatedRibbon /> : null}

      <SupplyStrip lock={lock} play scrubber />

      <motion.div {...enter(1.2)} className="flex flex-col gap-1.5">
        <p className="display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          <span className="num">{formatPercent(share, 2)}</span> of ${lock.token.symbol} is locked
        </p>
        <p className="text-sm leading-relaxed text-fg-muted">
          <span className="num">{formatAmount(lock.amount, lock.token.decimals)}</span>{" "}
          {lock.token.symbol} cannot move until{" "}
          <span className="num">{formatDateTime(lock.unlockAt)}</span>.
        </p>
      </motion.div>

      <motion.div {...enter(1.45)} className="flex flex-col gap-3">
        <ShareActions lock={lock} />
      </motion.div>

      {/* Offered here rather than inside the lock form. Locking and airdropping are two
          decisions and two transactions, and bundling them into one screen would make the
          lock look like it costs part of the supply. The lock exists now, so the airdrop can
          point back at it. */}
      <motion.div {...enter(1.6)}>
        <section className="flex flex-col items-start gap-3 bg-surface p-5 shadow-[var(--shadow-1)]">
          <h2 className="text-[15px] font-medium text-fg">Send part of this supply to holders?</h2>
          <p className="max-w-[58ch] text-[13px] leading-relaxed text-fg-muted">
            An airdrop shares a slice of {lock.token.symbol} out across the wallets holding it,
            split by how much each one holds. You set the slice, the minimum holding, and when
            claiming opens.
          </p>
          <Link
            href={`/airdrops/new?lock=${lock.id}&token=${lock.token.address}`}
            className={buttonClass("secondary", "md")}
          >
            Set up an airdrop
          </Link>
        </section>
      </motion.div>
    </div>
  );
}
