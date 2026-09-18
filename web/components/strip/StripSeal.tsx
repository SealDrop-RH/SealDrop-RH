"use client";

import {motion, useTransform, type MotionValue} from "motion/react";
import type {StripLayout} from "@/lib/strip/layout";

/**
 * The hairline that closes around the frozen block.
 *
 * DOM rather than canvas, because a one-pixel rule is exactly the thing a canvas renders
 * badly at fractional device ratios, and because it needs to be crisp: it is the moment the
 * block stops being a pile of squares and becomes one sealed thing.
 *
 * Drawn from the left, so it follows the direction the block assembled in.
 */
export function StripSeal({layout, freeze}: {layout: StripLayout | null; freeze: MotionValue<number>}) {
  // Starts at 0.64 of the freeze and finishes just before it does, so the seal is the
  // reward for staying rather than part of the main event.
  const scaleX = useTransform(freeze, [0.64, 0.94], [0, 1]);
  const opacity = useTransform(freeze, [0.6, 0.72], [0, 1]);

  if (!layout || layout.frozenCount === 0) return null;

  return (
    <motion.div
      aria-hidden
      className="strip-seal"
      style={{
        left: 0,
        top: 0,
        width: `${layout.block.x1 * 100}%`,
        height: "100%",
        scaleX,
        opacity,
      }}
    />
  );
}
