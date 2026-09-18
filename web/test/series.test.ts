import {describe, expect, it} from "vitest";
import {DAY, activityPath, buildActivity, startOfDay} from "@/lib/dashboard/series";
import {fixtureLocks} from "@/lib/locks/fixtures";

const NOW = 1_760_000_000;
const END = startOfDay(NOW);
const locks = fixtureLocks(NOW);

describe("buildActivity", () => {
  it("returns nothing for no locks", () => {
    expect(buildActivity([], END, "all")).toEqual([]);
  });

  /** A line drawn only through active days slopes through the quiet ones and hides them. */
  it("emits one point per day with no gaps", () => {
    const points = buildActivity(locks, END, "all");
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].day - points[i - 1].day).toBe(DAY);
    }
  });

  it("is cumulative and never decreases", () => {
    const points = buildActivity(locks, END, "all");
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].total).toBeGreaterThanOrEqual(points[i - 1].total);
    }
  });

  it("ends at the full count of locks", () => {
    const points = buildActivity(locks, END, "all");
    expect(points[points.length - 1].total).toBe(locks.length);
  });

  /** A window onto a total, not a reset of it. */
  it("carries locks from before a 30 day window into the running total", () => {
    const points = buildActivity(locks, END, "30d");
    expect(points).toHaveLength(30);
    expect(points[points.length - 1].total).toBe(locks.length);
    expect(points[0].total).toBeGreaterThan(0);
  });

  it("agrees with the daily counts it is built from", () => {
    const points = buildActivity(locks, END, "all");
    const summed = points.reduce((sum, p) => sum + p.created, 0);
    const before = points[0].total - points[0].created;
    expect(before + summed).toBe(locks.length);
  });
});

describe("activityPath", () => {
  const points = buildActivity(locks, END, "all");

  it("spans the full plot width", () => {
    const {x} = activityPath(points, 600, 160);
    expect(x(0)).toBe(0);
    expect(x(points.length - 1)).toBeCloseTo(600, 6);
  });

  it("puts the peak near the top and zero on the baseline", () => {
    const {y} = activityPath(points, 600, 160);
    const peak = Math.max(...points.map((p) => p.total));
    expect(y(0)).toBe(160);
    expect(y(peak)).toBeCloseTo(6, 6);
  });

  it("emits a closed area and a matching open line", () => {
    const {line, area} = activityPath(points, 600, 160);
    expect(line.startsWith("M")).toBe(true);
    expect(line.endsWith("Z")).toBe(false);
    expect(area.endsWith("Z")).toBe(true);
    expect(area.startsWith(line)).toBe(true);
  });

  it("survives a single point without dividing by zero", () => {
    const one = buildActivity([locks[0]], startOfDay(locks[0].lockedAt), "all");
    const {x, line} = activityPath(one, 600, 160);
    expect(Number.isFinite(x(0))).toBe(true);
    expect(line).toContain("M");
  });
});
