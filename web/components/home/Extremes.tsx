import {cn} from "@/lib/cn";
import {formatCompact, formatDate, lockedShare} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";
import {MICRO, SectionHead} from "@/components/ui/instrument";
import {Reveal} from "./Reveal";
import {StripField} from "./StripField";

/**
 * Three readings from the same instrument, at the top, middle and bottom of its range.
 *
 * This is here to answer the objection the fold invites. One strip at 62% could be a
 * flattering picture; three, at 90%, at the median and at 3%, show that the picture is a
 * measurement and that it is just as willing to say "almost nothing is locked".
 *
 * These do not play the freeze. Three animations firing at once would read as a slideshow,
 * and the freeze is the fold's moment.
 */
export function Extremes({locks}: {locks: Array<{lock: Lock; caption: string}>}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-[1680px]">
        <SectionHead
          tag="Fig. 02"
          title="Range of the register"
          note="Same field, same scale, three locks"
        />
        <div className="grid grid-cols-1 md:grid-cols-3">
          {locks.map(({lock, caption}, i) => {
            const share = lockedShare(lock.amount, lock.token.totalSupply);
            return (
              <Reveal
                key={lock.id}
                delay={i * 0.05}
                className={cn(
                  "min-w-0 border-b border-border p-3 last:border-b-0 sm:p-4",
                  "md:border-b-0 md:border-r md:last:border-r-0",
                )}
              >
                <div className="flex items-baseline justify-between gap-3 pb-3">
                  <p className={cn(MICRO, "text-fg-subtle")}>{caption}</p>
                  <p className="num flex items-baseline gap-2 text-[13px] text-fg">
                    <span className="text-fg-muted">{lock.token.symbol}</span>
                    {(share * 100).toFixed(1)}
                    <span className="text-[10px] text-accent">%</span>
                  </p>
                </div>
                <StripField
                  seed={lock.id}
                  share={share}
                  className="aspect-[320/72] w-full md:aspect-[420/76]"
                />
                <p className={cn(MICRO, "flex flex-wrap gap-x-3 gap-y-1 pt-3 text-fg-subtle")}>
                  <span className="num normal-case tracking-normal">
                    {formatCompact(lock.amount, lock.token.decimals)} {lock.token.symbol}
                  </span>
                  <span>until</span>
                  <span className="num normal-case tracking-normal">
                    {formatDate(lock.unlockAt)}
                  </span>
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
