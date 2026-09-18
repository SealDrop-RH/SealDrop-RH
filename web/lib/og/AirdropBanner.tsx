import {SKIN as skin} from "@/lib/skins";
import {Brand} from "@/lib/og/Brand";
import {mix, parseColor} from "@/lib/color";
import {renderStripNodes} from "@/lib/strip/og";
import {formatCompact, formatDate, formatPercent} from "@/lib/format";
import {formatRate, shortInterval} from "@/lib/airdrops/schedule";
import {OG_HEIGHT, OG_WIDTH, STRIP} from "@/lib/og/ProofBanner";
import type {Airdrop} from "@/lib/airdrops/types";

/**
 * The airdrop share card.
 *
 * Deliberately the same object as the lock card: same grid, same strip in the same box, same
 * watermark rule. The two records are halves of one story, and a reader who has seen a lock
 * card should recognise this one without being told what it is.
 *
 * What the strip means here is the one real difference, and the legend says so. On a lock it
 * is supply that cannot move. On an airdrop it is supply set aside to be handed out, drawn
 * against the same total so the two are comparable at a glance.
 *
 * The satori constraints that shape this are in ProofBanner: no custom properties, no canvas,
 * explicit display:flex on anything with more than one child.
 */
export function AirdropBanner({airdrop, empty = false}: {airdrop: Airdrop; empty?: boolean}) {
  const {token, schedule} = airdrop;
  const share = token.totalSupply > 0n ? Number(airdrop.reserve) / Number(token.totalSupply) : 0;
  const nodes = empty
    ? {free: [], block: null, edge: [], dividers: []}
    : renderStripNodes(airdrop.id, share, STRIP.width, STRIP.height);

  const free = parseColor(skin.supplyFree) ?? {r: 110, g: 110, b: 110, a: 1};
  const locked = parseColor(skin.supplyLocked) ?? {r: 255, g: 98, b: 0, a: 1};
  const paint = (k: number) => {
    const c = mix(free, locked, k);
    return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  };

  const terms = schedule
    ? `${formatRate(schedule.rateBps)} of what is left every ${shortInterval(schedule.intervalSeconds)}`
    : `One pool, claimable from ${formatDate(airdrop.startsAt)}`;

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
        <Brand suffix="/ AIRDROP" />

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
          {formatCompact(airdrop.reserve, token.decimals)} ${token.symbol} to holders
        </div>

        <div style={{display: "flex", fontSize: 25, color: skin.fgMuted, marginTop: 12}}>
          {terms}, split across {airdrop.eligibleHolders.toLocaleString("en-US")} wallets
        </div>
      </div>

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
            <div style={{color: skin.fg, display: "flex"}}>set aside ({formatPercent(share, 1)})</div>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 9}}>
            <div style={{width: 13, height: 13, borderRadius: 2, background: skin.supplyFree, display: "flex"}} />
            <div style={{color: skin.fgMuted, display: "flex"}}>rest of supply</div>
          </div>
        </div>
        <div style={{fontSize: 20, color: skin.fgSubtle, fontFamily: "Geist Mono", display: "flex"}}>
          {airdrop.id}
        </div>
      </div>

      {/* Same rule as the lock card: the image is what travels, so a simulated record has to
          say so inside it. It disappears on its own when airdrop.simulated goes false. */}
      {airdrop.simulated ? (
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
