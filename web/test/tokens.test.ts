import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {SKIN, type Skin} from "@/lib/skins";

/**
 * lib/skins.ts exists only because satori cannot resolve CSS custom properties. It is a copy
 * of data that already lives in globals.css, and a copy is a thing that drifts. This test is
 * what makes the copy safe: change a hex in one place and the build fails until you change
 * it in the other.
 */

const RAW = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/**
 * Comments are stripped before anything is matched. The comment above the token blocks
 * quotes the exact broken construct this file tests for, so a naive grep finds the
 * warning about the bug and reports the bug.
 */
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

/** Skin field -> the custom property it mirrors. */
const MAPPING: ReadonlyArray<[keyof Skin, string]> = [
  ["bg", "--bg"],
  ["bgElev", "--bg-elev"],
  ["surface", "--surface"],
  ["surface2", "--surface-2"],
  ["surface3", "--surface-3"],
  ["border", "--border"],
  ["borderStrong", "--border-strong"],
  ["fg", "--fg"],
  ["fgMuted", "--fg-muted"],
  ["fgSubtle", "--fg-subtle"],
  ["accent", "--accent"],
  ["accentFg", "--accent-fg"],
  ["positive", "--positive"],
  ["warn", "--warn"],
  ["negative", "--negative"],
  ["info", "--info"],
  ["supplyFree", "--supply-free"],
  ["supplyLocked", "--supply-locked"],
  ["supplyField", "--supply-field"],
];

/** Reads one declaration block by its opening selector, stopping at the first closing brace. */
function block(selector: string): string {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`globals.css has no block for ${selector}`);
  const end = CSS.indexOf("\n}", start);
  return CSS.slice(start, end);
}

function declaration(source: string, property: string): string | null {
  const match = new RegExp(`^\\s*${property}:\\s*([^;]+);`, "m").exec(source);
  return match ? match[1].trim() : null;
}

describe("lib/skins.ts mirrors globals.css", () => {
  const css = block(":root {");

  it.each(MAPPING)("%s matches %s", (field, property) => {
    const fromCss = declaration(css, property);
    // Every token is declared outright now that there is a single palette, so a missing
    // declaration is a mistake rather than an inherited value.
    expect(fromCss, `globals.css is missing ${property}`).not.toBeNull();
    expect(SKIN[field as keyof Skin], `${String(field)} vs ${property}`).toBe(fromCss);
  });
});

describe("token architecture", () => {
  /**
   * Tailwind v4 emits a theme variable even under `inline`, so mapping --radius-* through
   * @theme compiles to `--radius-sm: var(--radius-sm)`. That cycle is live in pons-board's
   * shipped CSS right now and only survives because the authored block is unlayered.
   * scripts/check-tokens.mjs catches it in the built output; this catches it in the source.
   */
  it("keeps --radius-* and --ease-* out of @theme", () => {
    const themeBlocks = CSS.match(/@theme[^{]*\{[^}]*\}/g) ?? [];
    expect(themeBlocks.length).toBeGreaterThan(0);
    for (const themeBlock of themeBlocks) {
      expect(themeBlock).not.toMatch(/--radius-/);
      expect(themeBlock).not.toMatch(/--ease-/);
    }
  });

  it("deletes the stock Tailwind palette so a hardcoded color compiles to nothing", () => {
    expect(CSS).toMatch(/--color-\*:\s*initial;/);
  });
});
