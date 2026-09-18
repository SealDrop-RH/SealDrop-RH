import {formatCompact, formatPercent} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";

/**
 * What the picture means, in words.
 *
 * Visible in every mode, not only under reduced motion. The canvas is aria-hidden because a
 * field of squares has nothing useful to announce, so this is the accessible copy of the
 * same fact, and it is also what makes the strip legible to someone who has simply not
 * worked out what they are looking at yet.
 */
export function StripLegend({lock, unitValue}: {lock: Lock; unitValue?: string}) {
  const {decimals, symbol} = lock.token;
  const circulating = lock.token.totalSupply - lock.amount;
  const share = Number(lock.amount) / Number(lock.token.totalSupply);

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5"
          style={{background: "var(--supply-locked)"}}
        />
        <span className="num text-fg">{formatCompact(lock.amount, decimals)}</span> {symbol} locked
        <span className="num text-fg-subtle">({formatPercent(share, 1)})</span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5"
          style={{background: "var(--supply-free)"}}
        />
        <span className="num">{formatCompact(circulating, decimals)}</span> circulating
      </span>

      {/* Turns the picture into arithmetic. Without it a viewer has no way to know whether
          one square is a token or a million of them. */}
      {unitValue ? (
        <span className="text-fg-subtle">
          1 tick = <span className="num">{unitValue}</span> {symbol}
        </span>
      ) : null}
    </p>
  );
}
