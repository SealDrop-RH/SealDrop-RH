import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

/**
 * The instrument: the product's shared visual language.
 *
 * The whole system rests on two type sizes and one line weight, so they live here rather
 * than being retyped in every section and drifting apart by a pixel each time.
 *
 * MICRO is the caption grade: 10px mono, uppercase, widely tracked. Everything that is not
 * a measurement is set in it, including the product's own sales copy. The only type allowed
 * to be large is a number that was measured. That single rule is what makes a screen read
 * as a readout instead of a page about a readout.
 *
 * Corners are square throughout, and the radius tokens are deliberately not used on any
 * surface built from these parts. The argument is that this is an instrument, and an
 * instrument has edges. The tokens still exist for the things that are genuinely not part
 * of the instrument: the focus ring, and the wallet modal we do not own.
 *
 * This started as the landing page's local chrome and was promoted here when the rest of
 * the app was rebuilt on it, so the register and the dashboard are the same object.
 */

export const MICRO = "font-mono text-[10px] uppercase leading-none tracking-[0.14em]";

/**
 * Quarter gridlines, as one gradient rather than four divs.
 *
 * Shared by the register's profile column and the featured record's lock period, so both
 * axes on the page are ruled the same way and a reader learns the graduation once.
 */
export const AXIS = {
  backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
  backgroundSize: "25% 100%",
};

/** A section's stencil. Tag, name, and an optional right-hand note about the reading. */
export function SectionHead({
  tag,
  title,
  note,
}: {
  tag: string;
  title: string;
  note?: ReactNode;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-4 border-b border-border px-3 sm:px-4">
      <p className={cn(MICRO, "flex min-w-0 items-center gap-2 text-fg-muted")}>
        <span className="text-accent">{tag}</span>
        <span aria-hidden className="text-fg-subtle">
          /
        </span>
        <span className="truncate">{title}</span>
      </p>
      {note ? <p className={cn(MICRO, "hidden shrink-0 text-fg-subtle sm:block")}>{note}</p> : null}
    </div>
  );
}

/**
 * One instrument readout: a tiny label and the figure it names, on one baseline.
 *
 * Values are right aligned and monospaced, so a stack of these has every digit landing on
 * the same column and the stack can be read downward as a single number block.
 */
export function Readout({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  // A suffix like "%" gets a fixed slot that every row reserves whether it has one or not,
  // so the digits keep a single right edge down the stack instead of each row's number
  // being shunted left by its own unit. Anything longer than two characters is a second
  // fact rather than a suffix, and is set clear of the figure.
  const long = unit !== undefined && unit.length > 2;

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-[0.6rem] sm:px-4">
      <span className={cn(MICRO, "text-fg-subtle")}>{label}</span>
      <span className="flex shrink-0 items-baseline">
        {long ? <span className="num pr-2 text-[11px] text-fg-subtle">{unit}</span> : null}
        <span className="num text-[20px] leading-none text-fg">{value}</span>
        <span className="num w-3 text-left text-[11px] leading-none text-fg-subtle">
          {long ? "" : unit}
        </span>
      </span>
    </div>
  );
}

/** Label above, value below. For the featured record's specification block. */
export function Spec({label, value}: {label: string; value: ReactNode}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-[0.45rem]">
      <span className={cn(MICRO, "text-fg-subtle")}>{label}</span>
      <span className="num shrink-0 text-[12px] leading-none text-fg-muted">{value}</span>
    </div>
  );
}

const ACTION_BASE = cn(
  "inline-flex h-11 items-center justify-between gap-6 px-3.5",
  "font-mono text-[10.5px] font-medium uppercase tracking-[0.14em]",
  "transition-[background-color,color,box-shadow,transform] duration-[var(--dur-micro)] ease-out",
  // Same 0.97 press the shipped buttons use. The shape changes on this page; the feedback
  // does not.
  "active:scale-[0.97]",
);

export function actionClass(variant: "primary" | "ghost" = "ghost", className?: string) {
  return cn(
    ACTION_BASE,
    variant === "primary"
      ? "bg-accent text-accent-fg hover:brightness-110"
      : "text-fg shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-2",
    className,
  );
}
