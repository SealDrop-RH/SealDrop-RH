# The supply strip

The one deliberate idea in the product: **total supply is a field, and locking freezes part
of it.**

The field is a token's total supply. One particle is `totalSupply / count` tokens. The
particles that stop moving are the locked amount; the ones still drifting are what
circulates. The distinction is the entire product, so the arithmetic is the design.

## One layout function, two renderers

`web/lib/strip/layout.ts` is pure, has no DOM, and is imported by both the live canvas and
the share image. There is exactly one `positionAt`. The canvas calls it about sixty times a
second; satori calls it once, on a server, with `(t = 0, freeze = 1)`.

At `freeze === 1` a frozen particle sits exactly on its slot for every `t`. That property is
what makes the card and the page the same picture rather than two things that resemble each
other, and `test/strip-determinism.test.ts` asserts it across a range of times.

Determinism comes from `mulberry32(fnv1a32(seed))` seeded with the lock id, so a lock draws
the same field on a server, in any browser, today and next year.

## Canvas 2D, not WebGL

The share image has to draw this picture on a server with no canvas and no GPU, so positions
must be computable in plain TypeScript regardless. That erases WebGL's main advantage,
because the maths would then exist twice, in GLSL and TypeScript, with no way to prove the
two agree. A few thousand `fillRect` calls fits inside a frame budget comfortably. DOM loses
on arithmetic: 400 independently transformed layers already costs more than 3,600 rects.

Squares, not circles. `arc()` plus `fill()` is several times slower, and a square tick reads
as a discrete countable unit where a bubble reads as gas.

## Particle count is an output of the device

```
count = clamp(900, round(cssWidth * 3.2), 3600)
  * (deviceMemory <= 4 ? 0.55 : 1)
  * (pointer: coarse ? 0.7 : 1)
```

Plus a watchdog: if frames run over 20ms for 30 consecutive frames, the grain halves once.
Safe, because the block's geometry does not depend on count. `test/strip-geometry.test.ts`
asserts the block is byte-identical at 220, 900, 1800 and 3600 particles, which is what lets
the share image use 700 where the canvas uses a few thousand.

The share image resolves the frozen block's **grid** at a separate, higher reference count.
Satori's cost is one div per circulating particle, and the block is one rectangle plus a
bounded number of divider lines, so its resolution is free. Tying the two together made the
block on the card visibly chunkier than the same block on the page.

## The freeze

One `MotionValue` animated **linearly** from 0 to 1 over 1400ms. All the shaping lives inside
`positionAt`.

This is structural, not stylistic. Because the outer animation is linear, any freeze value
produces exactly one frame, so scrubbing it, replaying it and rendering it on a server all
give the same picture. Easing in the outer animation would mean the share image could only
ever draw the endpoints.

| Phase | What | Curve |
| --- | --- | --- |
| Arrest | The to-be-frozen cohort slows and crowds | `--ease-in` |
| Snap | Per-particle lerp to slot, staggered left to right by `delay` | `--ease-out` |
| Colour take | RGB lerp from free to locked, from 25% of each particle's own span | linear |
| Seal | A 1px accent hairline draws around the block from the left | `--ease-out`, 420ms |

The colour crossfade is linear on purpose: on a bezier it reads as a flicker rather than a
change.

It plays at most once per lock per tab, tracked in `sessionStorage`. Coming back to a page
should show the lock, not perform it again.

## The scrubber is a cliff, not a vest

A lock does not gradually release. Mapping the scrubber onto a dissolve would be prettier
and would teach a lie about how the product works, so the block stays completely solid for
every position before the unlock date and releases the instant the marker crosses it.

The input is uncontrolled and writes straight into a MotionValue; both readouts are written
as text content. Dragging renders React zero times. Base UI's Slider is used elsewhere in the
app but not here, because it holds its value in React state, which is one render per
`pointermove`.

## Reduced motion is a different renderer, not a deletion

`StripCanvas` in static mode draws the identical canvas once at the end state, plus a
still-frame cue: a dimmer copy of each circulating particle offset behind it, a frozen
motion-blur tail. In a motionless picture it is the only thing left that can say these are
moving.

The legend is visible in every mode, so the facts are never carried by the visual alone. And
the scrubber still works: reduced motion means no involuntary animation, not the removal of
a control.

## What is checked

- `strip-determinism.test.ts`: same seed gives identical output; `positionAt(p, t, 1)`
  equals the slot for any `t`; circulating particles clear the block once frozen; the field
  wraps cleanly at any time; the easing solver matches a known-linear curve.
- `strip-geometry.test.ts`: the block is invariant under particle count; its width equals the
  locked share exactly; every frozen particle gets a distinct slot inside the block; cells
  stay close to square once rendered; the freeze sweeps left to right.
- `scripts/compare-og.mjs` puts the canvas and the share image side by side for the same
  lock, which is the only check of what it actually looks like.
