import Link from "next/link";
import {cn} from "@/lib/cn";
import {formatCompact, formatDate, humanDuration, lockedShare} from "@/lib/format";
import type {Lock, LockState} from "@/lib/locks/types";
import {AXIS, MICRO, SectionHead} from "@/components/ui/instrument";
import {RegisterBar} from "./RegisterBar";

/**
 * The register: every lock that exists, as one table that is also one chart.
 *
 * The share column and the profile column are the same measurement twice, on purpose. The
 * figures give you the exact number and align down a column; the profile gives you the
 * shape of the whole set in one glance, because the rows are sorted by share and share is
 * measured against a single axis ruled through all of them. Neither one alone does both
 * jobs, and a page whose argument is "check the numbers" cannot make you choose.
 *
 * The axis gridlines are drawn per row rather than as one overlay, so the row rules cut
 * them. A chart printed on ruled paper, which is what this is.
 */

const TICKS = [0, 25, 50, 75, 100];

const STATE: Record<LockState, {label: string; dot: string}> = {
  active: {label: "Locked", dot: "bg-accent"},
  unlockable: {label: "Open", dot: "bg-warn"},
  withdrawn: {label: "Out", dot: "bg-fg-subtle"},
  pending: {label: "Pending", dot: "bg-info"},
};

/**
 * One template, declared once and used by the header and every row, so a column cannot
 * drift between them. Mobile is three columns and two lines; the profile wraps to its own
 * full width line rather than being dropped, because it is the point of the table.
 */
const ROW = cn(
  "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5",
  "sm:grid-cols-[2.5rem_5rem_minmax(0,1fr)_4.5rem_minmax(9rem,2.6fr)_6.25rem_5rem_5.5rem]",
  "sm:h-8 sm:gap-y-0 sm:px-4 sm:py-0",
);

export function Register({locks, asOf}: {locks: Lock[]; asOf: number}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-[1680px]">
        <SectionHead
          tag="Tbl. 01"
          title="Full register, sorted by share of supply"
          note="Profile axis: 0 to 100% of total supply"
        />

        {/* ---- column heads, and the axis every row is measured against ---- */}
        <div
          className={cn(
            ROW,
            MICRO,
            "hidden border-b border-border text-fg-subtle sm:grid",
          )}
        >
          <span>#</span>
          <span>Token</span>
          <span className="text-right">Locked</span>
          <span className="text-right">Share</span>
          <span className="relative h-8 border-x border-border">
            {TICKS.map((tick) => (
              <span
                key={tick}
                className="num absolute top-1/2 text-[9px] tracking-normal"
                style={{
                  left: `${tick}%`,
                  transform:
                    tick === 0
                      ? "translate(2px, -50%)"
                      : tick === 100
                        ? "translate(-100%, -50%) translateX(-2px)"
                        : "translate(-50%, -50%)",
                }}
              >
                {tick}
              </span>
            ))}
          </span>
          <span>Unlock</span>
          <span className="text-right">Remaining</span>
          <span>State</span>
        </div>

        <ol>
          {locks.map((lock, index) => {
            const share = lockedShare(lock.amount, lock.token.totalSupply);
            const state = STATE[lock.state];
            const muted = lock.state === "withdrawn";
            const remaining =
              lock.state === "active" ? humanDuration(Math.max(0, lock.unlockAt - asOf)) : "-";

            return (
              <li key={lock.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/proof/${lock.id}`}
                  className={cn(
                    ROW,
                    "font-mono text-[11px] transition-colors duration-[var(--dur-micro)] ease-out hover:bg-bg-elev",
                  )}
                >
                  <span className="num text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>

                  <span className="flex min-w-0 flex-col gap-1 sm:block sm:truncate">
                    <span className="num truncate text-fg">{lock.token.symbol}</span>
                    {/* The columns the phone cannot afford, folded under the symbol. */}
                    <span className="num text-[10px] text-fg-subtle sm:hidden">
                      {formatCompact(lock.amount, lock.token.decimals)} until{" "}
                      {formatDate(lock.unlockAt)}
                    </span>
                  </span>

                  <span className="num hidden text-right text-fg-muted sm:block">
                    {formatCompact(lock.amount, lock.token.decimals)}
                  </span>

                  <span className={cn("num text-right", muted ? "text-fg-subtle" : "text-fg")}>
                    {(share * 100).toFixed(1)}
                  </span>

                  <span className="relative col-span-3 h-1.5 w-full overflow-hidden sm:col-span-1 sm:h-auto sm:self-stretch sm:border-x sm:border-border">
                    <RegisterBar share={share} index={index} muted={muted} />
                    <span aria-hidden className="absolute inset-0" style={AXIS} />
                  </span>

                  <span className="num hidden text-fg-muted sm:block">
                    {formatDate(lock.unlockAt)}
                  </span>

                  <span className="num hidden text-right text-fg-subtle sm:block">{remaining}</span>

                  <span
                    className={cn(MICRO, "hidden items-center gap-2 text-fg-subtle sm:flex")}
                  >
                    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0", state.dot)} />
                    <span className="truncate">{state.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
