"use client";

import {useState, useSyncExternalStore} from "react";
import {FAULTS, FAULT_LABEL, readFault, writeFault, type Fault} from "@/lib/locks/faults";
import {
  readReducedMotionOverride,
  setReducedMotionOverride,
} from "@/lib/hooks/usePrefersReducedMotion";
import {clearLocal} from "@/lib/locks/store";
import {cn} from "@/lib/cn";

/**
 * The review console.
 *
 * It exists because states that are hard to reach are states that ship unlooked-at. The
 * transaction fault dial, the reduced-motion path and the freeze replay are all one click
 * away here, and all three would otherwise need either a code edit or a trip into system
 * settings.
 *
 * It sits bottom right because Next's own dev indicator owns the bottom left corner and its
 * portal sits above this one, swallowing clicks meant for this button.
 *
 * Dev only. It is not rendered at all in a production build.
 */
export function DevPanel() {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  return (
    // Bottom right, not bottom left: Next's own dev indicator lives in the bottom-left
    // corner and its portal sits above this one, so the two badges overlapped and the
    // overlay swallowed clicks meant for this button.
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {open ? <Panel /> : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md bg-surface px-2.5 py-1.5 text-[11px] text-fg-muted shadow-[var(--shadow-1)] transition-[transform,color] duration-[var(--dur-micro)] ease-out hover:text-fg active:scale-[0.97]"
      >
        {open ? "close" : "dev"}
      </button>
    </div>
  );
}

function subscribeFault(onChange: () => void) {
  window.addEventListener("pons-lock:fault-change", onChange);
  return () => window.removeEventListener("pons-lock:fault-change", onChange);
}

function subscribeReducedMotion(onChange: () => void) {
  window.addEventListener("pons-lock:reduced-motion-change", onChange);
  return () => window.removeEventListener("pons-lock:reduced-motion-change", onChange);
}

function Panel() {
  const fault = useSyncExternalStore(subscribeFault, readFault, () => "none" as Fault);
  const forcedReduced = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotionOverride,
    () => false,
  );

  return (
    <div className="flex w-64 flex-col gap-4 rounded-lg bg-surface p-3 shadow-[var(--shadow-2)]">
      <Section label="NEXT TRANSACTION" hint="Applies to the next lock you sign.">
        <div className="flex flex-col gap-1">
          {FAULTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => writeFault(option)}
              aria-pressed={fault === option}
              className={cn(
                "rounded-sm px-2 py-1.5 text-left text-[12px] transition-colors duration-[var(--dur-micro)] ease-out",
                fault === option ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {FAULT_LABEL[option]}
            </button>
          ))}
        </div>
      </Section>

      <Section label="MOTION" hint="Replays the freeze on the next load.">
        <div className="flex flex-col gap-1">
          <Toggle
            on={forcedReduced}
            onClick={() => setReducedMotionOverride(!forcedReduced)}
            label="Simulate reduced motion"
          />
          <button
            type="button"
            onClick={() => {
              try {
                // The freeze plays once per lock per tab. Forgetting that is what makes it
                // replay.
                for (const key of Object.keys(sessionStorage)) {
                  if (key.startsWith("pons-lock-freeze:")) sessionStorage.removeItem(key);
                }
              } catch {
                // Nothing to do.
              }
              window.location.reload();
            }}
            className="rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
          >
            Replay the freeze
          </button>
        </div>
      </Section>

      <Section label="DATA">
        <button
          type="button"
          onClick={() => {
            clearLocal();
            window.location.reload();
          }}
          className="rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
        >
          Clear locks made in this browser
        </button>
      </Section>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10.5px] font-medium tracking-wide text-fg-subtle">{label}</p>
      {children}
      {hint ? <p className="text-[10.5px] leading-relaxed text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

function Toggle({on, onClick, label}: {on: boolean; onClick: () => void; label: string}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center justify-between rounded-sm px-2 py-1.5 text-[12px] transition-colors duration-[var(--dur-micro)] ease-out",
        on ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      {label}
      <span className={cn("num text-[10.5px]", on ? "text-accent" : "text-fg-subtle")}>
        {on ? "on" : "off"}
      </span>
    </button>
  );
}
