import {cn} from "@/lib/cn";
import {MICRO, SectionHead} from "@/components/ui/instrument";
import {Reveal} from "./Reveal";

/**
 * The guarantees, as a specification table.
 *
 * Stated as limits with a value in the middle column, because for a lock every valuable
 * property is a thing that cannot happen, and "NONE" in a spec column says that faster than
 * a sentence with a tick beside it does.
 *
 * The last row is the one about this build being simulated. It is in the table rather than
 * in small print at the bottom, in the same type as the claims above it, because a page
 * arguing that you should not have to trust it cannot bury the one line that is currently
 * against it.
 */
const ROWS = [
  {
    property: "Early exit",
    value: "None",
    note: "There is no function that returns tokens before the unlock date. Not for the owner of the lock, and not for us.",
  },
  {
    property: "Admin key over locked funds",
    value: "None",
    note: "The contract holds no owner powers over anything already locked. Nobody can move, pause or redirect it.",
  },
  {
    property: "Unlock date",
    value: "Extend only",
    note: "A date can be pushed further out. It cannot be pulled in, so a lock can only ever become stronger.",
  },
  {
    property: "Every figure on a proof page",
    value: "Chain state",
    note: "Read the contract on the explorer and you get the same answer. Nothing on this site is the authority.",
  },
  {
    property: "Contract",
    value: "Part 2",
    note: "These hold for the contract shipping in part 2. Until then the app runs against simulated locks, and says so on every page.",
  },
];

export function Assertions() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-[1680px]">
        <SectionHead tag="Sec. 03" title="Assertions" note="Properties held by the contract" />
        {/* One reveal for the table rather than one per row. A specification sheet that
            assembles itself line by line is a specification sheet nobody trusts. */}
        <Reveal>
          <dl>
            {ROWS.map((row) => (
              <div
                key={row.property}
                className={cn(
                  "grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-border px-3 py-3 last:border-b-0 sm:px-4",
                  "sm:grid-cols-[minmax(11rem,1.1fr)_minmax(7rem,0.6fr)_minmax(0,2.4fr)] sm:items-baseline",
                )}
              >
                <dt className={cn(MICRO, "text-fg-subtle")}>{row.property}</dt>
                <dd className={cn(MICRO, "text-accent")}>{row.value}</dd>
                <dd className="max-w-[72ch] font-mono text-[11px] leading-[1.7] text-fg-muted">
                  {row.note}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
