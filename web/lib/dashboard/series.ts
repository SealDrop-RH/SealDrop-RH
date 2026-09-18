import type {Lock} from "@/lib/locks/types";

/**
 * The dashboard's activity series.
 *
 * Pure, so it can be built on the server, rendered into the markup, and tested without a
 * browser. One measure only: locks created, cumulative.
 *
 * It is deliberately NOT two measures on one plot. The obvious version of this chart puts a
 * count on one scale and a value on another and draws both, which is a dual-axis chart: the
 * two lines cross wherever the arbitrary scaling makes them cross, so every apparent
 * relationship between them is an artefact. One measure, one axis. A second measure gets a
 * second chart.
 */

export const DAY = 86_400;

export interface ActivityPoint {
  /** Unix seconds, start of the day in UTC. */
  day: number;
  /** Locks created on this day. */
  created: number;
  /** Locks created on or before this day. */
  total: number;
}

export type Range = "30d" | "all";

export function startOfDay(unixSeconds: number): number {
  return Math.floor(unixSeconds / DAY) * DAY;
}

/**
 * Builds one point per day from the first lock to `endDay`, with no gaps.
 *
 * Gaps matter: a line drawn only through days that had activity slopes smoothly between
 * them and hides the quiet stretches entirely. Every day present means a flat run reads as
 * a flat run.
 */
export function buildActivity(locks: Lock[], endDay: number, range: Range): ActivityPoint[] {
  if (locks.length === 0) return [];

  const created = new Map<number, number>();
  for (const lock of locks) {
    const day = startOfDay(lock.lockedAt);
    created.set(day, (created.get(day) ?? 0) + 1);
  }

  const first = Math.min(...created.keys());
  const windowStart = range === "30d" ? Math.max(first, endDay - 29 * DAY) : first;

  // Locks from before the window still count toward the running total: a 30-day view is a
  // window onto a total, not a reset of it.
  let total = 0;
  for (const [day, count] of created) if (day < windowStart) total += count;

  const points: ActivityPoint[] = [];
  for (let day = windowStart; day <= endDay; day += DAY) {
    const madeToday = created.get(day) ?? 0;
    total += madeToday;
    points.push({day, created: madeToday, total});
  }

  return points;
}

/** The path commands for an area and its top line, given a plot box. */
export function activityPath(
  points: ActivityPoint[],
  width: number,
  height: number,
): {line: string; area: string; x: (i: number) => number; y: (value: number) => number} {
  const peak = Math.max(1, ...points.map((p) => p.total));
  const lastIndex = Math.max(1, points.length - 1);

  const x = (i: number) => (i / lastIndex) * width;
  // A 6px headroom so the line never runs along the very top edge of the box.
  const y = (value: number) => height - (value / peak) * (height - 6);

  if (points.length === 0) return {line: "", area: "", x, y};

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.total).toFixed(2)}`).join("");
  const area = `${line}L${width.toFixed(2)},${height}L0,${height}Z`;

  return {line, area, x, y};
}
