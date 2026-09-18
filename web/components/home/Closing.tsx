import Link from "next/link";
import {cn} from "@/lib/cn";
import {MICRO, SectionHead, actionClass} from "@/components/ui/instrument";
import {Reveal} from "./Reveal";

/**
 * The claim, at the end.
 *
 * This is the only macro typography on the page, and it is the sentence the current landing
 * opens with. Putting it here is the concept in one move: the evidence is the argument, and
 * the slogan is what you are allowed to say once the reader has already been through
 * twenty four rows of it. A skeptic who never scrolls never has to read it at all.
 */
export function Closing({records}: {records: number}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-[1680px]">
        <SectionHead tag="Sec. 04" title="End of register" note={`${records} records read`} />

        <Reveal>
          <div className="flex flex-col gap-8 px-3 py-10 sm:px-4 sm:py-14">
            <h2
              className={cn(
                "display max-w-[16ch] font-semibold uppercase text-fg",
                "text-[clamp(2.1rem,7vw,5.75rem)] leading-[0.88] tracking-[-0.035em]",
              )}
            >
              Supply that cannot move
            </h2>

            <div className="flex flex-col gap-6 border-t border-border pt-6 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-[52ch] font-mono text-[11px] leading-[1.7] text-fg-muted">
                A lock takes about a minute. What comes back is a link and an image showing
                exactly how much of the supply cannot move, and until when, in the same units
                this register is printed in.
              </p>

              <div className="grid shrink-0 grid-cols-1 gap-px sm:grid-cols-2">
                <Link href="/lock" className={actionClass("primary")}>
                  Lock supply
                  <span aria-hidden className="num">
                    &gt;
                  </span>
                </Link>
                <Link href="/explore" className={actionClass("ghost")}>
                  Browse the register
                  <span aria-hidden className="num">
                    &gt;
                  </span>
                </Link>
              </div>
            </div>

            <p className={cn(MICRO, "text-fg-subtle")}>
              SealDrop / Supply lock register / Rev 1
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
