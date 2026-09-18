import {readFileSync} from "node:fs";
import {join} from "node:path";
import {SKIN as skin} from "@/lib/skins";

/**
 * The brand row at the top of every share card.
 *
 * The mark is inlined as a data URI rather than pointed at by URL. satori will fetch a
 * remote src, but that would mean every card render making an HTTP request back to the
 * deployment that is currently rendering it, which fails on a cold preview and adds a
 * round trip to the ones that do not. 64px of PNG is five kilobytes.
 *
 * Read once and memoised, for the reason lib/og/fonts.ts is memoised: the GIF route renders
 * this card once per frame.
 */
let cached: string | undefined;

export function ogMark(): string {
  if (cached === undefined) {
    try {
      const bytes = readFileSync(join(process.cwd(), "public", "brand", "sealdrop-tile-64.png"));
      cached = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      // Same bargain fonts.ts makes: a card that renders without its mark beats a share
      // link that 500s because an asset moved.
      cached = "";
    }
  }
  return cached;
}

export function Brand({suffix}: {suffix?: string}) {
  const mark = ogMark();

  return (
    <div style={{display: "flex", alignItems: "center", gap: 14}}>
      {mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mark} width={30} height={30} style={{borderRadius: 7}} alt="" />
      ) : (
        <div style={{width: 10, height: 10, borderRadius: 2, background: skin.accent, display: "flex"}} />
      )}
      <div style={{fontSize: 21, color: skin.fgMuted, fontFamily: "Geist Mono"}}>SEALDROP</div>
      {suffix ? (
        <div style={{fontSize: 21, color: skin.fgSubtle, fontFamily: "Geist Mono"}}>{suffix}</div>
      ) : null}
    </div>
  );
}
