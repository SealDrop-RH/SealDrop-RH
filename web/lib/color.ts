/**
 * sRGB parsing and WCAG contrast. Used by test/contrast.test.ts against lib/skins.ts,
 * and by lib/strip/palette.ts to turn a resolved custom property into canvas fill bytes.
 *
 * No color literals live here: every value is passed in.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0..1. rgba() inputs carry alpha; hex inputs are opaque. */
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Returns null on anything else. */
export function parseColor(input: string): Rgb | null {
  const value = input.trim();

  const hex = HEX.exec(value);
  if (hex) {
    let body = hex[1];
    if (body.length === 3 || body.length === 4) {
      body = body
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (body.length !== 6 && body.length !== 8) return null;
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = FUNCTIONAL.exec(value);
  if (fn) {
    const rawAlpha = fn[4];
    const a =
      rawAlpha === undefined
        ? 1
        : rawAlpha.endsWith("%")
          ? Number(rawAlpha.slice(0, -1)) / 100
          : Number(rawAlpha);
    return {r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a};
  }

  return null;
}

/**
 * Composites a possibly translucent color over an opaque one. Every token in this app
 * sits on a known ground, so a semi-transparent border still has a measurable contrast.
 */
export function over(top: Rgb, bottom: Rgb): Rgb {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2.1 contrast ratio, 1 to 21. Translucent foregrounds are composited first. */
export function contrastRatio(fg: string, bg: string): number {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) throw new Error(`Unparseable color pair: ${fg} on ${bg}`);
  const ground = b.a < 1 ? over(b, {r: 0, g: 0, b: 0, a: 1}) : b;
  const front = f.a < 1 ? over(f, ground) : f;
  const l1 = relativeLuminance(front);
  const l2 = relativeLuminance(ground);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes two colors in sRGB. The canvas uses this for the freeze color take. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

/* ---- perceptual distance ---------------------------------------------------
   Contrast ratio only measures brightness, so two colors of the same lightness and
   wildly different hue score 1.0 on it, the same as two identical colors. Telling
   status colors apart is a hue question as much as a brightness one, so it needs a
   perceptual metric. This is CIE76: not the most refined formula available, but more
   than accurate enough to answer "can someone see that these are two different colors".
   --------------------------------------------------------------------------- */

interface Lab {
  L: number;
  a: number;
  b: number;
}

/** D65, the white point sRGB is defined against. */
const WHITE = {x: 0.95047, y: 1, z: 1.08883};

function toLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function toLab(color: Rgb): Lab {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);

  const x = pivot((r * 0.4124 + g * 0.3576 + b * 0.1805) / WHITE.x);
  const y = pivot((r * 0.2126 + g * 0.7152 + b * 0.0722) / WHITE.y);
  const z = pivot((r * 0.0193 + g * 0.1192 + b * 0.9505) / WHITE.z);

  return {L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
}

/** CIE76 colour difference. Roughly: under 2.3 is imperceptible, over 10 is obvious. */
export function deltaE(first: string, second: string): number {
  const a = parseColor(first);
  const b = parseColor(second);
  if (!a || !b) throw new Error(`Unparseable color pair: ${first} and ${second}`);
  const one = toLab(a);
  const two = toLab(b);
  return Math.hypot(one.L - two.L, one.a - two.a, one.b - two.b);
}
