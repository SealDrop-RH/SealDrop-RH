"use client";

import {useClock} from "@/components/Clock";
import {formatDate, timeLeft} from "@/lib/format";

/**
 * Time until a lock opens, ticking against the one shared clock.
 *
 * aria-live is deliberately off. A countdown that announces itself every second makes a
 * screen reader unusable, so the date is exposed as text instead and the ticking figure is
 * hidden from the accessibility tree.
 */
export function Countdown({unlockAt, className}: {unlockAt: number; className?: string}) {
  const now = useClock();
  const remaining = timeLeft(unlockAt, now);

  return (
    <span className={className}>
      <span aria-hidden className="num">
        {remaining}
      </span>
      <span className="sr-only">
        {remaining === "unlocked" ? "Unlocked" : `Unlocks in ${remaining}, on ${formatDate(unlockAt)}`}
      </span>
    </span>
  );
}
