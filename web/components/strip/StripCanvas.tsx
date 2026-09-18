"use client";

import {useEffect, useRef} from "react";
import type {MotionValue} from "motion/react";
import {layoutSupplyStrip, type StripLayout} from "@/lib/strip/layout";
import {createScratch, drawStrip} from "@/lib/strip/draw";
import {readStripPalette, type StripPalette} from "@/lib/strip/palette";
import {useMeasure} from "@/lib/hooks/useMeasure";

/**
 * The strip, on a canvas.
 *
 * Canvas 2D rather than WebGL or DOM, for one reason above the others: the share image has
 * to draw this same picture on a server, where there is no canvas and no GPU, so the
 * positions have to be computable in plain TypeScript regardless. That erases WebGL's main
 * advantage, since the maths would then exist twice with no way to prove the two agree. A
 * few thousand fillRects is comfortably inside a frame budget anyway, and a square tick
 * reads as a discrete countable unit where a circle reads as gas.
 *
 * No React state changes per frame. The loop reads MotionValues and writes to the canvas
 * directly, so a running animation renders the React tree exactly zero times.
 */

export interface StripCanvasProps {
  /** The lock id. Seeds the field, so a lock draws the same picture forever. */
  seed: string;
  lockedShare: number;
  /**
   * Animated mode reads these every frame. Static mode ignores them and draws one frame at
   * `staticFreeze`, which is also the reduced-motion path and the share image's path.
   */
  freeze?: MotionValue<number>;
  animated?: boolean;
  staticFreeze?: number;
  /** Draws the still-frame motion cue. Used by the reduced-motion renderer. */
  motionCue?: boolean;
  /** Called once the layout exists, so the seal and the tooltip can size themselves. */
  onLayout?: (layout: StripLayout) => void;
  className?: string;
}

/**
 * Particle count is an output of the device, not a design decision.
 *
 * The block's geometry is invariant under count, so a weaker device gets a coarser grain and
 * the identical picture. test/strip-geometry.test.ts is what guarantees that.
 */
function particleCount(cssWidth: number): number {
  /**
   * 1.4 per css pixel, not 3.2.
   *
   * At the old density a desktop hero drew 3600 squares, which packed the field so tightly
   * that the circulating half read as one grey mass rather than as countable units drifting.
   * The strip's whole job is to look like supply you could count, and past roughly 1500 it
   * stops looking like anything. Thinning it also gives every frame less to do, which is
   * felt most on the machines that were already struggling.
   */
  let count = Math.max(450, Math.min(1500, Math.round(cssWidth * 1.4)));

  const memory = (navigator as {deviceMemory?: number}).deviceMemory;
  if (typeof memory === "number" && memory <= 4) count = Math.round(count * 0.55);
  if (window.matchMedia("(pointer: coarse)").matches) count = Math.round(count * 0.7);

  return count;
}

export function StripCanvas({
  seed,
  lockedShare,
  freeze,
  animated = false,
  staticFreeze = 1,
  motionCue = false,
  onLayout,
  className,
}: StripCanvasProps) {
  const [measureRef, size] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratch = useRef(createScratch());

  // Kept in a ref so the animation loop can call the latest callback without the effect
  // being torn down and the canvas rebuilt every time the parent re-renders. Synced in an
  // effect rather than during render, which is not a safe place to write a ref.
  const onLayoutRef = useRef(onLayout);
  useEffect(() => {
    onLayoutRef.current = onLayout;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvas?.parentElement;
    if (!canvas || !wrapper || size.width === 0 || size.height === 0) return;

    // Capped at 2. A third device pixel in each direction costs 2.25x the fill for a
    // difference nobody can see on a field of small squares.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const context = canvas.getContext("2d", {alpha: false});
    if (!context) return;

    let count = particleCount(size.width);
    let layout: StripLayout;
    let palette: StripPalette;

    function rebuild() {
      canvas!.width = Math.round(size.width * dpr);
      canvas!.height = Math.round(size.height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = layoutSupplyStrip({
        seed,
        count,
        lockedShare,
        aspect: size.width / size.height,
      });
      // Resolved off the canvas itself rather than imported, so no colour literal ever
      // enters the drawing code and a token change retints the hero with no edit here.
      palette = readStripPalette(canvas!);
      onLayoutRef.current?.(layout);
    }

    rebuild();

    function paint(timeSeconds: number, freezeValue: number) {
      drawStrip(context!, {
        layout,
        palette,
        time: timeSeconds,
        freeze: freezeValue,
        width: size.width,
        height: size.height,
        scratch: scratch.current,
        motionCue,
      });
    }

    if (!animated) {
      // One frame, at the end state. This is the reduced-motion renderer and the still
      // picture on every card, and it is the same code that draws the animation's last
      // frame, so the two cannot drift apart.
      paint(0, staticFreeze);
      return;
    }

    let frame = 0;
    let visible = true;
    const start = performance.now();

    /* FPS watchdog. A Mac will never show you this problem, so the count is measured rather
       than assumed: if frames are consistently over budget, the grain is halved once. Safe,
       because the block's geometry does not depend on count. */
    let slowFrames = 0;
    let downshifted = false;
    let lastFrameAt = start;

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (!visible) {
        lastFrameAt = now;
        return;
      }

      const delta = now - lastFrameAt;
      lastFrameAt = now;
      if (!downshifted && delta > 20) {
        slowFrames += 1;
        if (slowFrames > 30) {
          downshifted = true;
          count = Math.round(count / 2);
          rebuild();
          if (process.env.NODE_ENV !== "production") {
            console.info(`[strip] frames over budget, grain halved to ${count} particles`);
          }
        }
      } else if (delta <= 20) {
        slowFrames = 0;
      }

      paint((now - start) / 1000, freeze ? freeze.get() : staticFreeze);
    }

    frame = requestAnimationFrame(tick);

    // Offscreen strips stop drawing entirely. On a page of lock cards this is the difference
    // between one running loop and twenty.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      {rootMargin: "120px"},
    );
    observer.observe(wrapper);

    // A hidden tab keeps firing rAF in some browsers and not others. Stopping explicitly
    // means the behaviour is the same everywhere, and a tab left open overnight does not
    // come back having burned a battery.
    const onVisibility = () => {
      visible = document.visibilityState === "visible" && visible;
      if (document.visibilityState === "visible") lastFrameAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [seed, lockedShare, animated, staticFreeze, motionCue, size.width, size.height, freeze]);

  // Absolutely positioned so it inherits .strip-field's aspect-ratio box. Left in normal
  // flow it has auto height, the canvas's height:100% resolves against nothing, and the
  // field gets measured at the wrong scale.
  return (
    <div ref={measureRef} className={className ?? "absolute inset-0"}>
      <canvas ref={canvasRef} className="strip-canvas" aria-hidden />
    </div>
  );
}
