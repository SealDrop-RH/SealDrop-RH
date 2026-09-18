"use client";

import {motion} from "motion/react";
import type {ReactNode} from "react";
import {usePrefersReducedMotion} from "@/lib/hooks/usePrefersReducedMotion";

/**
 * Content that arrives as you reach it.
 *
 * Deliberately small: 10px and 420ms, once. The job is to make a long page feel like it is
 * keeping up with the scroll, not to perform. Anything bigger turns reading into waiting,
 * and a page where every section makes an entrance has no emphasis left to spend.
 *
 * Under reduced motion it renders plainly with no initial state at all, rather than
 * animating faster.
 *
 * Nothing above the fold uses it. A readout that fades in is a readout that was not ready.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  // The app's hook rather than Motion's, which resolves the media query once during
  // hydration and can keep the animating branch for a reader who asked for less motion.
  const reduced = usePrefersReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{opacity: 0, y: 10}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true, amount: 0.15}}
      transition={{duration: 0.42, delay, ease: [0.16, 1, 0.3, 1]}}
    >
      {children}
    </motion.div>
  );
}
