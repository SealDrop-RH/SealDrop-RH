import {cn} from "@/lib/cn";
import {MICRO, SectionHead} from "@/components/ui/instrument";
import {Reveal} from "./Reveal";

/**
 * What the machine does, in four movements, written as operating instructions rather than
 * as benefits. The verbs carry it; the numerals are the only large type, and they are large
 * because they are an order, not because the step is exciting.
 */
const STEPS = [
  {
    title: "Select",
    body: "Paste the token address and an amount. The form states the share of total supply you are about to take out of circulation before anything is signed.",
  },
  {
    title: "Seal",
    body: "Pick a date. The contract records the amount, the owner and the unlock timestamp. The date can be pushed further out later, never pulled in.",
  },
  {
    title: "Publish",
    body: "You get a permanent proof page and a share image showing the locked amount against total supply. Both are drawn from chain state.",
  },
  {
    title: "Release",
    body: "After the timestamp, and only then, the owner can withdraw. Every state change is a transaction anyone can look up.",
  },
];

export function Procedure() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-[1680px]">
        <SectionHead tag="Sec. 02" title="Procedure" note="Four steps, about a minute" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.title}
              delay={i * 0.05}
              className={cn(
                "flex min-w-0 flex-col gap-3 border-b border-border p-3 sm:p-4",
                "lg:border-b-0 lg:border-r lg:last:border-r-0",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="num text-[28px] leading-none text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={cn(MICRO, "text-fg")}>{step.title}</span>
              </div>
              <p className="max-w-[46ch] font-mono text-[11px] leading-[1.7] text-fg-muted">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
