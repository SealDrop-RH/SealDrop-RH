import {describe, expect, it} from "vitest";
import {SKIN, type Skin} from "@/lib/skins";
import {contrastRatio, deltaE} from "@/lib/color";

/**
 * WCAG AA, measured rather than asserted in a comment.
 *
 * Body text needs 4.5:1. Large text and non-text boundaries need 3:1. This ran against all
 * three candidate palettes while they existed, and held each to the same bar: a palette
 * that could not pass was not a candidate. One survived; the bar did not move.
 */

/** Grounds that body copy is actually placed on. */
const GROUNDS: ReadonlyArray<keyof Skin> = ["bg", "bgElev", "surface", "surface2", "surface3"];

/** Everything that carries meaning through colour, and therefore has to be told apart. */
const MEANING: ReadonlyArray<keyof Skin> = ["accent", "positive", "warn", "negative", "info"];

function report(fg: keyof Skin, bg: keyof Skin): string {
  const ratio = contrastRatio(SKIN[fg] as string, SKIN[bg] as string);
  return `${String(fg)} on ${String(bg)} = ${ratio.toFixed(2)}:1`;
}

describe("palette", () => {
  const skin = SKIN;

  it.each(GROUNDS)("fg reads as body copy on %s", (ground) => {
    expect(contrastRatio(skin.fg, skin[ground] as string), report("fg", ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GROUNDS)("fgMuted reads as body copy on %s", (ground) => {
    expect(
      contrastRatio(skin.fgMuted, skin[ground] as string),
      report("fgMuted", ground),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GROUNDS)("fgSubtle clears the 3:1 large-text floor on %s", (ground) => {
    expect(
      contrastRatio(skin.fgSubtle, skin[ground] as string),
      report("fgSubtle", ground),
    ).toBeGreaterThanOrEqual(3);
  });

  it("accent is legible as text on the page ground", () => {
    expect(contrastRatio(skin.accent, skin.bg), report("accent", "bg")).toBeGreaterThanOrEqual(4.5);
  });

  it("accent is legible as text on a surface", () => {
    expect(contrastRatio(skin.accent, skin.surface), report("accent", "surface")).toBeGreaterThanOrEqual(4.5);
  });

  it("accentFg is legible on the accent, which is the primary button", () => {
    expect(
      contrastRatio(skin.accentFg, skin.accent),
      report("accentFg", "accent"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MEANING)("%s is legible as text on a surface", (token) => {
    expect(
      contrastRatio(skin[token] as string, skin.surface),
      report(token, "surface"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The bug this catches, found by eye and not by the suite: the terminal skin had
   * --positive set to the same green as --accent, so the "active" and "unlockable" state
   * pills rendered identically. Contrast ratio could never have found it, because two
   * identical colours and two equally-bright opposite hues both score 1.0 on it. This
   * needs a perceptual metric.
   *
   * CIE76 deltaE: under 2.3 is imperceptible, 10 is obvious. 20 is a comfortable floor
   * for colours whose whole job is to be told apart at badge size.
   */
  it("status colours are all perceptibly different from each other", () => {
    for (let i = 0; i < MEANING.length; i += 1) {
      for (let j = i + 1; j < MEANING.length; j += 1) {
        const [a, b] = [MEANING[i], MEANING[j]];
        const distance = deltaE(skin[a] as string, skin[b] as string);
        expect(
          distance,
          `${String(a)} vs ${String(b)} deltaE ${distance.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("borderStrong is a visible boundary against every surface", () => {
    for (const ground of GROUNDS) {
      expect(
        contrastRatio(skin.borderStrong, skin[ground] as string),
        report("borderStrong", ground),
      ).toBeGreaterThanOrEqual(1.4);
    }
  });

  /**
   * The strip carries meaning through exactly one distinction: frozen against free.
   *
   * The three floors below are deliberately different, because the three marks do
   * different jobs. The frozen block is the signal and is held to a text-grade 4.5:1
   * against the field. The circulating particles are texture whose job is to say "there
   * is more supply and it moves", so they are held to 1.8:1: pushing them to 3:1 would
   * make them compete with the block for attention, and with an orange accent it was not
   * even satisfiable, since the window between "bright enough to see on the field" and
   * "dark enough to be told apart from the accent" is about 0.005 of luminance wide.
   *
   * locked-against-free at 2.5:1 is the load-bearing one. It has to survive a feed
   * thumbnail and a viewer who cannot use the hue difference, so it may not rely on
   * accent-versus-grey being different colors. It has to be different brightnesses.
   */
  it("locked and free supply are distinguishable from each other and from the field", () => {
    expect(
      contrastRatio(skin.supplyLocked, skin.supplyFree),
      report("supplyLocked", "supplyFree"),
    ).toBeGreaterThanOrEqual(2.5);
    expect(
      contrastRatio(skin.supplyFree, skin.supplyField),
      report("supplyFree", "supplyField"),
    ).toBeGreaterThanOrEqual(1.8);
    expect(
      contrastRatio(skin.supplyLocked, skin.supplyField),
      report("supplyLocked", "supplyField"),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
