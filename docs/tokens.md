# Tokens

The palette is **cleared emerald**: a slate ground leaning teal, cool hairlines, one emerald
accent, `4 / 8 / 14 / 20` radii, Geist and Geist Mono.

It replaced **vault steel** (graphite + orange), which had itself beaten a phosphor-green
terminal palette and the warmer pons house style. The replacement was chosen the same way:
a green, a blue and a gold palette were previewed on the real landing page at `/v1` `/v2`
`/v3`, and the green won. The other two are gone. The architecture that made previewing
them cheap is unchanged, so adding a light mode
later is one `:root[data-theme="light"]` block overriding the values in `globals.css`.
Nothing reads a colour any other way.

## The rule

`web/app/globals.css` is the only file allowed to contain a color literal.

One exception exists: `web/lib/skins.ts`. Satori, which renders the OG share card, does not
resolve CSS custom properties, so the card has to be handed real hex. `test/tokens.test.ts`
parses `globals.css` and fails the build if the two ever disagree, so the copy cannot drift.

Four layers enforce this:

1. `@theme { --color-*: initial }` deletes Tailwind's stock palette. `bg-red-500` compiles
   to nothing at all, so a hardcoded color is visible rather than merely wrong.
2. ESLint bans hex, `rgb()`, `hsl()`, arbitrary color utilities, and stock palette classes
   across `app/`, `components/` and `lib/`.
3. `scripts/check-tokens.mjs` covers what ESLint cannot parse: `.css` files and inline SVG.
4. `test/contrast.test.ts` measures every pair.

## Two findings from building it

**Status colors have to be perceptually distinct from the accent, not just from the
ground.** The terminal palette originally set `--positive` to its own accent green, which
made the "active" and "unlockable" state pills identical. Contrast ratio cannot catch this:
two identical colors and two equally bright opposite hues both score 1.0.
`test/contrast.test.ts` now measures CIE76 deltaE between every pair of meaning colors, with
a floor of 20. The guard outlived the palette that prompted it, and earned its keep again:
with an emerald accent, `--positive` had to move to a pale yellow-leaning green on the other
side of pure green before the pair cleared it.

**`--supply-free` is texture, not text, and is not `--fg-subtle`.** Holding the circulating
particles to a 3:1 text-grade ratio against the field was not satisfiable with the old orange
accent: the window between "bright enough to see on the field" and "dark enough to be told
apart from the accent" is about 0.005 of luminance wide. The frozen block is the signal and
is held to 4.5:1. The circulating field is held to 1.8:1 so it stays recessive. Locked
against free is held to 2.5:1 and has to be a brightness difference, not only a hue one, so
it survives a feed thumbnail and a viewer who cannot use the hue.
