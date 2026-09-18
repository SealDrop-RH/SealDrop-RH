#!/usr/bin/env python3
"""
Redraws the header on `.github/media/banner.gif`, the animation the README opens with.

    python3 scripts/banner.py            # requires pillow, numpy, scipy

The banner is two things stacked. The top ~130px is brand -- the tile, the wordmark, the one
line of copy, a hairline rule. Everything below is the supply strip, animating: the locked
block holding still while the circulating rest drifts, 80 frames of it.

Only the top is rewritten here. The strip frames are carried through untouched, because they
are not brand artwork -- they are the product's own geometry, drawn by lib/strip/draw.ts at
the real locked share with one tick standing for a real quantity of tokens, which is the claim
the README makes about this image three paragraphs further down. Redrawing them in Python
would mean a second implementation of that geometry, and the first thing a second
implementation does is disagree with the first.

The header is not carried through: it is drawn from the same `scripts/brand.py` geometry, the
same `lib/skins.ts` palette and the same Geist that everything else here sets, so the tile on
the banner cannot drift from the tile in the tab.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

import brand

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"
GIF = ROOT.parent / ".github" / "media" / "banner.gif"

# Measured off the banner this replaces, so the strip below keeps the frame it was composed
# in. The header is a fixed layout at a fixed size; there is nothing responsive about a GIF.
BAND = 140            # rows the header owns. The strip starts well below it.
TILE = (40, 30, 72)   # x, y, side
RADIUS = 16
WORD = (135, 45, 36)  # x, cap top, size
TAG = (136, 86, 17)
RULE_Y = 131

WORDMARK = "SealDrop"
TAGLINE = "Lock token supply. Publish a proof anyone can check."


def header(skin):
    """The brand band, drawn once and pasted onto every frame."""
    band = Image.new("RGB", (1000, BAND), skin["bg"])
    d = ImageDraw.Draw(band)

    tile = brand.rendered(TILE[2], skin, 0.72, trail=False).convert("RGBA")
    mask = Image.new("L", tile.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, TILE[2] - 1, TILE[2] - 1], RADIUS, fill=255)
    band.paste(tile, (TILE[0], TILE[1]), mask)

    word_f = ImageFont.truetype(str(FONTS / "Geist-SemiBold.ttf"), WORD[2])
    tag_f = ImageFont.truetype(str(FONTS / "Geist-Regular.ttf"), TAG[2])

    # Anchored on the cap line rather than on the ascender, because the measurements above
    # were taken off rendered pixels and the ascender is empty space that moves with the font.
    d.text((WORD[0], WORD[1]), WORDMARK, font=word_f, fill=skin["fg"], anchor="la")
    d.text((TAG[0], TAG[1]), TAGLINE, font=tag_f, fill=skin["fgMuted"], anchor="la")
    d.line([(0, RULE_Y), (1000, RULE_Y)], fill=skin["border"], width=1)
    return band


def main():
    skin = brand.palette()
    # --border is an rgba() and comes back unparsed, so the rule is mixed here instead: the
    # same 10% of a cool light over --bg that globals.css resolves it to.
    skin["border"] = tuple(round(b + (c - b) * 0.10)
                           for b, c in zip(skin["bg"], (190, 216, 214)))

    src = Image.open(GIF)
    band = header(skin)
    print(f"{GIF.relative_to(ROOT.parent)}  {src.size[0]}x{src.size[1]}  {src.n_frames} frames")

    frames, durations = [], []
    for i in range(src.n_frames):
        src.seek(i)
        frame = src.convert("RGB")
        frame.paste(band, (0, 0))
        frames.append(frame.convert("P", palette=Image.ADAPTIVE, colors=255))
        durations.append(src.info.get("duration", 60))

    frames[0].save(GIF, save_all=True, append_images=frames[1:], loop=0,
                   duration=durations, optimize=True, disposal=1)
    print(f"  rewritten  {GIF.stat().st_size // 1024}kb")


if __name__ == "__main__":
    main()
