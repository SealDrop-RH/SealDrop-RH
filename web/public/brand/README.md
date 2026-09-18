# SealDrop brand assets

Everything here is drawn by `../../scripts/brand.py`. Nothing in this folder is drawn by hand,
so a new size or a new ground is a change to that script and a rerun, never an edit to a PNG:

```bash
python3 scripts/brand.py     # needs pillow, numpy, scipy. Not part of pnpm verify.
```

The script also writes `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`,
`app/opengraph-image.png` and `app/twitter-image.png`, which Next picks up by file convention.

There is no source image. The mark is geometry — a scalloped disc, a teardrop counter punched
out of it, six squares leaving — so every file below is rasterised from the equations at its
own final size rather than resampled down from a bigger sibling. The previous mark was traced
off a hand-drawn PNG and lifted out of its background by flood fill, which meant it could be
recoloured but never re-proportioned.

**Rerun after any change to the palette.** Every file here bakes `--fg`, `--accent` or `--bg`
into pixels. The script reads all three out of `lib/skins.ts`, which `test/tokens.test.ts`
holds equal to `globals.css`, so they cannot be wrong at the moment it runs. It has no way to
notice later.

## The mark

A wax seal with a drop pressed into it, and six squares coming off its edge. The seal is the
supply held still, the drop is what is being held, and the squares are the airdrop leaving.
The counter is a drop rather than a monogram so the mark reads as its own name before the
wordmark beside it has been read at all.

The rim is unbroken. An earlier pass bit a square out of it to show where the trail had come
from; it drew the eye and said the wrong thing, because a broken seal is a tampered one and
this mark sits on a product whose whole claim is that nobody can move what it holds.

## The two geometries, and which goes where

**Full** is the mark entire, and it is wide — about 1.4 to 1. **Compact** is the seal alone,
and it is square.

The split is by the shape of the hole the asset goes in. An icon is square, and fitting a
1.4:1 mark into a square means scaling it until the width fits, which leaves the seal small,
off the axis, and pushed left to make room for a trail that is by then six specks. So every
square asset is the seal, which fills a square because it is one.

The same split is the right one by size: below roughly 48px the six squares stop being six
squares and average into two or three grey pixels off the right shoulder.

## The two treatments, and which goes where

**Rendered** is the mark lit: a rounded bevel, one key light from the upper left, a tight
specular for the gloss and a grazing term for the bright rim, over a radial accent ground with
the silhouette's own bloom pushed out behind it. It holds up at 48px and above. Below that the
lighting is the problem — every edge is a gradient from a bright rim into a dark body, and
downscaling averages those gradients against the ground until the scallops round off and the
drop fills in.

**Flat** is the same silhouette in one ink. It survives 16px with the drop still open. It is
not a redesign: same outline, nothing dropped.

| File | Geometry | Treatment | Used by |
|---|---|---|---|
| `sealdrop-tile.png` | Compact | Rendered, 1024 | Master export |
| `sealdrop-tile-512.png`, `-192` | Compact | Rendered | `app/manifest.ts`, for a home screen |
| `sealdrop-tile-64.png` | Compact | Rendered | Inlined into every share card by `lib/og/Brand.tsx`, set at 30px |
| `sealdrop-tile-flat.png` | Compact | Flat `--bg` on `--accent`, 512 | Master for `app/icon.png` and `app/favicon.ico` |
| `sealdrop-mark.png` | **Full** | Rendered, transparent | Anywhere you bring your own ground and have the width |
| `sealdrop-mark-light.png` | Compact | Flat `--fg`, transparent | `components/brand/Logo.tsx`, the app's chrome |
| `sealdrop-mark-accent.png` | Compact | Flat `--accent`, transparent | Reserve. Nothing ships it today |

## Why the chrome is not green

`components/brand/Logo.tsx` uses the flat `--fg` mark, not the tile. This skin spends its one
saturated accent on whatever you are currently looking at: the active row on the nav rail, the
locked share of a supply strip. A permanently green badge at the top of every page would
outrank all of them.

The tile is still the product's face everywhere the product is an icon rather than a page: the
tab, the home screen, the share card.

## Why `app/icon.png` is flat

Next emits the `.ico` as `sizes="16x16"` and `icon.png` as `sizes="512x512"`. A browser asking
for a 32px tab on a 2x display has no exact match and takes the 512. If that file were the
rendered tile, the crisp `.ico` would be quietly skipped and the tab would show the soft
version anyway. Flat at both ends, either choice is the right one.

`app/apple-icon.png` is rendered, because iOS asks for that file by name at that size and is
not choosing between candidates.

Each frame inside the `.ico` is drawn at its own size rather than resampled off the 512, so
the 16px frame is one pass from the geometry instead of two passes from an image that had
already lost the scallops.

## Maskable icons

Not declared, on purpose. A maskable icon is cropped to a circle 80% of the icon's width, and
the seal sits in a box 72% wide, so the outer scallops would clip. Shipping an untested
`purpose: "maskable"` costs a bitten-off logo on Android and gains nothing. A real maskable
variant needs its own export with a wider margin.
