"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {animate, useMotionValue} from "motion/react";
import {StripCanvas} from "./StripCanvas";
import {StripSeal} from "./StripSeal";
import {StripLegend} from "./StripLegend";
import {ThawScrubber} from "./ThawScrubber";
import {usePrefersReducedMotion} from "@/lib/hooks/usePrefersReducedMotion";
import {formatCompact, formatPercent, lockedShare} from "@/lib/format";
import type {StripLayout} from "@/lib/strip/layout";
import type {Lock} from "@/lib/locks/types";

/**
 * The hero, and the same picture wherever a lock is shown at size.
 *
 * The freeze is one MotionValue animated LINEARLY from 0 to 1. All the shaping lives inside
 * positionAt. That is structural rather than stylistic: because the outer animation is
 * linear, any freeze value produces exactly one frame, so scrubbing it, replaying it and
 * rendering it on a server all give the same picture. Easing out here instead would mean
 * the share image could only ever draw the endpoints.
 *
 * Reduced motion is not a deletion. It renders the identical canvas, drawn once at the end
 * state, with a still-frame cue on the circulating particles so a motionless picture can
 * still say that most of this supply moves. The facts live in the legend either way.
 */

/** Matches --dur-freeze. Duplicated because a rAF loop cannot read a CSS custom property. */
const FREEZE_MS = 1400;
const THAW_MS = 700;

export function SupplyStrip({
  lock,
  className,
  /** Plays the freeze on mount. The landing and the success page want this; a list does not. */
  play = false,
  /** Offers the time scrubber. Only worth it where the lock is the subject of the page. */
  scrubber = false,
}: {
  lock: Lock;
  className?: string;
  play?: boolean;
  scrubber?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const share = lockedShare(lock.amount, lock.token.totalSupply);

  // Starts sealed unless this instance is going to play the freeze, so a strip that is just
  // reporting a fact never animates at someone.
  const freeze = useMotionValue(play && !reduced ? 0 : 1);
  const [layout, setLayout] = useState<StripLayout | null>(null);
  const scrubbing = useRef(false);

  useEffect(() => {
    if (!play || reduced) {
      freeze.set(1);
      return;
    }

    // Replayed at most once per lock per tab. Coming back to a page should show the lock,
    // not perform it again.
    const key = `pons-lock-freeze:${lock.id}`;
    let alreadyPlayed = false;
    try {
      alreadyPlayed = sessionStorage.getItem(key) === "1";
    } catch {
      // Storage refused. Playing it is the better failure.
    }

    if (alreadyPlayed) {
      freeze.set(1);
      return;
    }

    freeze.set(0);
    const controls = animate(freeze, 1, {
      duration: FREEZE_MS / 1000,
      ease: "linear",
      // The marker is written on completion, not on start.
      //
      // Strict Mode runs an effect, tears it down and runs it again. Writing the marker up
      // front meant the second pass read it, concluded the freeze had already played, and
      // jumped to the end state: the animation was over in a single frame and every capture
      // past 300ms looked identical. Recording it only once it has actually finished makes
      // the double invocation harmless.
      onComplete: () => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // Nothing to do.
        }
      },
    });
    return () => controls.stop();
  }, [play, reduced, freeze, lock.id]);

  const onScrub = useCallback(
    (active: boolean) => {
      scrubbing.current = active;
      if (!active) {
        // Springs back to the lock's real state on release, so the scrubber is a preview
        // rather than a setting.
        animate(freeze, 1, {duration: THAW_MS / 1000, ease: [0.16, 1, 0.3, 1]});
      }
    },
    [freeze],
  );

  // A representative grain for the legend's "1 tick" figure. It states the order of
  // magnitude one square stands for, rather than auditing the device's exact count.
  const unit = useMemo(
    () => formatCompact(lock.token.totalSupply / 2200n, lock.token.decimals),
    [lock.token.totalSupply, lock.token.decimals],
  );

  return (
    <figure className={className}>
      <div className="strip-field">
        <StripCanvas
          seed={lock.id}
          lockedShare={share}
          freeze={freeze}
          animated={!reduced}
          staticFreeze={1}
          motionCue={reduced}
          onLayout={setLayout}
        />
        {!reduced ? <StripSeal layout={layout} freeze={freeze} /> : null}
      </div>

      <figcaption className="mt-3 flex flex-col gap-3">
        <StripLegend lock={lock} unitValue={unit} />
        {/* Offered under reduced motion too. Reduced motion means no involuntary animation,
            not the removal of a control. */}
        {scrubber && lock.state === "active" ? (
          <ThawScrubber lockedAt={lock.lockedAt} unlockAt={lock.unlockAt} freeze={freeze} onScrub={onScrub} />
        ) : null}
        <p className="sr-only">
          {formatPercent(share, 1)} of the total supply of {lock.token.symbol} is locked and cannot
          move. The remainder is still circulating.
        </p>
      </figcaption>
    </figure>
  );
}
