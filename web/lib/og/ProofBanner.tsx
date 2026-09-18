import {SKIN as skin} from "@/lib/skins";
import {Brand} from "@/lib/og/Brand";
import {mix, parseColor} from "@/lib/color";
import {renderStripNodes} from "@/lib/strip/og";
import {formatCompact, formatDate, formatPercent, lockedShare} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";

/**
 * The share card.
 *
 * Satori constraints that shape everything here, stated so nobody rediscovers them at one in
 * the morning: no CSS custom properties, which is why lib/skins.ts exists and why this file
 * is the one place besides it allowed literal hex; no canvas; every element with more than
 * one child needs an explicit display:flex; and gradients are unreliable, so the strip is
 * real divs.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * Laid out against fixed coordinates because satori has no measurement pass: an absolutely
 * positioned strip cannot be pushed down by text above it, so the room has to be left.
 * 630 total, minus a 52px watermark, leaves the strip ending at 462 with breathing room.
 */
export const STRIP = {x: 64, y: 244, width: OG_WIDTH - 128, height: 218};

/**
 * `empty` leaves the strip as bare field.
 *
 * The animated card composites its particles into this image frame by frame, and a still
 * set of them baked into the background would sit underneath the moving ones and never
 * clear. Everything else about the card is identical, which is the point: the GIF is this
 * card with the strip alive, not a second design.
 */
export function ProofBanner({lock, empty = false}: {lock: Lock; empty?: boolean}) {
  const share = lockedShare(lock.amount, lock.token.totalSupply);
  const nodes = empty
    ? {free: [], block: null, edge: [], dividers: []}
    : renderStripNodes(lock.id, share, STRIP.width, STRIP.height);

  const free = parseColor(skin.supplyFree) ?? {r: 110, g: 110, b: 110, a: 1};
  const locked = parseColor(skin.supplyLocked) ?? {r: 255, g: 98, b: 0, a: 1};
  const paint = (k: number) => {
    const c = mix(free, locked, k);
    return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  };

  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        flexDirection: "column",
        background: skin.bg,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      <div style={{display: "flex", flexDirection: "column", padding: "56px 64px 0"}}>
        <Brand />

        <div
          style={{
            display: "flex",
            fontSize: 62,
            fontWeight: 600,
            color: skin.fg,
            marginTop: 18,
            letterSpacing: "-0.02em",
          }}
        >
          {formatPercent(share, 1)} of ${lock.token.symbol} is locked
        </div>

        <div style={{display: "flex", fontSize: 25, color: skin.fgMuted, marginTop: 12}}>
          {formatCompact(lock.amount, lock.token.decimals)} of{" "}
          {formatCompact(lock.token.totalSupply, lock.token.decimals)} {lock.token.symbol}, until{" "}
          {formatDate(lock.unlockAt)}
        </div>
      </div>

      {/* The strip, as divs. Same layout function as the live canvas. */}
      <div
        style={{
          position: "absolute",
          left: STRIP.x,
          top: STRIP.y,
          width: STRIP.width,
          height: STRIP.height,
          display: "flex",
          background: skin.supplyField,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {nodes.free.map((rect, i) => (
          <div
            key={`f${i}`}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              background: paint(0),
              display: "flex",
            }}
          />
        ))}
        {nodes.block ? (
          <div
            style={{
              position: "absolute",
              left: nodes.block.x,
              top: 0,
              width: nodes.block.width,
              height: STRIP.height,
              background: paint(1),
              display: "flex",
            }}
          />
        ) : null}
        {nodes.edge.map((rect, i) => (
          <div
            key={`e${i}`}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              background: paint(1),
              display: "flex",
            }}
          />
        ))}
        {nodes.dividers.map((rect, i) => (
          <div
            key={`d${i}`}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              background: skin.supplyField,
              display: "flex",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: STRIP.y + STRIP.height + 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 26, fontSize: 21, fontFamily: "Geist Mono"}}>
          <div style={{display: "flex", alignItems: "center", gap: 9}}>
            <div style={{width: 13, height: 13, borderRadius: 2, background: skin.supplyLocked, display: "flex"}} />
            <div style={{color: skin.fg, display: "flex"}}>locked</div>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 9}}>
            <div style={{width: 13, height: 13, borderRadius: 2, background: skin.supplyFree, display: "flex"}} />
            <div style={{color: skin.fgMuted, display: "flex"}}>circulating</div>
          </div>
        </div>
        <div style={{fontSize: 20, color: skin.fgSubtle, fontFamily: "Geist Mono", display: "flex"}}>
          {lock.id}
        </div>
      </div>

      {/* The watermark. Inside the image on purpose: the image is what travels, and a
          screenshot of a convincing lock proof is exactly the thing that must not be
          passable as real. It disappears on its own when lock.simulated goes false. */}
      {lock.simulated ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 0",
            background: skin.warn,
            color: skin.bg,
            fontSize: 20,
            fontWeight: 500,
            fontFamily: "Geist Mono",
          }}
        >
          SIMULATED. NO CONTRACT DEPLOYED. NOT PROOF OF ANYTHING.
        </div>
      ) : null}
    </div>
  );
}
