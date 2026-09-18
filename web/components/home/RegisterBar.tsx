"use client";

import {motion} from "motion/react";
import {cn} from "@/lib/cn";
import {usePrefersReducedMotion} from "@/lib/hooks/usePrefersReducedMotion";

/**
 * One row's locked share, drawn against the register's shared axis.
 *
 * The bar is the row, not an ornament in it: the register is sorted by share, so the column
 * of right hand edges is the distribution of locked supply across every token on the chain,
 * read top to bottom. That is the reason the table and the chart are the same object here.
 *
 * It sweeps out on scroll, scaleX from a left origin, staggered a frame or two per row. The
 * motion is the instrument taking the reading, which is the one thing on this page worth
 * animating that is not the strip. Transform only, so twenty four of them cost one
 * composite. Under reduced motion the bar is simply already at its width.
 */
export function RegisterBar({
  share,
  index,
  muted = false,
}: {
  share: number;
  index: number;
  /** Withdrawn locks: the supply is back in circulation, so the bar is not accent. */
  muted?: boolean;
}) {
  // The app's own hook, not Motion's. Motion's reads the media query once into useState on
  // first render, which during hydration is the server's answer, so a reader who asked for
  // less motion kept the animating branch and every bar stayed at scaleX(0): the register
  // rendered as an empty chart. This one is a useSyncExternalStore subscription and
  // corrects itself on the client.
  const reduced = usePrefersReducedMotion();

  // A floor of 0.35%, so a lock at three thousandths of supply still draws an edge rather
  // than vanishing. It is a tenth of a pixel of overstatement at this width.
  const width = `${Math.max(0.35, share * 100)}%`;
  const fill = muted
    ? "bg-surface-2 shadow-[inset_-2px_0_0_var(--border-strong)]"
    : "bg-accent-dim shadow-[inset_-2px_0_0_var(--accent)]";

  if (reduced) {
    return <div aria-hidden className={cn("absolute left-0 top-0 h-full", fill)} style={{width}} />;
  }

  return (
    <motion.div
      aria-hidden
      className={cn("absolute left-0 top-0 h-full origin-left", fill)}
      style={{width}}
      initial={{scaleX: 0}}
      whileInView={{scaleX: 1}}
      // No amount: Motion's default is "some", a threshold of zero. A bar starts at
      // scaleX(0) and therefore has no area at all, and a ratio threshold on a zero area
      // target is not something to rely on: at 0.5 the rows already on screen at load never
      // fired and the fold's chart stayed blank until something scrolled.
      viewport={{once: true}}
      transition={{duration: 0.5, delay: Math.min(index, 16) * 0.02, ease: [0.16, 1, 0.3, 1]}}
    />
  );
}
