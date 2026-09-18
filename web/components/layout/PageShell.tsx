import type {ReactNode} from "react";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import {Rail, type RailField} from "@/components/ui/Rail";

/**
 * The one place page width, side gutter and vertical rhythm are decided. Every route uses
 * it, so none of them gets to invent its own container and drift a few pixels off.
 *
 * The header is a rail and a stencil rather than a display headline. The landing page is a
 * register that opens with a reading instead of a claim, and an app screen that opened with
 * "What would you like to do?" in 36px would be a different product wearing the same
 * palette. The title is still the largest thing in the header, but it is set at the size a
 * label gets, because on these screens the measured numbers are what deserve the type.
 *
 * `lede` survives for the screens that genuinely have to explain themselves before they can
 * be used, which is mostly the forms. It is set at caption grade, one measure wide.
 *
 * Renders a div, not a <main>. The landmark belongs to the route group's layout, and two
 * mains on one page is invalid markup that quietly breaks skip links and screen-reader
 * navigation.
 */
export function PageShell({
  title,
  tag,
  lede,
  actions,
  rail,
  children,
}: {
  title: string;
  /** The stencil number, as on the landing figures. Omitted where a screen has no figures. */
  tag?: string;
  lede?: string;
  actions?: ReactNode;
  /** Fields for the status rail. A screen with nothing to declare simply omits it. */
  rail?: RailField[];
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      {rail ? <Rail title={title} fields={rail} /> : null}

      <div className="mx-auto w-full max-w-[1180px] flex-1 px-3 py-6 sm:px-4 sm:py-8">
        <div className="flex flex-col gap-6">
          <header
            className={cn(
              "flex flex-col gap-3 border-b border-border pb-4",
              "sm:flex-row sm:items-end sm:justify-between",
            )}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <p className={cn(MICRO, "flex items-center gap-2 text-fg-muted")}>
                {tag ? <span className="text-accent">{tag}</span> : null}
                {tag ? (
                  <span aria-hidden className="text-fg-subtle">
                    /
                  </span>
                ) : null}
                <span className="truncate">{title}</span>
              </p>
              {lede ? (
                <p className="max-w-[68ch] text-[13px] leading-relaxed text-fg-muted">{lede}</p>
              ) : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A titled panel: the app's equivalent of the landing page's figures.
 *
 * Square, hairline-bounded, and headed by the same stencil the register uses, so a section
 * on the dashboard and a figure on the landing page are recognisably the same component of
 * one instrument.
 */
export function Panel({
  tag,
  title,
  note,
  children,
  className,
}: {
  tag: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-border", className)}>
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
      {children}
    </section>
  );
}
