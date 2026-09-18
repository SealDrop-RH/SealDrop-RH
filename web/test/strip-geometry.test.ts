import {describe, expect, it} from "vitest";
import {layoutSupplyStrip, stripGeometry} from "@/lib/strip/layout";

const SHARES = [0, 0.03, 0.15, 0.428, 0.5, 0.728, 0.902, 1];
const COUNTS = [220, 900, 1800, 3600];
const ASPECTS = [320 / 96, 1120 / 160];

describe("block geometry", () => {
  /**
   * The property that lets the share image use 220 particles where the canvas uses a few
   * thousand. Grain may differ between the two renderers; the thing that carries the meaning
   * may not. If this ever fails, the card and the page are telling different stories about
   * the same lock.
   */
  it("puts the block in the same place regardless of particle count", () => {
    for (const share of SHARES) {
      for (const aspect of ASPECTS) {
        const blocks = COUNTS.map(
          (count) => layoutSupplyStrip({seed: "pl_x", count, lockedShare: share, aspect}).block,
        );
        for (const block of blocks) expect(block).toEqual(blocks[0]);
      }
    }
  });

  it("makes the block exactly as wide as the locked share", () => {
    for (const share of SHARES) {
      const {block} = layoutSupplyStrip({seed: "pl_x", count: 1200, lockedShare: share, aspect: 7});
      expect(block.x1 - block.x0).toBeCloseTo(share, 12);
    }
  });

  it("freezes a count proportional to the share", () => {
    for (const share of SHARES) {
      const layout = layoutSupplyStrip({seed: "pl_x", count: 1000, lockedShare: share, aspect: 7});
      expect(layout.frozenCount).toBe(Math.round(1000 * share));
    }
  });

  it("clamps a share outside [0, 1] rather than drawing nonsense", () => {
    expect(layoutSupplyStrip({seed: "s", count: 100, lockedShare: -0.5, aspect: 7}).frozenCount).toBe(0);
    expect(layoutSupplyStrip({seed: "s", count: 100, lockedShare: 3, aspect: 7}).frozenCount).toBe(100);
  });

  it("survives the two degenerate shares", () => {
    const none = layoutSupplyStrip({seed: "s", count: 500, lockedShare: 0, aspect: 7});
    expect(none.frozenCount).toBe(0);
    expect(none.particles.every((p) => !p.frozen)).toBe(true);

    const all = layoutSupplyStrip({seed: "s", count: 500, lockedShare: 1, aspect: 7});
    expect(all.frozenCount).toBe(500);
    expect(all.particles.every((p) => p.frozen)).toBe(true);
    expect(all.block.x1).toBe(1);
  });
});

describe("the frozen grid", () => {
  it("gives every frozen particle a slot inside the block", () => {
    for (const share of SHARES.filter((s) => s > 0)) {
      const layout = layoutSupplyStrip({seed: "pl_x", count: 1800, lockedShare: share, aspect: 7});
      for (const particle of layout.particles.filter((p) => p.frozen)) {
        expect(particle.fx).toBeGreaterThanOrEqual(layout.block.x0);
        expect(particle.fx).toBeLessThanOrEqual(layout.block.x1 + 1e-9);
        expect(particle.fy).toBeGreaterThanOrEqual(0);
        expect(particle.fy).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives every frozen particle a distinct slot", () => {
    const layout = layoutSupplyStrip({seed: "pl_x", count: 1800, lockedShare: 0.42, aspect: 7});
    const slots = layout.particles
      .filter((p) => p.frozen)
      .map((p) => `${p.fx.toFixed(9)}:${p.fy.toFixed(9)}`);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("has enough cells to hold every frozen particle", () => {
    for (const share of SHARES.filter((s) => s > 0)) {
      for (const count of COUNTS) {
        const layout = layoutSupplyStrip({seed: "pl_x", count, lockedShare: share, aspect: 7});
        expect(layout.grid.rows * layout.grid.columns).toBeGreaterThanOrEqual(layout.frozenCount);
      }
    }
  });

  /** Cells that come out as slivers make the block read as a bar chart rather than units. */
  it("keeps cells close to square once rendered", () => {
    for (const share of [0.15, 0.428, 0.728, 0.902]) {
      const width = 1120;
      const height = 160;
      const layout = layoutSupplyStrip({seed: "pl_x", count: 2400, lockedShare: share, aspect: width / height});
      const ratio = (layout.grid.cellWidth * width) / (layout.grid.cellHeight * height);
      expect(ratio, `share ${share} cell ratio ${ratio.toFixed(2)}`).toBeGreaterThan(0.45);
      expect(ratio, `share ${share} cell ratio ${ratio.toFixed(2)}`).toBeLessThan(2.2);
    }
  });

  it("sweeps the freeze left to right", () => {
    const layout = layoutSupplyStrip({seed: "pl_x", count: 1800, lockedShare: 0.6, aspect: 7});
    const frozen = layout.particles.filter((p) => p.frozen);
    const first = frozen.slice(0, 40).reduce((a, p) => a + p.delay, 0) / 40;
    const last = frozen.slice(-40).reduce((a, p) => a + p.delay, 0) / 40;
    expect(last).toBeGreaterThan(first);
  });
});

describe("stripGeometry", () => {
  it("maps unit space onto the canvas", () => {
    const {toPx} = stripGeometry(1120, 160);
    expect(toPx({x: 0, y: 0})).toEqual({x: 0, y: 0});
    expect(toPx({x: 1, y: 1})).toEqual({x: 1120, y: 160});
    expect(toPx({x: 0.5, y: 0.25})).toEqual({x: 560, y: 40});
  });

  it("never renders a particle smaller than a pixel", () => {
    const layout = layoutSupplyStrip({seed: "s", count: 3600, lockedShare: 0.9, aspect: 7});
    const {sizePx} = stripGeometry(320, 96);
    for (const particle of layout.particles) expect(sizePx(particle)).toBeGreaterThanOrEqual(1);
  });
});
