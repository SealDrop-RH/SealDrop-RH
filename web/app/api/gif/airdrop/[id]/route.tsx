import {ImageResponse} from "next/og";
import {getAirdropsAdapter} from "@/lib/airdrops/adapter";
import {ogFonts} from "@/lib/og/fonts";
import {OG_HEIGHT, OG_WIDTH, STRIP} from "@/lib/og/ProofBanner";
import {AirdropBanner} from "@/lib/og/AirdropBanner";
import {animateStripCard, cardCacheControl} from "@/lib/og/animate";

/** Node rather than edge: the fonts are read from the filesystem. */
export const runtime = "nodejs";

/**
 * The airdrop card, animated. See the lock GIF route for why this is not the og:image.
 *
 * The strip's frozen block is the reserve set aside for holders, drawn against the token's
 * whole supply. The rest keeps drifting, which is the honest picture: an airdrop moves a
 * slice of supply to the people holding it and leaves the remainder alone.
 */
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const url = new URL(request.url);

  const airdrop = await getAirdropsAdapter().getAirdrop(id);
  if (!airdrop) {
    return new Response("No airdrop with that id", {status: 404});
  }

  const {token} = airdrop;
  const share = token.totalSupply > 0n ? Number(airdrop.reserve) / Number(token.totalSupply) : 0;

  const card = new ImageResponse(<AirdropBanner airdrop={airdrop} empty />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await ogFonts(),
  });

  const gif = await animateStripCard({
    card,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    strip: STRIP,
    seed: airdrop.id,
    lockedShare: share,
  });

  const headers = new Headers({
    "content-type": "image/gif",
    "cache-control": cardCacheControl(airdrop.simulated),
  });

  if (url.searchParams.get("dl") === "1") {
    headers.set("content-disposition", `attachment; filename="sealdrop-${id}.gif"`);
  }

  return new Response(new Uint8Array(gif), {status: 200, headers});
}
