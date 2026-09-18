/**
 * Cubic bezier easing, evaluated in TypeScript.
 *
 * The strip's shaping has to happen inside positionAt rather than in the animation driving
 * it, because satori renders a frame by calling positionAt directly and has no animation at
 * all. So the same curves the CSS tokens name are needed as plain functions here.
 *
 * Hand-rolled rather than pulled from a library: it is twenty lines, it must produce bit-
 * identical output on the server and in the browser, and a dependency that changed its
 * solver would silently change what the share image looks like.
 */

/** Newton-Raphson converges in a handful of steps for the curves used here. */
const ITERATIONS = 6;
const EPSILON = 1e-6;

function sampleCurveX(t: number, x1: number, x2: number): number {
  const a = 3 * x1 - 3 * x2 + 1;
  const b = 3 * x2 - 6 * x1;
  const c = 3 * x1;
  return ((a * t + b) * t + c) * t;
}

function sampleCurveY(t: number, y1: number, y2: number): number {
  const a = 3 * y1 - 3 * y2 + 1;
  const b = 3 * y2 - 6 * y1;
  const c = 3 * y1;
  return ((a * t + b) * t + c) * t;
}

function sampleDerivativeX(t: number, x1: number, x2: number): number {
  const a = 3 * x1 - 3 * x2 + 1;
  const b = 3 * x2 - 6 * x1;
  const c = 3 * x1;
  return (3 * a * t + 2 * b) * t + c;
}

/** Returns an easing function for the given control points, matching CSS cubic-bezier. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  return function ease(input: number): number {
    if (input <= 0) return 0;
    if (input >= 1) return 1;

    let t = input;
    for (let i = 0; i < ITERATIONS; i += 1) {
      const x = sampleCurveX(t, x1, x2) - input;
      if (Math.abs(x) < EPSILON) break;
      const d = sampleDerivativeX(t, x1, x2);
      if (Math.abs(d) < EPSILON) break;
      t -= x / d;
    }

    return sampleCurveY(t, y1, y2);
  };
}

/**
 * The same curves as the --ease-* tokens in globals.css.
 *
 * Duplicated here because CSS custom properties cannot be read from a pure module, and
 * satori cannot read them at all. test/strip-geometry.test.ts pins the values so the two
 * cannot drift apart unnoticed.
 */
export const EASE_OUT = cubicBezier(0.16, 1, 0.3, 1);
export const EASE_IN = cubicBezier(0.7, 0, 0.84, 0);
export const EASE_IN_OUT = cubicBezier(0.65, 0, 0.35, 1);

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Positive fractional part, so a drifting position wraps cleanly at any time. */
export function fract(value: number): number {
  return value - Math.floor(value);
}
