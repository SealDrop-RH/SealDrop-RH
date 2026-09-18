#!/usr/bin/env python3
"""
Draw the SealDrop mark, and cut every brand asset out of it.

This is an offline one-shot, not part of `pnpm verify` and not part of the build. It exists so
the whole set can be regenerated rather than re-traced by hand the next time a size, a ground
or a palette changes:

    python3 scripts/brand.py            # requires pillow, numpy, scipy

There is no source PNG. The mark is geometry -- a scalloped disc, a teardrop counter punched
out of it, and six squares leaving -- so every asset is drawn from the equations below at its
own final size, and none of them is a resample of a bigger sibling. An earlier version of this
file lifted the artwork off a hand-drawn a hand-drawn source PNG by flood fill, which meant the
mark could only ever be recoloured, never re-proportioned.

## The mark

A wax seal with a drop pressed into it, and six squares coming off its edge. The seal is the
supply held still; the drop is what is held; the squares are the airdrop leaving. The counter
is a drop rather than a monogram so the mark reads as its own name before the wordmark beside
it is read at all.

## The two geometries, and which goes where

`trail=True` is the mark entire, and it is wide -- about 1.4 to 1. `trail=False` is the seal
alone, and it is square.

The split is by the shape of the hole the asset goes in, not by taste. An icon is square, and
fitting a 1.4:1 mark into a square means scaling it until it fits the width, which leaves the
seal small, off the axis and pushed left by a trail that is by then six specks. So every
square asset is the seal, which fills a square because it is one. The trail ships on
`sealdrop-mark.png`, the transparent mark, which is the one used where there is width for it.

The same split happens to be the right one by size: below roughly 48px the six squares stop
being six squares and average into two or three grey pixels off the right shoulder.
"""

import math
import re
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"
APP = ROOT / "app"


def palette():
    """
    The skin, read out of lib/skins.ts rather than copied next to it.

    scripts/ is outside the check-tokens scan, so a hex literal here would compile and ship
    and never be told it had drifted from globals.css. Parsing the one file that is held
    equal to globals.css by test/tokens.test.ts means this cannot happen.
    """
    text = (ROOT / "lib" / "skins.ts").read_text()
    body = text.split("export const SKIN: Skin = {", 1)[1]
    out = {}
    for key, hexval in re.findall(r"(\w+):\s*\"#([0-9a-fA-F]{6})\"", body):
        out[key] = tuple(int(hexval[i:i + 2], 16) for i in (0, 2, 4))
    for need in ("bg", "fg", "fgMuted", "accent"):
        if need not in out:
            raise SystemExit(f"lib/skins.ts has no usable {need}")
    return out


# --- geometry, in units where the seal has radius 1 ----------------------------------------

M = 1.5           # teardrop fullness: lower is wider
LOBES = 14        # scallops around the seal
AMP = 0.048       # scallop depth, as a fraction of the seal's radius
DROP_H = 1.16     # the counter's height, as a fraction of the seal's radius
DROP_Y = -0.02    # and how far it sits off centre
BLUNT = 0.030     # how much is taken off the counter's cusp
SS = 4            # supersample factor the geometry is rasterised at

# The six squares leaving the seal. They step out and up, shrinking as they go and spacing
# wider, so the trail reads as something dispersing rather than as a dotted line. Size falls
# with distance from the seal, without exception: one square bigger than the one inside it
# turns the whole group back into scatter.
#
# The rim itself is left whole. An earlier pass bit a square out of it, to say the squares had
# come from there. It drew the eye and said the wrong thing -- a broken seal is a tampered
# one, on a product whose entire claim is that nobody can move what it holds.
SQUARES = [
    (1.26, 0.22, 0.300),
    (1.40, -0.38, 0.235),
    (1.70, 0.48, 0.215),
    (1.76, -0.06, 0.185),
    (2.05, 0.24, 0.145),
    (2.02, -0.30, 0.115),
]


def teardrop(steps=2400):
    """
    The classic teardrop curve, turned to stand on its round end.

    x = sin(t)·sin(t/2)^m, y = cos(t). One closed curve with no joins to get wrong: the round
    body and the two flanks are the same equation, so the flanks flow into the body instead of
    meeting it at a tangent point that has to be computed and can look welded. `m` sets how
    full it is -- 1.5 lands at about 1.4 tall to 1 wide, which is a drop rather than a spike.

    Returned normalised to a half-width of 1.
    """
    pts = [(math.sin(t) * math.sin(t / 2) ** M, math.cos(t))
           for t in (2 * math.pi * i / steps for i in range(steps))]
    half = max(abs(x) for x, _ in pts)
    return [(x / half, y / half) for x, y in pts]


TEAR_ASPECT = max(abs(y) for _, y in teardrop())   # half-height, now that half-width is 1


def seal(steps=2400):
    """
    The seal: a disc whose radius rides a cosine, which is the serration pressed into wax.

    A whole number of lobes around a full turn, so the ring closes on itself with no seam.
    This is the outline everything else is cut from, and it is why the silhouette says
    "stamped" before anything inside it has been read.
    """
    return [(r * math.cos(a), r * math.sin(a))
            for a, r in ((a, 1 - AMP * math.cos(LOBES * a))
                         for a in (2 * math.pi * i / steps for i in range(steps)))]


def mask(px, trail=True):
    """
    The mark as a coverage map, 0..1, cropped tight to the ink.

    Drawn at `SS`x and averaged down rather than antialiased by the polygon filler, because the
    scallops and the counter's cusp are exactly the features a one-sample-per-pixel rasteriser
    ragged. `px` is the longest side of the result.
    """
    rim = seal()
    sq = SQUARES if trail else []
    xs = [p[0] for p in rim] + [c + s / 2 for c, _, s in sq] + [c - s / 2 for c, _, s in sq]
    ys = [p[1] for p in rim] + [c + s / 2 for _, c, s in sq] + [c - s / 2 for _, c, s in sq]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)

    ppu = px * SS / max(x1 - x0, y1 - y0)
    w, h = max(1, round((x1 - x0) * ppu)), max(1, round((y1 - y0) * ppu))

    def P(x, y):
        return ((x - x0) * ppu, (y1 - y) * ppu)      # units are y-up, images are y-down

    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    d.polygon([P(x, y) for x, y in rim], fill=255)

    hw = DROP_H / 2 / TEAR_ASPECT
    d.polygon([P(x * hw, y * hw + DROP_Y) for x, y in teardrop()], fill=0)

    for cx, cy, s in sq:
        a, b = P(cx - s / 2, cy + s / 2)
        c, e = P(cx + s / 2, cy - s / 2)
        d.rounded_rectangle([a, b, c, e], radius=s * ppu * 0.26, fill=255)

    # A touch off the cusp. The teardrop curve meets its point tangentially, so the counter's
    # apex is a true cusp -- correct for a drop, and at 16px a single grey pixel that reads as
    # a frayed end. A morphological closing rounds that one sharp corner and moves nothing
    # else, because it only ever acts where the shape is sharper than the structuring element.
    k = max(1, round(BLUNT * ppu))
    b = np.asarray(im) > 127
    b = ndimage.binary_erosion(ndimage.binary_dilation(b, iterations=k), iterations=k)
    im = Image.fromarray((b * 255).astype(np.uint8), "L")

    out = im.resize((max(1, w // SS), max(1, h // SS)), Image.LANCZOS)
    return np.asarray(out).astype(np.float64) / 255.0


def place(cov, scale):
    """
    Centre a tight coverage map in a square, at `scale` of the square's edge.

    Box-centred rather than centroid-centred. The squares trailing off to the right carry
    little visual weight but a centroid would treat them as carrying none, and pull the seal
    left of the axis to compensate.
    """
    h, w = cov.shape
    side = max(round(max(w, h) / scale), max(w, h))
    out = np.zeros((side, side), np.float64)
    y, x = (side - h) // 2, (side - w) // 2
    out[y:y + h, x:x + w] = cov
    return out


# --- shading -------------------------------------------------------------------------------

LIGHT = np.array([-0.52, -0.60, 0.61])   # one key light, upper left, slightly in front


def shade(cov, skin, bevel):
    """
    Light the flat coverage map into the rendered treatment.

    The mark is treated as a slab with a rounded bevel: the distance transform gives how far
    inside the edge each pixel is, a quarter-circle profile turns that into a height, and the
    gradient of that height is the surface normal. Everything after is one directional light --
    diffuse for the body, a tight specular for the gloss, and a grazing term for the lit rim
    that makes an edge read as a turned curve rather than as a cut-out.

    `bevel` is in pixels and is passed in rather than measured off `cov`, because `cov` is by
    then a mark sitting in a margin: taken from the canvas, the bevel would swell and shrink
    with the padding and the 192 tile would be lit differently from the 512.
    """
    dist = ndimage.distance_transform_edt(cov > 0.5)
    t = np.clip(dist / bevel, 0, 1)
    height = np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))

    gy, gx = np.gradient(ndimage.gaussian_filter(height, bevel * 0.2))
    relief = bevel * 0.85
    nx, ny, nz = -gx * relief, -gy * relief, np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / n, ny / n, nz / n

    L = LIGHT / np.linalg.norm(LIGHT)
    Hv = L + np.array([0.0, 0.0, 1.0])
    Hv /= np.linalg.norm(Hv)

    diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    spec = np.clip(nx * Hv[0] + ny * Hv[1] + nz * Hv[2], 0, 1)
    graze = 1.0 - height

    acc = np.array(skin["accent"], dtype=np.float64)
    body = np.array(skin["bg"], dtype=np.float64)

    col = np.repeat(body[None, None, :], cov.shape[0], 0).repeat(cov.shape[1], 1)
    col = col * (0.40 + 0.60 * diff[..., None]) + 8.0 * diff[..., None]
    col += (acc * 1.30)[None, None, :] * (graze ** 2.4)[..., None] * 0.80   # lit rim
    col += 255.0 * (spec ** 48)[..., None] * 0.92                            # gloss
    col += 255.0 * (spec ** 9)[..., None] * 0.09                             # sheen
    return np.clip(col, 0, 255)


def ground(side, skin):
    """The tile's ground: the accent, lifted through the middle so the tile has a centre."""
    yy, xx = np.mgrid[0:side, 0:side]
    r = np.hypot((xx - side / 2) / (side / 2), (yy - side / 2) / (side / 2))
    k = np.clip(1.0 - r / 1.35, 0, 1) ** 1.6
    acc = np.array(skin["accent"], dtype=np.float64)
    return np.clip(acc[None, None, :] * (0.88 + 0.28 * k[..., None]), 0, 255)


def rendered(px, skin, scale, trail=True, on_ground=True):
    """The lit mark, squared, over the accent ground or over nothing."""
    tight = mask(round(px * scale), trail)
    cov = place(tight, scale)
    side = cov.shape[0]
    lit = shade(cov, skin, max(2.0, max(tight.shape) * 0.030))

    if not on_ground:
        rgba = np.dstack([lit, cov * 255.0]).round().astype(np.uint8)
        return Image.fromarray(rgba, "RGBA").resize((px, px), Image.LANCZOS)

    # The rim glow belongs to the ground, not to the mark: a bloom of the accent pushed out
    # from behind the silhouette, which is what seats the mark on the tile instead of letting
    # it sit on top of it like a sticker.
    g = ground(side, skin)
    glow = ndimage.gaussian_filter(cov, max(tight.shape) * 0.016)
    g = np.clip(g + (np.array(skin["accent"]) * 1.5)[None, None, :]
                * (glow * (1 - cov))[..., None] * 0.42, 0, 255)
    out = g * (1 - cov[..., None]) + lit * cov[..., None]
    return Image.fromarray(out.round().astype(np.uint8), "RGB").resize((px, px), Image.LANCZOS)


def flat(px, rgb, scale, trail=False, bg=None):
    """
    The mark as one ink, on one ground or on none.

    This is the treatment that survives being small. The rendered mark is lit: every edge is a
    gradient from a bright rim into a dark body, and downscaling averages those gradients with
    the ground until the scallops round off and the counter fills in. Flattened, the same
    silhouette holds its drop at 16px.
    """
    cov = place(mask(round(px * scale), trail), scale)
    a = np.zeros((*cov.shape, 4), np.uint8)
    a[..., 0], a[..., 1], a[..., 2] = rgb
    a[..., 3] = (cov * 255).round().astype(np.uint8)
    im = Image.fromarray(a, "RGBA")
    if bg is not None:
        out = Image.new("RGBA", im.size, (*bg, 255))
        out.alpha_composite(im)
        im = out
    return im.resize((px, px), Image.LANCZOS)


# --- the site's own share card --------------------------------------------------------------

CARD = (1200, 630)
HEADLINE = ["Lock supply.", "Publish the proof."]
SUBLINE = ("Locked tokens can only be withdrawn by the wallet that locked them, "
           "and only after the date it chose.")
ALT = "SealDrop. Lock supply, publish the proof.\n"


def rounded(img, radius):
    mask_ = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask_).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                            radius=radius, fill=255)
    out = img.convert("RGBA").copy()
    out.putalpha(mask_)
    return out


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def social_card(skin):
    """
    The card the link turns into when the site itself is shared.

    Every other share image in this app is rendered per record by satori at request time, off
    lib/og. This one is the site, which never changes, so it is baked once here instead of
    standing up a route to redraw a constant. It reads the same palette and sets the same
    Geist that lib/og/fonts.ts hands satori, so the two look like one family.
    """
    fonts = ROOT / "public" / "fonts"
    mono_f = ImageFont.truetype(str(fonts / "GeistMono-Medium.ttf"), 24)
    head_f = ImageFont.truetype(str(fonts / "Geist-SemiBold.ttf"), 64)
    sub_f = ImageFont.truetype(str(fonts / "Geist-Regular.ttf"), 25)

    card = Image.new("RGB", CARD, skin["bg"])
    d = ImageDraw.Draw(card)

    size, margin = 300, 76
    tile_x = CARD[0] - margin - size
    art = rounded(rendered(size, skin, 0.72, trail=False), 64)
    card.paste(art, (tile_x, (CARD[1] - size) // 2), art)

    col = tile_x - margin - 56
    sub_lines = wrap(d, SUBLINE, sub_f, col)
    block = 30 + 26 + len(HEADLINE) * 76 + 26 + len(sub_lines) * 36
    y = (CARD[1] - block) // 2

    d.text((margin, y), "SEALDROP", font=mono_f, fill=skin["fgMuted"])
    y += 30 + 26
    for line in HEADLINE:
        d.text((margin, y), line, font=head_f, fill=skin["fg"])
        y += 76
    y += 26
    for line in sub_lines:
        d.text((margin, y), line, font=sub_f, fill=skin["fgMuted"])
        y += 36

    # A hairline of accent along the bottom edge: the one place on this card the accent is
    # spent, and the same gesture the footer and the nav rail already make.
    d.rectangle([0, CARD[1] - 6, CARD[0], CARD[1]], fill=skin["accent"])
    return card


def save(img, path):
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {path.stat().st_size // 1024}kb")


def main():
    skin = palette()
    print("skin:", {k: v for k, v in skin.items() if k in ("bg", "fg", "fgMuted", "accent")})
    print(f"geometry: {LOBES} lobes, counter {DROP_H} of the radius, {len(SQUARES)} squares")

    # 0.92: a transparent mark is dropped into a layout that sets its own padding, so it
    # carries almost none of its own.
    save(rendered(1024, skin, 0.92, on_ground=False), BRAND / "sealdrop-mark.png")
    # The flat marks are the chrome's, and the chrome sets them at around 22px.
    save(flat(1024, skin["fg"], 0.92), BRAND / "sealdrop-mark-light.png")
    save(flat(1024, skin["accent"], 0.92), BRAND / "sealdrop-mark-accent.png")

    # 0.72: an icon is looked at inside a rounded mask it does not control, so it keeps a
    # margin wide enough that a platform clipping the corners never reaches the artwork.
    for px in (1024, 512, 192, 64):
        name = "sealdrop-tile.png" if px == 1024 else f"sealdrop-tile-{px}.png"
        save(rendered(px, skin, 0.72, trail=False), BRAND / name)

    # 0.86: the flat mark is the one that runs small. At 16px a 28% margin is four blank
    # pixels a side, and what is left in the middle is not a seal.
    save(flat(512, skin["bg"], 0.86, bg=skin["accent"]), BRAND / "sealdrop-tile-flat.png")

    # Both browser-facing icons are the flat mark, and this is the whole reason it exists.
    # Next emits the .ico as sizes="16x16" and icon.png as sizes="512x512", so a browser
    # asking for a 32px tab on a 2x display has no exact match and takes the 512. If that file
    # were the rendered tile, the crisp .ico would be quietly skipped and the tab would show
    # the soft version anyway. Flat at both ends, either choice is the right one.
    save(flat(512, skin["bg"], 0.86, bg=skin["accent"]), APP / "icon.png")

    # apple-icon is not chosen against anything: iOS asks for this file by name at this size,
    # where the rendered mark has room to be what it is.
    save(rendered(180, skin, 0.72, trail=False), APP / "apple-icon.png")

    card = social_card(skin)
    for name in ("opengraph-image", "twitter-image"):
        card.save(APP / f"{name}.png", optimize=True)
        (APP / f"{name}.alt.txt").write_text(ALT)
        print(f"  app/{name}.png  1200x630  {(APP / (name + '.png')).stat().st_size // 1024}kb")

    # Every size is rasterised from the geometry at that size rather than resampled off one
    # big sibling: a 16px favicon built by downscaling a 512 is two resamples deep and the
    # second pass has nothing left to work with.
    ico = APP / "favicon.ico"
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    flat(64, skin["bg"], 0.86, bg=skin["accent"]).save(
        ico, format="ICO", sizes=sizes,
        append_images=[flat(s, skin["bg"], 0.86, bg=skin["accent"]) for s, _ in sizes])
    print(f"  {ico.relative_to(ROOT)}  16/32/48/64  {ico.stat().st_size // 1024}kb")


if __name__ == "__main__":
    main()
