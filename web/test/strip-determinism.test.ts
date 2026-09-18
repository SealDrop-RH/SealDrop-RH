import {describe, expect, it} from "vitest";
import {layoutSupplyStrip, positionAt} from "@/lib/strip/layout";
import {fnv1a32, mulberry32, seeded} from "@/lib/strip/rng";
import {EASE_OUT, cubicBezier, fract} from "@/lib/strip/easing";

const INPUT = {seed: "pl_2enswfph", count: 1200, lockedShare: 0.428, aspect: 7};

describe("rng", () => {
  it("is stable for a given seed", () => {
    const a = seeded("pons");
    const b = seeded("pons");
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });

  it("gives different sequences for different seeds", () => {
    expect(seeded("a")()).not.toBe(seeded("b")());
  });

  it("stays inside [0, 1)", () => {
    const random = mulberry32(fnv1a32("range"));
    for (let i = 0; i < 5000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  /**
   * The whole reason this is not Math.random: the server renders the share image and the
   * browser renders the canvas, and they have to draw the same field.
   */
  it("produces identical output across independent generators, which is what lets the server and the browser agree", () => {
    const first = Array.from({length: 200}, seeded("cross-runtime"));
    const second = Array.from({length: 200}, seeded("cross-runtime"));
    expect(first).toEqual(second);
  });
});

describe("layoutSupplyStrip", () => {
  it("is byte-identical across calls", () => {
    expect(layoutSupplyStrip(INPUT)).toEqual(layoutSupplyStrip(INPUT));
  });

  it("changes when the seed changes", () => {
    const other = layoutSupplyStrip({...INPUT, seed: "pl_different"});
    expect(other.particles[0].x).not.toBe(layoutSupplyStrip(INPUT).particles[0].x);
  });
});

describe("positionAt", () => {
  const layout = layoutSupplyStrip(INPUT);
  const frozen = layout.particles.filter((p) => p.frozen);
  const free = layout.particles.filter((p) => !p.frozen);

  /**
   * The property the share image depends on. Satori renders one frame at t = 0, freeze = 1;
   * the canvas is at freeze = 1 whenever it has finished. If those disagreed for any t, the
   * card and the page would show different pictures of the same lock.
   */
  it("puts every frozen particle exactly on its slot at freeze = 1, whatever the time", () => {
    for (const t of [0, 0.5, 3.25, 91, 900_000, 1e7]) {
      for (const particle of frozen) {
        const frame = positionAt(particle, t, 1, layout.lockedShare);
        expect(frame.x).toBeCloseTo(particle.fx, 12);
        expect(frame.y).toBeCloseTo(particle.fy, 12);
        expect(frame.k).toBe(1);
      }
    }
  });

  it("leaves every particle inside the field at every freeze", () => {
    for (const freeze of [0, 0.13, 0.5, 0.87, 1]) {
      for (const particle of layout.particles) {
        const frame = positionAt(particle, 4.2, freeze, layout.lockedShare);
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.x).toBeLessThanOrEqual(1);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeLessThanOrEqual(1);
      }
    }
  });

  /** Circulating supply is what the lock did not take, so it belongs to the right of it. */
  it("clears the block of circulating particles once the freeze completes", () => {
    for (const t of [0, 7.5, 240]) {
      for (const particle of free) {
        expect(positionAt(particle, t, 1, layout.lockedShare).x).toBeGreaterThanOrEqual(
          layout.lockedShare - 1e-9,
        );
      }
    }
  });

  it("keeps circulating particles uncoloured", () => {
    for (const particle of free) expect(positionAt(particle, 1, 0.5, layout.lockedShare).k).toBe(0);
  });

  it("is continuous in time, so a long-lived page never jumps", () => {
    const particle = free[0];
    const before = positionAt(particle, 9999.99, 1, layout.lockedShare);
    const after = positionAt(particle, 10000.0, 1, layout.lockedShare);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.05);
  });

  it("is a pure function of its arguments", () => {
    const particle = frozen[3];
    expect(positionAt(particle, 2, 0.4, layout.lockedShare)).toEqual(
      positionAt(particle, 2, 0.4, layout.lockedShare),
    );
  });
});

describe("easing", () => {
  it("pins the endpoints", () => {
    expect(EASE_OUT(0)).toBe(0);
    expect(EASE_OUT(1)).toBe(1);
  });

  it("matches the --ease-out token's control points and front-loads the motion", () => {
    // cubic-bezier(0.16, 1, 0.3, 1). Over a third of the travel by a tenth of the time is
    // what makes the freeze read as fast without being short.
    expect(EASE_OUT(0.1)).toBeGreaterThan(0.33);
    expect(EASE_OUT(0.35)).toBeGreaterThan(0.8);
  });

  it("is monotonic", () => {
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const value = EASE_OUT(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("matches a linear curve exactly, which is the solver's sanity check", () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(linear(t)).toBeCloseTo(t, 5);
  });

  it("wraps negative input correctly in fract", () => {
    expect(fract(-0.25)).toBeCloseTo(0.75, 12);
    expect(fract(2.5)).toBeCloseTo(0.5, 12);
  });
});
