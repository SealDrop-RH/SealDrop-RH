import {ImageResponse} from "next/og";
import {getAdapter} from "@/lib/locks/adapter";
import {ogFonts} from "@/lib/og/fonts";
import {OG_HEIGHT, OG_WIDTH, STRIP, ProofBanner} from "@/lib/og/ProofBanner";
import {animateStripCard, cardCacheControl} from "@/lib/og/animate";
import {lockedShare} from "@/lib/format";

/** Node rather than edge: the fonts are read from the filesystem. */
export const runtime = "nodejs";

/**
 * The share card, animated.
 *
 * The still card states how much supply is locked. This one shows it: the frozen block sits
 * perfectly still while the rest of the supply keeps drifting around it, which is the whole
 * argument in one loop.
 *
 * This is deliberately NOT what the page's og:image points at. Card renderers on X, Facebook
 * and LinkedIn serve a single frame of an animated GIF, so using it there would cost the
 * still card's sharper text and gain nothing. The GIF is for a human to download and attach
 * to a post, where it does animate, and for the chat apps that embed GIFs properly.
 */
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const url = new URL(request.url);

  const lock = await getAdapter().getLock(id);
  if (!lock) {
    // A 404 rather than a placeholder image. A card that renders something for an id that
    // does not exist is a card that can be made to say anything.
    return new Response("No lock with that id", {status: 404});
  }

  const card = new ImageResponse(<ProofBanner lock={lock} empty />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await ogFonts(),
  });

  const gif = await animateStripCard({
    card,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    strip: STRIP,
    seed: lock.id,
    lockedShare: lockedShare(lock.amount, lock.token.totalSupply),
  });

  const headers = new Headers({
    "content-type": "image/gif",
    "cache-control": cardCacheControl(lock.simulated),
  });

  // Without this the browser navigates to the image instead of saving it.
  if (url.searchParams.get("dl") === "1") {
    headers.set("content-disposition", `attachment; filename="sealdrop-${id}.gif"`);
  }

  return new Response(new Uint8Array(gif), {status: 200, headers});
}
