import {seeded, range} from "./rng";
import {EASE_OUT, clamp01, fract, lerp} from "./easing";

/**
 * The supply strip.
 *
 * The field is a token's TOTAL supply. One particle is totalSupply / count tokens. The
 * particles that stop moving are the locked amount; the ones still drifting are what
 * circulates. That distinction is the entire product, so the arithmetic is the design.
 *
 * Everything here is pure and has no DOM. The live canvas calls it about sixty times a
 * second; satori calls it once, on a server, to draw the share image. There is exactly one
 * positionAt, which is what makes those two pictures the same picture rather than two
 * things that merely resemble each other.
 */

export interface StripInput {
  /** Lock id. Hashed to seed the generator, so a lock draws the same field forever. */
  seed: string;
  /** Canvas: derived from the device. Share image: a fixed 220. Changes grain, never shape. */
  count: number;
  /** locked / totalSupply, clamped to [0, 1]. */
  lockedShare: number;
  /** Field width divided by height, so jitter reads the same at 320px and at 1440px. */
  aspect: number;
}

export interface Particle {
  /** Drift origin in unit space, [0, 1]. */
  x: number;
  y: number;
  /** Frozen slot centre in unit space. NaN for particles that keep circulating. */
  fx: number;
  fy: number;
  /** Half-extent, as a fraction of field height. */
  size: number;
  /** Seeds the vertical bob, so neighbours do not rise and fall together. */
  phase: number;
  /** Unit-x per second. */
  speed: number;
  /** Fraction of the freeze this particle waits before it starts moving, [0, 0.22]. */
  delay: number;
  frozen: boolean;
}

export interface StripLayout {
  particles: readonly Particle[];
  frozenCount: number;
  lockedShare: number;
  /** Frozen block bounds in unit space. The overlay, the seal and the tooltip use these. */
  block: {x0: number; y0: number; x1: number; y1: number};
  /** The frozen grid, so the share image can draw the same cells without re-deriving them. */
  grid: {rows: number; columns: number; cellWidth: number; cellHeight: number};
}

/** Fraction of a cell's pitch left as a gap, so the block reads as countable units. */
const GAP_RATIO = 0.18;
/** Vertical travel of the idle bob, in units of field height. */
const BOB = 0.02;
const BOB_HZ = 0.07;
/** Longest a particle waits before joining the freeze. Drives the left-to-right sweep. */
const MAX_DELAY = 0.22;

/**
 * Rows are chosen so frozen cells come out close to square once rendered.
 *
 * The block is lockedShare wide and the full height in unit space, so in pixels its aspect
 * is lockedShare * aspect. Solving rows * columns = frozenCount against that ratio gives
 * square cells at any width and any share.
 */
function gridRows(frozenCount: number, lockedShare: number, aspect: number): number {
  if (frozenCount <= 0) return 1;
  const blockAspect = Math.max(0.02, lockedShare * aspect);
  const rows = Math.sqrt(frozenCount / blockAspect);
  return Math.max(3, Math.min(22, Math.round(rows) || 1));
}

export function layoutSupplyStrip(input: StripInput): StripLayout {
  const lockedShare = clamp01(input.lockedShare);
  const count = Math.max(1, Math.floor(input.count));
  const random = seeded(input.seed);

  const frozenCount = Math.round(count * lockedShare);
  const rows = gridRows(frozenCount, lockedShare, input.aspect);
  const columns = frozenCount > 0 ? Math.ceil(frozenCount / rows) : 0;

  // Pitch is derived from the block width, so columns * pitch is exactly lockedShare and
  // the block's right edge lands on the share rather than near it.
  const pitchX = columns > 0 ? lockedShare / columns : 0;
  const pitchY = 1 / rows;
  const cellWidth = pitchX * (1 - GAP_RATIO);
  const cellHeight = pitchY * (1 - GAP_RATIO);

  const particles: Particle[] = [];

  for (let i = 0; i < count; i += 1) {
    const frozen = i < frozenCount;

    // Column-major, so the block fills left to right and grows the way a supply bar reads.
    const column = frozen ? Math.floor(i / rows) : 0;
    const row = frozen ? i % rows : 0;

    const fx = frozen ? (column + 0.5) * pitchX : Number.NaN;
    const fy = frozen ? (row + 0.5) * pitchY : Number.NaN;

    // A frozen particle is drawn at cell size so the block is solid; a circulating one keeps
    // its own size so the field has grain.
    const size = frozen ? cellHeight / 2 : range(random, 0.018, 0.034);

    particles.push({
      x: random(),
      y: range(random, 0.06, 0.94),
      fx,
      fy,
      size,
      phase: random(),
      // One crossing takes between fourteen and fifty seconds. Slow enough to read as drift
      // rather than as traffic.
      speed: range(random, 0.02, 0.07),
      // Keyed off the slot's own position, so the sweep runs left to right, plus a little
      // jitter so the leading edge is ragged instead of a moving wall.
      delay: frozen
        ? clamp01((MAX_DELAY * column) / Math.max(1, columns) + range(random, -0.03, 0.03))
        : 0,
      frozen,
    });
  }

  return {
    particles,
    frozenCount,
    lockedShare,
    block: {x0: 0, y0: 0, x1: lockedShare, y1: 1},
    grid: {rows, columns, cellWidth, cellHeight},
  };
}

export interface ParticleFrame {
  x: number;
  y: number;
  /** 0 to 1, how far this particle has taken on the locked colour. */
  k: number;
}

/**
 * Where a particle is, and what colour it is, at a given time and freeze amount.
 *
 * The single source of truth for the picture. The canvas calls it every frame; satori calls
 * it once with (t = 0, freeze = 1). All of the shaping lives in here rather than in the
 * animation outside, which is what lets any freeze value produce exactly one frame: the
 * value can be scrubbed, replayed, or rendered on a server and the result is the same.
 *
 * At freeze = 1 a frozen particle is exactly at its slot for every t. That is the property
 * that makes the share image and the live canvas agree.
 */
export function positionAt(
  particle: Particle,
  tSeconds: number,
  freeze: number,
  lockedShare: number,
): ParticleFrame {
  const bob = BOB * Math.sin(2 * Math.PI * (particle.phase + tSeconds * BOB_HZ));

  if (!particle.frozen) {
    // Circulating supply occupies whatever the lock has not taken. As the freeze runs, the
    // free region narrows to the right of the block, so the field visibly makes room for it
    // rather than the block being painted on top of particles that carry on underneath.
    const start = freeze * lockedShare;
    const width = 1 - start;
    const u = fract(particle.x + particle.speed * tSeconds);
    return {x: start + u * width, y: clamp01(particle.y + bob), k: 0};
  }

  // Each particle runs its own span of the freeze, offset by its delay. Eased here rather
  // than outside, so the outer animation stays linear and every freeze value is one frame.
  const local = clamp01((freeze - particle.delay) / Math.max(0.001, 1 - particle.delay));
  const eased = EASE_OUT(local);

  const driftX = fract(particle.x + particle.speed * tSeconds);
  const driftY = clamp01(particle.y + bob);

  return {
    x: lerp(driftX, particle.fx, eased),
    y: lerp(driftY, particle.fy, eased),
    // Colour starts a quarter of the way into the move and takes 45% of it. Linear on
    // purpose: a colour crossfade on a bezier reads as a flicker rather than a change.
    k: clamp01((local - 0.25) / 0.45),
  };
}

/** Unit space to device pixels. Used identically by the canvas and by the share image. */
export function stripGeometry(pxWidth: number, pxHeight: number) {
  return {
    toPx(point: {x: number; y: number}) {
      return {x: point.x * pxWidth, y: point.y * pxHeight};
    },
    /** Full side length in pixels, since size is a half-extent of field height. */
    sizePx(particle: Particle) {
      return Math.max(1, particle.size * 2 * pxHeight);
    },
  };
}
