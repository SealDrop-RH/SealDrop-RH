"use client";

import {Button, Hint, Input, Label, Mono} from "@/components/ui/primitives";
import {MIN_LOCK_SECONDS, parseUnlockDate, toDateTimeLocal} from "@/lib/locks/parse";
import {formatDateTime, humanDuration} from "@/lib/format";

/**
 * When the lock opens.
 *
 * Presets are offered in the units people actually think in, and the exact date stays
 * editable underneath, because "one year" and "the day after the cliff" are both real
 * answers and only one of them is a preset.
 *
 * "Forever" is deliberately not offered. Burning supply and locking it are different
 * decisions with different consequences, and a one-tap control that quietly does the
 * irreversible one belongs on a page that is about burning.
 */

const DAY = 86_400;
const PRESETS = [
  {label: "7 days", seconds: 7 * DAY},
  {label: "1 month", seconds: 30 * DAY},
  {label: "3 months", seconds: 90 * DAY},
  {label: "6 months", seconds: 182 * DAY},
  {label: "1 year", seconds: 365 * DAY},
  {label: "2 years", seconds: 730 * DAY},
];

export function UnlockDateField({
  value,
  onChange,
  now,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Unix seconds, passed in rather than read here so the field stays pure. */
  now: number;
}) {
  const unlockAt = parseUnlockDate(value);
  const tooSoon = unlockAt !== null && unlockAt < now + MIN_LOCK_SECONDS;
  const duration = unlockAt !== null ? unlockAt - now : null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="unlock">Unlock date</Label>

      <Input
        id="unlock"
        type="datetime-local"
        value={value}
        min={toDateTimeLocal(now + MIN_LOCK_SECONDS)}
        onChange={(event) => onChange(event.target.value)}
        className="num"
        aria-invalid={tooSoon}
        aria-describedby="unlock-hint"
      />

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="secondary"
            onClick={() => onChange(toDateTimeLocal(now + preset.seconds))}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div id="unlock-hint">
        {tooSoon ? (
          <Hint tone="error">
            A lock has to run for at least {humanDuration(MIN_LOCK_SECONDS)}.
          </Hint>
        ) : duration !== null ? (
          <Hint>
            Locked for <Mono>{humanDuration(duration)}</Mono>, opening{" "}
            <Mono>{formatDateTime(unlockAt as number)}</Mono>. There is no way to open it early.
          </Hint>
        ) : (
          <Hint>Pick when the tokens become withdrawable again.</Hint>
        )}
      </div>
    </div>
  );
}
