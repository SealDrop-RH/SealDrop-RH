"use client";

import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {useAnimate, useReducedMotion} from "motion/react";
import {Chip, ChipRow} from "@/components/ui/Choice";
import {Hint, Input, Mono} from "@/components/ui/primitives";
import {cn} from "@/lib/cn";
import {
  caretAfterGrouping,
  cleanAmountText,
  formatAmountGrouped,
  groupDigits,
  parseAmount,
} from "@/lib/locks/parse";

/**
 * An amount field that keeps its figure readable and its ceiling physical.
 *
 * Readable: separators go in as you type, so a million reads as 1,000,000 rather than as a
 * row of zeros to be counted. The value it hands back carries them, which is safe because
 * `parseAmount` strips them before anything is signed.
 *
 * Physical: with a `max`, a keystroke that would take the figure past it does not land. The
 * field shakes once and says why in place of its hint. Refusing the keystroke rather than
 * accepting it and printing an error underneath is the whole idea: the number in the box is
 * never one that cannot be sent, so there is nothing to go back and fix.
 *
 * The shake is movement, so it is dropped under reduced motion. The refusal is not: the
 * border and the message still say it, and the keystroke is still refused.
 */

/** How long the refusal stays on screen after the last refused keystroke. */
const REFUSAL_MS = 2400;
/** A single, short pulse. Anything longer reads as an alarm rather than as a bump. */
const HAPTIC_MS = 24;

export function AmountInput({
  id,
  value,
  onChange,
  decimals,
  max,
  symbol,
  disabled,
  placeholder = "0.0",
  hint,
  shortcuts,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The token's decimals. Undefined until a token is resolved, which disables the field. */
  decimals?: number;
  /** The most this field accepts, in raw units. Undefined means no ceiling. */
  max?: bigint;
  symbol?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Shown under the field, and replaced by the refusal while one is showing. */
  hint?: ReactNode;
  /** Quick picks, kept against the field they fill rather than under its explanation. */
  shortcuts?: ReactNode;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const input = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const [refused, setRefused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // After a grouped value is committed, put the caret back after the digit it was after.
  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    if (document.activeElement === input.current) {
      input.current.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  function refuse(restoreTo: number) {
    setRefused(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefused(false), REFUSAL_MS);

    // React puts the previous value back, and with it the caret at the end. Undo that once it
    // has, so a refused keystroke in the middle of a number leaves the caret where it was.
    requestAnimationFrame(() => {
      if (input.current && document.activeElement === input.current) {
        input.current.setSelectionRange(restoreTo, restoreTo);
      }
    });

    if (reduceMotion || !scope.current) return;
    void animate(scope.current, {x: [0, -7, 6, -4, 3, -1, 0]}, {duration: 0.34, ease: "easeOut"});
    try {
      navigator.vibrate?.(HAPTIC_MS);
    } catch {
      // Not every browser that has the method lets a page use it.
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (decimals === undefined) return;
    const typed = event.target.value;
    const at = event.target.selectionStart ?? typed.length;
    const clean = cleanAmountText(typed, decimals);

    // Not an amount at all: ignored quietly. A stray letter is a slip, not an attempt to
    // exceed anything, and shaking at it would be scolding.
    if (clean === null) {
      const back = Math.max(0, at - (typed.length - value.length));
      requestAnimationFrame(() => input.current?.setSelectionRange(back, back));
      return;
    }

    if (max !== undefined && clean !== "") {
      const parsed = parseAmount(clean, decimals);
      if (typeof parsed !== "string" && parsed.raw > max) {
        refuse(Math.max(0, at - (typed.length - value.length)));
        return;
      }
    }

    const grouped = groupDigits(clean);
    caret.current = caretAfterGrouping(typed, at, grouped);
    if (refused) setRefused(false);
    onChange(grouped);
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={scope}>
        <Input
          ref={input}
          id={id}
          value={value}
          onChange={handleChange}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          disabled={disabled || decimals === undefined}
          aria-invalid={refused || undefined}
          aria-describedby={`${id}-hint`}
          className={cn(
            "num",
            refused &&
              "shadow-[inset_0_0_0_1px_var(--negative)] hover:shadow-[inset_0_0_0_1px_var(--negative)] focus:shadow-[inset_0_0_0_1px_var(--negative)]",
          )}
          // The focus ring turns too. Left accent-coloured it outshouts a one-pixel red edge, and
          // the field reads as fine at the exact moment it is refusing. Inline, because the
          // global :focus-visible rule is unlayered and outranks any utility class.
          style={refused ? {outlineColor: "var(--negative)"} : undefined}
        />
      </div>

      {shortcuts}

      {/* Polite, so a screen reader hears the refusal without it interrupting what is being read. */}
      <div id={`${id}-hint`} aria-live="polite">
        {refused && max !== undefined && decimals !== undefined ? (
          <Hint tone="error">
            You can&apos;t enter more than you hold. You hold{" "}
            <Mono>{formatAmountGrouped(max, decimals)}</Mono>
            {symbol ? ` ${symbol}` : ""}.
          </Hint>
        ) : (
          hint
        )}
      </div>
    </div>
  );
}

const SHARES = [10, 25, 50, 75, 100] as const;

/**
 * Quick picks as shares of what the wallet holds.
 *
 * People decide "a quarter of my bag", not "62,500.000000000000000001", so the shares come
 * first and the figure follows. 100% is labelled Max. Computed in bigint from the balance, so
 * Max is exactly the balance and never a rounding hair over it.
 */
export function HoldingShares({
  balance,
  decimals,
  current,
  onPick,
}: {
  balance: bigint;
  decimals: number;
  /** What the field currently parses to, to mark the matching chip. */
  current: bigint | null;
  onPick: (value: string) => void;
}) {
  if (balance === 0n) return null;
  return (
    <ChipRow label="Share of your holding">
      {SHARES.map((share) => {
        const amount = (balance * BigInt(share)) / 100n;
        return (
          <Chip
            key={share}
            selected={current !== null && current > 0n && current === amount}
            onClick={() => onPick(formatAmountGrouped(amount, decimals))}
          >
            {share === 100 ? "Max" : `${share}%`}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
