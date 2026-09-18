import type {ReactNode} from "react";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";

/**
 * The status rail. The first thing on a screen, and deliberately not a headline.
 *
 * It states what you are looking at, where the numbers came from and when they were read.
 * An instrument that does not declare its source and its timestamp is not an instrument, it
 * is a poster, and this product's whole argument is that a trust tool should open with a
 * reading rather than a claim.
 *
 * Source is not decoration either. While locks are simulated the rail says so, in the same
 * type as everything else, at the top, before any number is quoted.
 *
 * Every screen gets one, which is what makes the register and the dashboard read as two
 * views of the same instrument rather than two products.
 */

export interface RailField {
  label: string;
  value: string;
  /**
   * The breakpoint at which this field earns its width. The rail sheds fields rather than
   * wrapping to a second line, because a status bar that wraps is not a status bar.
   */
  show?: string;
}

export function Rail({
  title,
  fields,
  live = true,
  wide = false,
}: {
  title: string;
  fields: RailField[];
  /** The pulsing marker at the right end. Off for a screen that is not reading anything. */
  live?: boolean;
  /** The register runs full width; the app screens sit in the narrower column. */
  wide?: boolean;
}) {
  return (
    <div className="border-y border-border">
      <div
        className={cn(
          "mx-auto flex h-8 w-full items-stretch",
          wide ? "max-w-[1680px]" : "max-w-[1180px]",
        )}
      >
        <p className={cn(MICRO, "flex shrink-0 items-center px-3 text-fg sm:px-4")}>{title}</p>

        <div className="flex min-w-0 flex-1 items-stretch divide-x divide-border border-l border-border">
          {fields.map((field) => (
            <p
              key={field.label}
              className={cn(
                MICRO,
                "min-w-0 items-center gap-2 px-3 text-fg-subtle",
                field.show ?? "hidden sm:flex",
              )}
            >
              {field.label}
              <span className="num truncate text-[10px] normal-case tracking-normal text-fg-muted">
                {field.value}
              </span>
            </p>
          ))}
          {live ? <LiveMarker /> : null}
        </div>
      </div>
    </div>
  );
}

function LiveMarker(): ReactNode {
  return (
    <p className={cn(MICRO, "ml-auto flex shrink-0 items-center gap-2 px-3 text-fg-muted sm:px-4")}>
      <span aria-hidden className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping bg-accent opacity-60" />
        <span className="relative h-1.5 w-1.5 bg-accent" />
      </span>
      Live
    </p>
  );
}
