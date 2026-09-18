import {ImageResponse} from "next/og";
import {getAirdropsAdapter} from "@/lib/airdrops/adapter";
import {ogFonts} from "@/lib/og/fonts";
import {OG_HEIGHT, OG_WIDTH} from "@/lib/og/ProofBanner";
import {AirdropBanner} from "@/lib/og/AirdropBanner";
import {cardCacheControl} from "@/lib/og/animate";

/** Node rather than edge: the fonts are read from the filesystem. */
export const runtime = "nodejs";

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const url = new URL(request.url);

  const airdrop = await getAirdropsAdapter().getAirdrop(id);
  if (!airdrop) {
    // A 404 rather than a placeholder image, for the reason the lock card gives: a card that
    // renders something for an id that does not exist is a card that can be made to say
    // anything.
    return new Response("No airdrop with that id", {status: 404});
  }

  const image = new ImageResponse(<AirdropBanner airdrop={airdrop} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await ogFonts(),
  });

  const headers = new Headers(image.headers);
  headers.set("cache-control", cardCacheControl(airdrop.simulated));

  if (url.searchParams.get("dl") === "1") {
    headers.set("content-disposition", `attachment; filename="sealdrop-${id}.png"`);
  }

  return new Response(image.body, {status: 200, headers});
}
