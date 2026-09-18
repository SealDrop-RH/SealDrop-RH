"use client";

import {useEffect, useRef} from "react";
import type {MotionValue} from "motion/react";
import {formatDate, humanDuration} from "@/lib/format";

/**
 * Drag time forward and watch the lock open.
 *
 * A lock is a cliff, not a vesting schedule. Mapping the scrubber onto a gradual dissolve
 * would be prettier and would teach a lie about how the product works, so the block stays
 * completely solid for every position before the unlock date and releases the instant the
 * marker crosses it. What moves before then is the date and the time remaining.
 *
 * The input is uncontrolled and writes straight into a MotionValue, and the readouts are
 * written as text content rather than state, so dragging renders React zero times. Base UI's
 * Slider is used elsewhere in this app but deliberately not here: it holds its value in
 * React state, which is one render per pointermove.
 */
export function ThawScrubber({
  lockedAt,
  unlockAt,
  freeze,
  onScrub,
}: {
  lockedAt: number;
  unlockAt: number;
  /** Written directly: 1 while the lock holds, 0 once time passes the unlock date. */
  freeze: MotionValue<number>;
  onScrub: (scrubbing: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);

  /**
   * The range spans the lock's whole life, from when it was created to a little past when
   * it opens, rather than from "now".
   *
   * Two reasons. It is derived purely from the lock, so the server and the browser render
   * the same markup and there is no clock reading during render. And scrubbing the entire
   * life of the lock is the more informative gesture: you see how much of it has already
   * elapsed, not just what is left.
   */
  const span = Math.max(60, unlockAt - lockedAt);
  const endAt = unlockAt + Math.round(span * 0.12);
  const toSeconds = (value: number) => Math.round(lockedAt + (value / 1000) * (endAt - lockedAt));
  const toValue = (seconds: number) =>
    Math.round(((seconds - lockedAt) / (endAt - lockedAt)) * 1000);

  function apply(value: number) {
    const seconds = toSeconds(value);
    const released = seconds >= unlockAt;

    freeze.set(released ? 0 : 1);

    if (dateRef.current) dateRef.current.textContent = formatDate(seconds);
    if (stateRef.current) {
      stateRef.current.textContent = released ? "released" : `${humanDuration(unlockAt - seconds)} left`;
    }
    inputRef.current?.setAttribute(
      "aria-valuetext",
      released
        ? `${formatDate(seconds)}, unlocked`
        : `${formatDate(seconds)}, ${humanDuration(unlockAt - seconds)} remaining`,
    );
  }

  // The thumb starts at today. Positioned here rather than as a defaultValue because the
  // current time cannot be read during render without the server and the browser disagreeing.
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const value = Math.max(0, Math.min(1000, toValue(now)));
    if (inputRef.current) inputRef.current.value = String(value);
    apply(value);
    // Runs when the lock changes, which is the only thing that moves the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedAt, unlockAt]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <label htmlFor="thaw" className="text-fg-subtle">
          Drag to move time forward
        </label>
        <span className="flex items-baseline gap-2">
          <span ref={dateRef} className="num text-fg">
            {formatDate(lockedAt)}
          </span>
          <span ref={stateRef} className="num text-fg-subtle">
            {humanDuration(span)} left
          </span>
        </span>
      </div>
      <input
        ref={inputRef}
        id="thaw"
        type="range"
        min={0}
        max={1000}
        defaultValue={0}
        className="scrubber"
        aria-label="Preview this lock at a later date"
        onPointerDown={() => onScrub(true)}
        onPointerUp={() => onScrub(false)}
        onPointerCancel={() => onScrub(false)}
        onFocus={() => onScrub(true)}
        onBlur={() => onScrub(false)}
        onInput={(event) => apply(Number(event.currentTarget.value))}
      />
    </div>
  );
}
