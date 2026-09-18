import {ImageResponse} from "next/og";
import {getAdapter} from "@/lib/locks/adapter";
import {ogFonts} from "@/lib/og/fonts";
import {OG_HEIGHT, OG_WIDTH, ProofBanner} from "@/lib/og/ProofBanner";

/** Node rather than edge: the fonts are read from the filesystem. */
export const runtime = "nodejs";

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const url = new URL(request.url);

  const lock = await getAdapter().getLock(id);
  if (!lock) {
    // A 404 rather than a placeholder image. A card that renders something for an id that
    // does not exist is a card that can be made to say anything.
    return new Response("No lock with that id", {status: 404});
  }


  const image = new ImageResponse(<ProofBanner lock={lock} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await ogFonts(),
  });

  const headers = new Headers(image.headers);

  // A fixture's card never changes, so it caches hard. Anything else is short-lived, since
  // a lock's state moves with the clock.
  headers.set(
    "cache-control",
    lock.simulated
      ? "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800"
      : "public, max-age=60, s-maxage=600, stale-while-revalidate=86400",
  );

  // The download button on the success page. Without this the browser navigates to the
  // image instead of saving it.
  if (url.searchParams.get("dl") === "1") {
    headers.set("content-disposition", `attachment; filename="pons-lock-${id}.png"`);
  }

  return new Response(image.body, {status: 200, headers});
}
