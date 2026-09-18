"use client";

import {Chip, ChipRow} from "@/components/ui/Choice";
import {Hint, Input, Label, Mono} from "@/components/ui/primitives";
import {
  DAY_SECONDS,
  HOUR_SECONDS,
  INTERVAL_PRESETS,
  MINUTE_SECONDS,
  RATE_PRESETS,
  describeInterval,
  formatRate,
  parseRateBps,
  roundsToRelease,
  scheduleProblem,
} from "@/lib/airdrops/schedule";
import {humanDuration} from "@/lib/format";
import type {AirdropSchedule} from "@/lib/airdrops/types";

/**
 * The two numbers that define a drip, and the one that ends it.
 *
 * Presets and free input both, side by side rather than one behind the other. The presets are
 * the answers almost everyone wants, ten minutes, hourly, daily, and the inputs are there
 * because "almost" is doing real work in that sentence, and a form that only offers presets
 * is a form that decides for you.
 *
 * The draft is text, not numbers. A field that coerces as you type cannot hold "2." on the
 * way to "2.5", and one that silently rounds 0.005% to nothing is worse than one that says no.
 */

export const UNIT_SECONDS = {
  minutes: MINUTE_SECONDS,
  hours: HOUR_SECONDS,
  days: DAY_SECONDS,
} as const;

export type ScheduleUnit = keyof typeof UNIT_SECONDS;

export interface ScheduleDraft {
  /** A percentage, as typed. "5", "2.5". */
  rate: string;
  /** How many `unit`s between rounds, as typed. */
  every: string;
  unit: ScheduleUnit;
  /** Rounds to stop after. Empty means it never stops. */
  stopAfter: string;
}

export const DEFAULT_DRAFT: ScheduleDraft = {rate: "5", every: "10", unit: "minutes", stopAfter: ""};

const UNITS: ReadonlyArray<{value: ScheduleUnit; label: string}> = [
  {value: "minutes", label: "Minutes"},
  {value: "hours", label: "Hours"},
  {value: "days", label: "Days"},
];

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || !/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export function draftToSchedule(draft: ScheduleDraft): AirdropSchedule | null {
  const rateBps = parseRateBps(draft.rate);
  const every = wholeNumber(draft.every);
  if (rateBps === null || every === null || every < 1) return null;

  const stop = draft.stopAfter.trim();
  const maxRounds = stop === "" ? undefined : wholeNumber(stop);
  if (stop !== "" && maxRounds === null) return null;

  const schedule: AirdropSchedule = {
    rateBps,
    intervalSeconds: every * UNIT_SECONDS[draft.unit],
    maxRounds: maxRounds ?? undefined,
  };
  return scheduleProblem(schedule) === null ? schedule : null;
}

/** Why this draft cannot be used, in the words the person typing it would use. */
export function draftProblem(draft: ScheduleDraft): string | null {
  if (parseRateBps(draft.rate) === null) {
    return "That is not a percentage. Two decimal places at most.";
  }
  if (wholeNumber(draft.every) === null) return "Say how often a round should pay out.";
  if (draft.stopAfter.trim() !== "" && wholeNumber(draft.stopAfter) === null) {
    return "Stop after has to be a whole number of rounds, or be left empty.";
  }
  const schedule = draftToSchedule(draft);
  if (schedule) return null;

  // Everything parsed, so what is left is a rule rather than a typo.
  return scheduleProblem({
    rateBps: parseRateBps(draft.rate) ?? 0,
    intervalSeconds: (wholeNumber(draft.every) ?? 0) * UNIT_SECONDS[draft.unit],
    maxRounds: draft.stopAfter.trim() === "" ? undefined : (wholeNumber(draft.stopAfter) ?? 0),
  });
}

export function scheduleToDraft(schedule: AirdropSchedule): ScheduleDraft {
  const unit: ScheduleUnit =
    schedule.intervalSeconds % DAY_SECONDS === 0
      ? "days"
      : schedule.intervalSeconds % HOUR_SECONDS === 0
        ? "hours"
        : "minutes";
  return {
    rate: formatRate(schedule.rateBps).replace("%", ""),
    every: String(Math.round(schedule.intervalSeconds / UNIT_SECONDS[unit])),
    unit,
    stopAfter: schedule.maxRounds ? String(schedule.maxRounds) : "",
  };
}

export function ScheduleFields({
  value,
  onChange,
  idPrefix = "drip",
}: {
  value: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
  idPrefix?: string;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({...value, ...patch});

  const rateBps = parseRateBps(value.rate);
  const every = wholeNumber(value.every);
  const intervalSeconds = every !== null ? every * UNIT_SECONDS[value.unit] : null;
  const maxRounds = value.stopAfter.trim() === "" ? null : wholeNumber(value.stopAfter);

  // How long this runs before 99% of the reserve is out. The honest answer to "when does it
  // end", given that geometrically it never quite does.
  const roundsTo99 = rateBps !== null && rateBps > 0 ? roundsToRelease(rateBps, 9_900) : null;
  const capped = maxRounds !== null && roundsTo99 !== null && maxRounds < roundsTo99;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-rate`}>Each round hands out</Label>
        <ChipRow label="Percentage each round">
          {RATE_PRESETS.map((bps) => (
            <Chip
              key={bps}
              selected={rateBps === bps}
              onClick={() => set({rate: formatRate(bps).replace("%", "")})}
            >
              {formatRate(bps)}
            </Chip>
          ))}
        </ChipRow>
        <div className="relative max-w-[180px]">
          <Input
            id={`${idPrefix}-rate`}
            value={value.rate}
            onChange={(e) => set({rate: e.target.value})}
            inputMode="decimal"
            placeholder="5"
            aria-describedby={`${idPrefix}-rate-hint`}
            className="num pr-8"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-fg-subtle"
          >
            %
          </span>
        </div>
        <Hint>
          <span id={`${idPrefix}-rate-hint`}>
            Of whatever is <em>left</em>, not of the original amount. 5% of 100,000 is 5,000, and
            the round after that is 5% of the 95,000 still held back, which is 4,750.
          </span>
        </Hint>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-every`}>A round every</Label>
        <ChipRow label="How often a round pays out">
          {INTERVAL_PRESETS.map((preset) => (
            <Chip
              key={preset.seconds}
              selected={intervalSeconds === preset.seconds}
              onClick={() => {
                const unit: ScheduleUnit =
                  preset.seconds % DAY_SECONDS === 0
                    ? "days"
                    : preset.seconds % HOUR_SECONDS === 0
                      ? "hours"
                      : "minutes";
                set({every: String(preset.seconds / UNIT_SECONDS[unit]), unit});
              }}
            >
              {preset.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`${idPrefix}-every`}
            value={value.every}
            onChange={(e) => set({every: e.target.value})}
            inputMode="numeric"
            placeholder="10"
            className="num max-w-[110px]"
          />
          <ChipRow label="Unit">
            {UNITS.map((unit) => (
              <Chip key={unit.value} selected={value.unit === unit.value} onClick={() => set({unit: unit.value})}>
                {unit.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <Hint>
          {intervalSeconds !== null ? (
            <>
              A round&apos;s worth goes out <Mono>{describeInterval(intervalSeconds)}</Mono>, and it
              builds up continuously rather than in jumps, and it is sent to holders automatically,
              so nobody has to be here when a round lands.
            </>
          ) : (
            <>Rounds can be anything from a minute apart to a year apart.</>
          )}
        </Hint>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-stop`}>Stop after</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`${idPrefix}-stop`}
            value={value.stopAfter}
            onChange={(e) => set({stopAfter: e.target.value})}
            inputMode="numeric"
            placeholder="Never"
            className="num max-w-[140px]"
          />
          <span className="text-[13px] text-fg-muted">rounds</span>
          {value.stopAfter.trim() !== "" ? (
            <Chip selected={false} onClick={() => set({stopAfter: ""})}>
              Never stop
            </Chip>
          ) : null}
        </div>
        <Hint>
          {capped && intervalSeconds !== null && maxRounds !== null ? (
            <>
              Ends after <Mono>{humanDuration(maxRounds * intervalSeconds)}</Mono>, with what is
              left still held back. Whatever has not been released by then never is.
            </>
          ) : roundsTo99 !== null && intervalSeconds !== null && Number.isFinite(roundsTo99) ? (
            <>
              Leave it empty and it runs on. It takes{" "}
              <Mono>{roundsTo99.toLocaleString("en-US")}</Mono> rounds, or{" "}
              <Mono>{humanDuration(roundsTo99 * intervalSeconds)}</Mono>, to hand out 99% of the
              reserve, and the rounds after that get smaller for ever.
            </>
          ) : (
            <>Leave it empty and rounds keep paying out, each one smaller than the last.</>
          )}
        </Hint>
      </div>
    </div>
  );
}
