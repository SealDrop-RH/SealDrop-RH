import {layoutSupplyStrip, positionAt, stripGeometry} from "./layout";

/**
 * The strip, as plain rectangles for satori.
 *
 * Satori runs no JavaScript and has no canvas, so the share image is built from absolutely
 * positioned divs. What matters is that it calls the SAME layoutSupplyStrip and positionAt
 * as the live canvas: the two renderers differ in how they paint and not at all in what
 * they paint, which is the only reason the card and the page show the same lock.
 */

export interface StripRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 to 1, mix from the free colour toward the locked one. */
  k: number;
}

export interface StripNodes {
  free: StripRect[];
  /** The frozen block, as one rectangle when it is solid. */
  block: StripRect | null;
  /** Grid lines over the block, so it still reads as counted units rather than a bar. */
  dividers: StripRect[];
  /** The boundary column, drawn as real units so the seam is textured and not a hard cut. */
  edge: StripRect[];
}

/**
 * A fixed count, chosen against measured render time.
 *
 * Satori emits one div per particle and its cost is linear in them. Measured on this route:
 * 220 renders in 0.57s, 700 in 1.6s, 1400 in 3.0s, 2400 in 5.0s. Crawlers do give up, and
 * the card is cached for a day.
 *
 * This is also the count the animated card draws, which is why it is exported and why it is
 * as low as it is. The two cards are the same card, and the page shows the still one until
 * the GIF has finished encoding and then swaps: a different grain between them would make
 * that swap a visible jolt. The lower count pays for itself twice over, once in the swap and
 * once in a still card that renders in well under a second instead of pushing two.
 *
 * test/strip-geometry.test.ts asserts the block is identical at any count, which is what
 * makes varying it safe: the grain differs between the two renderers, the thing that
 * carries the meaning does not.
 */
export const OG_PARTICLE_COUNT = 240;

/**
 * The count the frozen block's grid is resolved at, independent of the count above.
 *
 * Satori's cost is one div per circulating particle, and the block is not drawn that way:
 * it is one rectangle plus a bounded number of divider lines, which costs the same whether
 * the grid is coarse or fine. Tying its resolution to the cheap particle count made the
 * block on the card visibly chunkier than the same block on the page, so the two are
 * decoupled. This tracks what a desktop canvas derives for itself in StripCanvas, so the
 * grain of the thing that actually carries the meaning matches.
 */
const GRID_REFERENCE_COUNT = 1500;

export function renderStripNodes(
  seed: string,
  lockedShare: number,
  width: number,
  height: number,
): StripNodes {
  const aspect = width / height;
  const layout = layoutSupplyStrip({seed, count: OG_PARTICLE_COUNT, lockedShare, aspect});
  // Same seed and share, higher count, used only for its grid. The block's bounds are
  // identical either way, which strip-geometry.test.ts asserts.
  const fine = layoutSupplyStrip({seed, count: GRID_REFERENCE_COUNT, lockedShare, aspect});
  const {toPx, sizePx} = stripGeometry(width, height);

  const free: StripRect[] = [];
  const edge: StripRect[] = [];

  for (const particle of layout.particles) {
    if (particle.frozen) continue;
    // t = 0 and freeze = 1: the settled state, which is exactly what the canvas shows once
    // its animation has finished.
    const frame = positionAt(particle, 0, 1, layout.lockedShare);
    const point = toPx(frame);
    const side = sizePx(particle);
    free.push({x: point.x - side / 2, y: point.y - side / 2, width: side, height: side, k: 0});
  }

  const {block: bounds} = layout;
  const grid = fine.grid;
  const frozenCount = fine.frozenCount;
  let block: StripRect | null = null;
  const dividers: StripRect[] = [];

  if (frozenCount > 0) {
    const blockWidth = (bounds.x1 - bounds.x0) * width;
    block = {x: bounds.x0 * width, y: 0, width: blockWidth, height, k: 1};

    // Capped at 64 rules per axis. Enough to read the grain without emitting a div per cell,
    // which at this size would be indistinguishable and far slower.
    const columnStep = Math.max(1, Math.ceil(grid.columns / 64));
    for (let column = columnStep; column < grid.columns; column += columnStep) {
      dividers.push({
        x: (bounds.x0 + (column * (bounds.x1 - bounds.x0)) / grid.columns) * width,
        y: 0,
        width: 1,
        height,
        k: 0,
      });
    }
    const rowStep = Math.max(1, Math.ceil(grid.rows / 64));
    for (let row = rowStep; row < grid.rows; row += rowStep) {
      dividers.push({x: bounds.x0 * width, y: (row / grid.rows) * height, width: blockWidth, height: 1, k: 0});
    }

    // The last column is usually partly filled, so it is drawn as individual cells. Painting
    // the block as one rectangle and stopping would square off an edge that is genuinely
    // ragged, and the ragged edge is what says these are counted units.
    const lastColumn = grid.columns - 1;
    const inLastColumn = frozenCount - lastColumn * grid.rows;
    if (inLastColumn > 0 && inLastColumn < grid.rows) {
      block.width = (lastColumn * (bounds.x1 - bounds.x0) * width) / grid.columns;
      const cellW = ((bounds.x1 - bounds.x0) / grid.columns) * width;
      const cellH = height / grid.rows;
      for (let row = 0; row < inLastColumn; row += 1) {
        edge.push({x: block.x + block.width, y: row * cellH, width: cellW * 0.82, height: cellH * 0.82, k: 1});
      }
    }
  }

  return {free, block, dividers, edge};
}
