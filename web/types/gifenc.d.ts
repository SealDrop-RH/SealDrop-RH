/**
 * Types for gifenc, which ships none.
 *
 * Only the four entry points lib/og/gif.ts actually uses are declared. A wider guess at the
 * library's surface would be a guess: this is the part the build depends on, and anything
 * else should be added here when it is first needed rather than invented now.
 */
declare module "gifenc" {
  export interface WriteFrameOptions {
    palette?: number[][];
    /** Hundredths of a second are what the format stores; gifenc takes milliseconds. */
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: {auto?: boolean; initialCapacity?: number}): Encoder;

  export type PaletteFormat = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {format?: PaletteFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean},
  ): number[][];

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: PaletteFormat,
  ): Uint8Array;
}
