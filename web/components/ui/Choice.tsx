"use client";

import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

/**
 * Picking one of a few.
 *
 * Both of these are radio groups rather than lists of buttons, because that is what they are:
 * exactly one is chosen at a time, and a keyboard or a screen reader should be told so rather
 * than being handed five buttons and left to infer it.
 *
 * `Segmented` is for a choice that changes what the form *is*, the mode of the thing being
 * created. `Chip` is for a preset that fills a field in that mode, which is why chips sit
 * next to the input they fill rather than replacing it: the shortcut never becomes the only
 * way to say something.
 */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: ReadonlyArray<{value: T; label: string; hint?: string}>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--border)]", className)}
      // Inline rather than a Tailwind class: the column count comes from the options, and a
      // class built by interpolation is a class Tailwind never sees and never generates.
      style={{gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`}}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-col items-start gap-0.5 px-3 py-2 text-left",
              "transition-[background-color,color,box-shadow] duration-[var(--dur-micro)] ease-out",
              selected
                ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border-strong)]"
                : "text-fg-muted hover:text-fg",
            )}
          >
            <span className="text-[13px] font-medium">{option.label}</span>
            {option.hint ? (
              <span className={cn("text-[11.5px]", selected ? "text-fg-muted" : "text-fg-subtle")}>
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of shortcuts for one field.
 *
 * `aria-checked` rather than `aria-pressed`: pressing one un-presses the others, which is a
 * radio group, and a set of toggles would be announced as five independent switches.
 */
export function ChipRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {children}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center px-3 text-[13px] font-medium",
        "transition-[background-color,color,box-shadow,transform] duration-[var(--dur-micro)] ease-out",
        "active:scale-[0.97]",
        selected
          ? "bg-accent text-accent-fg"
          : "bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-3",
      )}
    >
      {children}
    </button>
  );
}
