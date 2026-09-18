"use client";

import {useEffect, useState} from "react";
import {animate, useMotionValue} from "motion/react";
import {StripCanvas} from "@/components/strip/StripCanvas";
import {StripSeal} from "@/components/strip/StripSeal";
import {usePrefersReducedMotion} from "@/lib/hooks/usePrefersReducedMotion";
import type {StripLayout} from "@/lib/strip/layout";
import {cn} from "@/lib/cn";

/**
 * The supply strip with a square field.
 *
 * SupplyStrip is not reused here for one reason: its container is the global .strip-field
 * class, which is declared unlayered in globals.css and therefore beats any Tailwind
 * utility trying to square its 8px radius. Rather than edit a shared stylesheet this
 * variant does not own, the field is rebuilt from the same parts: the same StripCanvas, the
 * same StripSeal, the same MotionValue driving both. The picture is identical; only the box
 * around it is the instrument's box.
 *
 * The aspect ratio arrives as a class so a caller can set one for phones and another for
 * desktop. The field always has a definite box, never a dvh, for the reason globals.css
 * gives: a height that reflows as the mobile URL bar collapses resizes the canvas backing
 * store mid animation.
 */

/** Matches --dur-freeze. A rAF loop cannot read a custom property. */
const FREEZE_MS = 1400;

export function StripField({
  seed,
  share,
  play = false,
  className,
}: {
  /** The lock id. Seeds the field, so a lock draws the same picture forever. */
  seed: string;
  share: number;
  play?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const freeze = useMotionValue(play && !reduced ? 0 : 1);
  const [layout, setLayout] = useState<StripLayout | null>(null);

  useEffect(() => {
    if (!play || reduced) {
      freeze.set(1);
      return;
    }
    freeze.set(0);
    const controls = animate(freeze, 1, {duration: FREEZE_MS / 1000, ease: "linear"});
    return () => controls.stop();
  }, [play, reduced, freeze]);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-bg-elev shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
      // paint containment, as the shipped field has: the canvas repaints roughly sixty
      // times a second and nothing outside this box needs to be told about it.
      style={{contain: "paint"}}
    >
      <StripCanvas
        seed={seed}
        lockedShare={share}
        freeze={freeze}
        animated={!reduced}
        staticFreeze={1}
        motionCue={reduced}
        onLayout={setLayout}
      />
      {!reduced ? <StripSeal layout={layout} freeze={freeze} /> : null}
    </div>
  );
}
