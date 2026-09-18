/**
 * The palette, as TypeScript.
 *
 * This is the ONE file outside app/globals.css allowed to contain a color literal, and it
 * exists for exactly one reason: satori (next/og) does not resolve CSS custom properties,
 * so the share card has to be handed real hex. It is also what test/contrast.test.ts
 * measures, which is how "WCAG AA" becomes something a build can fail on.
 *
 * test/tokens.test.ts parses globals.css and asserts every value below matches it exactly,
 * so the two can never drift.
 */

export interface Skin {
  /** Shown nowhere; kept so the palette can be talked about by name. */
  label: string;
  bg: string;
  bgElev: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  accent: string;
  accentFg: string;
  positive: string;
  warn: string;
  negative: string;
  info: string;
  supplyFree: string;
  supplyLocked: string;
  supplyField: string;
}

/**
 * "Cleared emerald". A slate ground leaning teal, cool hairlines, one emerald accent.
 *
 * Picked after a green, a blue and a gold palette were previewed on the real landing page. It
 * replaced "vault steel" (graphite + orange); the other two candidates are gone.
 */
export const SKIN: Skin = {
  label: "Cleared emerald",
  bg: "#090d0d",
  bgElev: "#0e1212",
  surface: "#131717",
  surface2: "#191e1d",
  surface3: "#222828",
  border: "rgba(190, 216, 214, 0.1)",
  borderStrong: "rgba(190, 216, 214, 0.22)",
  fg: "#ebefee",
  fgMuted: "#9ea6a6",
  fgSubtle: "#6e7676",
  accent: "#00c275",
  accentFg: "#02140c",
  positive: "#b4e36b",
  warn: "#f5b02e",
  negative: "#ff6f61",
  info: "#74a8ff",
  supplyFree: "#4c4b4f",
  supplyLocked: "#00c275",
  supplyField: "#0e1212",
};
