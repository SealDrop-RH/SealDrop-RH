import {positionAt, stripGeometry, type StripLayout} from "./layout";
import {rgbString, type StripPalette} from "./palette";
import {mix} from "@/lib/color";

/**
 * Painting one frame of the strip.
 *
 * Separate from the React component on purpose: it is called from a requestAnimationFrame
 * loop that must not touch React at all, and it is the same function whether the frame is
 * one still picture or the six-hundredth of an animation.
 *
 * The expensive part of canvas work at this scale is not the rectangles, it is changing
 * fillStyle: a colour change flushes the batch. So particles are bucketed by how far they
 * have taken on the locked colour and drawn a bucket at a time, which turns a few thousand
 * style changes per frame into at most BUCKETS of them.
 */

const BUCKETS = 10;

/**
 * Reused across frames so a 60fps loop allocates nothing. The bucket arrays are truncated
 * rather than recreated, which keeps their capacity, and the coordinate buffers only ever
 * grow.
 */
export interface DrawScratch {
  buckets: number[][];
  xs: Float32Array;
  ys: Float32Array;
}

export function createScratch(capacity = 0): DrawScratch {
  return {
    buckets: Array.from({length: BUCKETS}, () => [] as number[]),
    xs: new Float32Array(capacity),
    ys: new Float32Array(capacity),
  };
}

function ensureCapacity(scratch: DrawScratch, length: number): void {
  if (scratch.xs.length >= length) return;
  scratch.xs = new Float32Array(length);
  scratch.ys = new Float32Array(length);
}

export interface DrawOptions {
  layout: StripLayout;
  palette: StripPalette;
  /** Seconds. Drives the drift and the bob. */
  time: number;
  /** 0 to 1. */
  freeze: number;
  /** CSS pixels. The context is expected to be scaled by dpr already. */
  width: number;
  height: number;
  scratch: DrawScratch;
  /**
   * Draws a dimmer trailing copy of each circulating particle.
   *
   * Only used by the reduced-motion renderer, where the picture never moves and needs some
   * other way to say that most of this supply is still in motion.
   */
  motionCue?: boolean;
}

export function drawStrip(context: CanvasRenderingContext2D, options: DrawOptions): void {
  const {layout, palette, time, freeze, width, height, scratch} = options;
  const {toPx, sizePx} = stripGeometry(width, height);

  context.fillStyle = rgbString(palette.field);
  context.fillRect(0, 0, width, height);

  for (const bucket of scratch.buckets) bucket.length = 0;

  const particles = layout.particles;
  // Frames are computed once and stashed, so the bucketed draw below does not recompute
  // positionAt per bucket.
  ensureCapacity(scratch, particles.length);
  const {xs, ys} = scratch;

  for (let i = 0; i < particles.length; i += 1) {
    const frame = positionAt(particles[i], time, freeze, layout.lockedShare);
    const point = toPx(frame);
    xs[i] = point.x;
    ys[i] = point.y;
    const bucket = Math.min(BUCKETS - 1, Math.floor(frame.k * BUCKETS));
    scratch.buckets[bucket].push(i);
  }

  for (let b = 0; b < BUCKETS; b += 1) {
    const indices = scratch.buckets[b];
    if (indices.length === 0) continue;

    // The bucket's midpoint, so the ends of the ramp are not biased toward one colour.
    const t = (b + 0.5) / BUCKETS;
    context.fillStyle = rgbString(mix(palette.free, palette.locked, t));

    for (const i of indices) {
      const side = sizePx(particles[i]);
      const half = side / 2;
      context.fillRect(xs[i] - half, ys[i] - half, side, side);
    }
  }

  if (options.motionCue) {
    // A frozen motion-blur tail: a dimmer copy offset behind each drifting particle. In a
    // still frame it is the only thing left that can say these are moving.
    context.globalAlpha = 0.35;
    context.fillStyle = rgbString(palette.free);
    for (let i = 0; i < particles.length; i += 1) {
      if (particles[i].frozen) continue;
      const side = sizePx(particles[i]);
      const half = side / 2;
      context.fillRect(xs[i] - half - side * 0.9, ys[i] - half, side, side);
    }
    context.globalAlpha = 1;
  }
}
