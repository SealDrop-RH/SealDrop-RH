import {parseColor, type Rgb} from "@/lib/color";

/**
 * The canvas's colours, read from the live custom properties.
 *
 * This is how the drawing code obeys the rule that globals.css owns every colour. The
 * canvas cannot use a class, so it resolves the three purpose-named supply tokens off a
 * real element and parses them once. Switching skin re-resolves them; no drawing code
 * changes, and there is no hex anywhere in it.
 */

export interface StripPalette {
  free: Rgb;
  locked: Rgb;
  field: Rgb;
}

/** Only reached if a property is missing, which means the stylesheet failed to load. */
const FALLBACK: Rgb = {r: 128, g: 128, b: 128, a: 1};

export function readStripPalette(element: Element): StripPalette {
  const style = getComputedStyle(element);
  const read = (name: string): Rgb =>
    parseColor(style.getPropertyValue(name).trim()) ?? FALLBACK;

  return {
    free: read("--supply-free"),
    locked: read("--supply-locked"),
    field: read("--supply-field"),
  };
}

export function rgbString(color: Rgb): string {
  return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;
}
