"use client";

import {useId, useRef, useState} from "react";
import {activityPath, buildActivity, type ActivityPoint, type Range} from "@/lib/dashboard/series";
import {formatDate} from "@/lib/format";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import type {Lock} from "@/lib/locks/types";

/**
 * Locks created over time, scrubbable.
 *
 * One measure on one axis. The tempting version of this chart draws a count and a value
 * together, which needs two y-scales, and a dual-axis chart is not a comparison: the two
 * lines cross wherever the arbitrary scaling puts them, so every relationship it appears to
 * show is an artefact of the choice of scales. A second measure would get a second chart.
 *
 * SVG rather than canvas: a few hundred points is nothing, the path is server-rendered so
 * the shape is correct before any JavaScript runs, and the crosshair is a DOM element that
 * can be driven by keyboard as easily as by pointer.
 */

const WIDTH = 900;
const HEIGHT = 190;
const RANGES: Array<{value: Range; label: string}> = [
  {value: "30d", label: "30 days"},
  {value: "all", label: "All time"},
];

export function ActivityChart({locks, endDay}: {locks: Lock[]; endDay: number}) {
  const [range, setRange] = useState<Range>("all");
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();

  const points = buildActivity(locks, endDay, range);
  const {line, area, x, y} = activityPath(points, WIDTH, HEIGHT);

  // Defaults to the newest point, so the readout is populated before anyone touches it.
  const index = cursor ?? points.length - 1;
  const active: ActivityPoint | undefined = points[index];

  /** Maps a pointer position onto the nearest day. */
  function scrub(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const box = svg.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    const next = Math.round(ratio * (points.length - 1));
    setCursor(Math.max(0, Math.min(points.length - 1, next)));
  }

  return (
    <section className="border border-border">
      {/* The same stencil head every figure on the site wears, so the chart is a reading
          taken by the instrument rather than a widget parked on the page. */}
      <header className="flex h-8 items-stretch justify-between gap-4 border-b border-border">
        <p className={cn(MICRO, "flex min-w-0 items-center gap-2 px-3 text-fg-muted sm:px-4")}>
          <span className="text-accent">Fig. 01</span>
          <span aria-hidden className="text-fg-subtle">
            /
          </span>
          <span className="truncate">Locks created</span>
        </p>

        <div role="radiogroup" aria-label="Time range" className="flex items-stretch">
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={range === option.value}
              onClick={() => {
                setRange(option.value);
                // The cursor indexes into the old series and would point at a different day.
                setCursor(null);
              }}
              className={cn(
                MICRO,
                "flex items-center border-l border-border px-3",
                "transition-colors duration-[var(--dur-micro)] ease-out",
                range === option.value
                  ? "bg-surface-2 text-fg"
                  : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-4 p-3 sm:p-4">
        {/* The readout, above the plot. Values wear text tokens; the small accent square beside
            the total is what carries the series identity. */}
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Readout label="DAY" value={active ? formatDate(active.day) : "..."} />
          <Readout
            label="TOTAL LOCKS"
            value={active ? String(active.total) : "..."}
            swatch
          />
          <Readout
            label="CREATED THAT DAY"
            value={active ? String(active.created) : "..."}
            muted={active?.created === 0}
          />
        </dl>

        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="block h-[190px] w-full touch-pan-y"
            role="img"
            aria-label={`Locks created over time. ${points.length} days, ending at ${active?.total ?? 0} locks in total.`}
            onPointerMove={(event) => scrub(event.clientX)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              scrub(event.clientX);
            }}
            onPointerLeave={() => setCursor(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Recessive grid: four rules, no numbers on them. The readout carries the values. */}
            {[0.25, 0.5, 0.75, 1].map((step) => (
              <line
                key={step}
                x1={0}
                x2={WIDTH}
                y1={HEIGHT * (1 - step)}
                y2={HEIGHT * (1 - step)}
                stroke="var(--border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              // Without this the 2px line is stretched by preserveAspectRatio="none" into a
              // different thickness at either end of the plot.
              vectorEffect="non-scaling-stroke"
            />

            {active ? (
              <>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={0}
                  y2={HEIGHT}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                {/* A surface ring so the marker reads against the line it sits on. */}
                <circle
                  cx={x(index)}
                  cy={y(active.total)}
                  r={4.5}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {/* Keyboard access to the same scrub. A slider is the honest control for "pick a
              point along an axis", and it gives arrow keys, Home and End for free. */}
          <input
            type="range"
            min={0}
            max={Math.max(0, points.length - 1)}
            value={index}
            onChange={(event) => setCursor(Number(event.target.value))}
            aria-label="Read a day on the chart"
            aria-valuetext={
              active ? `${formatDate(active.day)}, ${active.total} locks in total` : undefined
            }
            className="scrubber mt-1 w-full"
          />
      </div>

        <div className={cn(MICRO, "flex flex-wrap items-center justify-between gap-2 text-fg-subtle")}>
          <span className="num normal-case tracking-normal">
            {points[0] ? formatDate(points[0].day) : ""}
          </span>
          <span className="num normal-case tracking-normal">
            {points[points.length - 1] ? formatDate(points[points.length - 1].day) : ""}
          </span>
        </div>
      </div>
    </section>
  );
}

function Readout({
  label,
  value,
  swatch,
  muted,
}: {
  label: string;
  value: string;
  swatch?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="num text-[10px] tracking-wider text-fg-subtle">{label}</dt>
      <dd className="flex items-center gap-2">
        {swatch ? (
          <span
            aria-hidden
            className="h-2.5 w-2.5"
            style={{background: "var(--accent)"}}
          />
        ) : null}
        <span className={cn("num text-xl", muted ? "text-fg-subtle" : "text-fg")}>{value}</span>
      </dd>
    </div>
  );
}
