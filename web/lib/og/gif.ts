import {GIFEncoder, quantize, applyPalette} from "gifenc";
import {layoutSupplyStrip, stripGeometry, type Particle} from "@/lib/strip/layout";
import {OG_PARTICLE_COUNT} from "@/lib/strip/og";
import {clamp01} from "@/lib/strip/easing";
import {parseColor, type Rgb} from "@/lib/color";
import {SKIN} from "@/lib/skins";

/**
 * The share image as an animated GIF.
 *
 * The still card says how much supply is locked. The animated one shows it: the frozen block
 * sits perfectly still while everything around it keeps drifting, which is the product's
 * entire argument in one loop.
 *
 * Built by compositing rather than by rendering the whole card N times. Satori is asked once
 * for the text and chrome, and each frame then draws particles into a copy of that buffer.
 * Rendering the full card per frame would cost well over a second each.
 */

export interface StripBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Drift positions for a seamless loop.
 *
 * Deliberately not positionAt: that drift is continuous, so after any fixed duration the
 * particles are wherever they happen to be and the loop jumps when it wraps.
 *
 * This used to wrap each particle across the whole field once per loop, which was wrong
 * twice over. It moved every particle a full field width in four seconds, where layout.ts
 * gives the canvas a crossing of fourteen to fifty, so the card ran several times faster
 * than the hero it is supposed to match. And a wrap is a pop: a particle vanishing off the
 * right edge and reappearing on the left, a couple of hundred times a loop.
 *
 * Now each one travels a small closed arc and returns to exactly where it began, so there is
 * no wrap to hide and the per-frame step is a few pixels against a particle roughly eight to
 * fifteen pixels wide. Small movement also means small frame differences, which is most of
 * why the file got smaller rather than larger.
 *
 * The frozen slots come from the same layoutSupplyStrip the canvas and the still card use,
 * so the thing that carries the meaning is identical across all three. Only the texture
 * differs, and only in order to loop.
 */
function loopPosition(particle: Particle, progress: number, lockedShare: number, seconds: number) {
  if (particle.frozen) return {x: particle.fx, y: particle.fy};

  const start = lockedShare;
  const theta = 2 * Math.PI * (progress + particle.phase);

  /**
   * Amplitude chosen so this particle's fastest moment equals its own canvas drift speed.
   *
   * A sine's peak rate is 2*pi*A/T, so setting A to speed*T/(2*pi) makes the two agree. The
   * particle therefore moves at the speed layout.ts gives it, which is the same speed the
   * live hero moves it at, instead of the several times faster a full crossing per loop
   * forced. It is scaled by each particle's own speed, so the field keeps its mix of
   * quicker and slower units rather than swaying as one body.
   */
  const amplitude = (particle.speed * seconds) / (2 * Math.PI);

  const u = clamp01(particle.x + amplitude * Math.sin(theta));
  // One whole cosine cycle per loop, so the vertical bob closes as cleanly as the drift.
  const bob = 0.012 * Math.cos(theta);
  return {x: start + u * (1 - start), y: Math.min(1, Math.max(0, particle.y + bob))};
}

function fill(
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colour: Rgb,
) {
  const left = Math.max(0, Math.round(x0));
  const top = Math.max(0, Math.round(y0));
  const right = Math.min(width, Math.round(x0 + w));
  const bottom = Math.min(height, Math.round(y0 + h));

  for (let y = top; y < bottom; y += 1) {
    let offset = (y * width + left) * 4;
    for (let x = left; x < right; x += 1) {
      buffer[offset] = colour.r;
      buffer[offset + 1] = colour.g;
      buffer[offset + 2] = colour.b;
      buffer[offset + 3] = 255;
      offset += 4;
    }
  }
}

export interface GifOptions {
  /** The card, already rendered by satori and decoded, without any particles in the strip. */
  background: Uint8ClampedArray;
  width: number;
  height: number;
  /** Where the strip sits inside the card. */
  strip: StripBox;
  seed: string;
  lockedShare: number;
  frames?: number;
  /** Milliseconds per frame. */
  delay?: number;
  /** Fewer than the still card uses: every particle costs a rectangle on every frame. */
  particles?: number;
}

/**
 * Loop length, and why it is these two numbers.
 *
 * frames * delay is how long the loop runs, and loopPosition reads it: each particle's arc
 * is sized from it so the particle moves at its own canvas speed whatever the loop length
 * is. Changing either number therefore changes how far things travel, never how fast, which
 * is the property that keeps this card and the live hero in step.
 *
 * 50ms is 20 frames a second, which is about as smooth as GIF gets: delays are stored in
 * hundredths of a second, so the next step up is 10ms and no browser honours it. 80 of them
 * gives a four second loop, long enough that the drift reads as unhurried and short enough
 * to stay a reasonable download.
 *
 * Frames used to cost the whole card each, which is what made eighty of them unaffordable.
 * They no longer do: see the differencing note further down, which is what pays for this
 * frame rate.
 */
const FRAMES = 80;
const DELAY_MS = 50;

export function renderStripGif(options: GifOptions): Uint8Array {
  const {background, width, height, strip, seed, lockedShare} = options;
  const frames = options.frames ?? FRAMES;
  const delay = options.delay ?? DELAY_MS;
  const seconds = (frames * delay) / 1000;
  const count = options.particles ?? OG_PARTICLE_COUNT;

  const layout = layoutSupplyStrip({
    seed,
    count,
    lockedShare,
    aspect: strip.width / strip.height,
  });
  const {toPx, sizePx} = stripGeometry(strip.width, strip.height);

  const free = parseColor(SKIN.supplyFree) ?? {r: 71, g: 76, b: 83, a: 1};
  const locked = parseColor(SKIN.supplyLocked) ?? {r: 255, g: 98, b: 0, a: 1};

  // The frozen block never moves, so it is painted into the background once rather than
  // redrawn on every frame.
  const base = new Uint8ClampedArray(background);
  for (const particle of layout.particles) {
    if (!particle.frozen) continue;
    const point = toPx({x: particle.fx, y: particle.fy});
    const side = sizePx(particle);
    fill(base, width, height, strip.x + point.x - side / 2, strip.y + point.y - side / 2, side, side, locked);
  }

  const encoder = GIFEncoder();
  const frame = new Uint8ClampedArray(base.length);

  /**
   * Only the drifting particles change, so every frame after the first writes just those.
   *
   * Each frame is still the full size of the card, because gifenc hardcodes the image
   * descriptor's offset to (0, 0) and cannot place a smaller frame over the strip. What it
   * does support is transparency and disposal, which gets the same result: a pixel equal to
   * the one already on screen is written as the transparent index, disposal 1 leaves what is
   * underneath alone, and the roughly seven tenths of the card that never moves collapses
   * into one enormous run that LZW encodes to almost nothing.
   *
   * Without this the card was re-encoded whole eighty times over and came out at 1.6MB, which
   * is what a two second wait and a heavy download bought. The palette is quantised to 63
   * colours rather than 64 so that the transparent index fits below the 64 entry table.
   */
  const colours = quantize(base, 63, {format: "rgb444"});
  const transparentIndex = colours.length;
  const palette = [...colours, [0, 0, 0]];

  let previous: Uint8Array | null = null;

  for (let i = 0; i < frames; i += 1) {
    frame.set(base);
    const progress = i / frames;

    for (const particle of layout.particles) {
      if (particle.frozen) continue;
      const point = toPx(loopPosition(particle, progress, layout.lockedShare, seconds));
      const side = sizePx(particle);
      fill(frame, width, height, strip.x + point.x - side / 2, strip.y + point.y - side / 2, side, side, free);
    }

    // One palette for the whole animation, taken from the card itself. A per-frame palette
    // makes the background shimmer between frames as the quantiser picks slightly different
    // near-blacks, which on a mostly-dark card is the only thing anyone would notice.
    const indexed = applyPalette(frame, colours, "rgb444");

    // What is actually on screen after this frame, kept before the diff blanks anything out.
    const onScreen: Uint8Array = previous ? indexed.slice() : indexed;

    if (previous) {
      for (let p = 0; p < indexed.length; p += 1) {
        if (indexed[p] === previous[p]) indexed[p] = transparentIndex;
      }
    }

    encoder.writeFrame(indexed, width, height, {
      // Only the first frame carries the table. Passing it again writes a local colour table
      // per frame, which is pure overhead when every frame uses the same colours.
      palette: i === 0 ? palette : undefined,
      delay,
      transparent: i > 0,
      transparentIndex,
      // Leave the frame in place, so the next one only has to say what moved.
      dispose: 1,
    });

    previous = onScreen;
  }

  encoder.finish();
  return encoder.bytes();
}
