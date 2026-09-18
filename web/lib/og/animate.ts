import UPNG from "upng-js";
import {renderStripGif, type StripBox} from "@/lib/og/gif";

/**
 * Turns a satori-rendered card into an animated GIF.
 *
 * Satori has no canvas and cannot animate, so the two halves are done by different tools:
 * satori draws the card once as a PNG, and lib/og/gif.ts paints the moving particles into a
 * decoded copy of it for every frame. UPNG is here only to get from the one to the other.
 *
 * The cost is dominated by the frame loop rather than by satori, which is why the card is
 * rendered exactly once no matter how many frames come out of it.
 */
export async function animateStripCard(options: {
  /** A satori response for the card with its strip left empty. */
  card: Response;
  width: number;
  height: number;
  strip: StripBox;
  seed: string;
  lockedShare: number;
  frames?: number;
  delay?: number;
}): Promise<Uint8Array> {
  const png = await options.card.arrayBuffer();
  const decoded = UPNG.decode(png);
  // Always RGBA8 at the card's own size, whatever bit depth the encoder happened to choose.
  const [rgba] = UPNG.toRGBA8(decoded);

  return renderStripGif({
    background: new Uint8ClampedArray(rgba),
    width: decoded.width,
    height: decoded.height,
    strip: options.strip,
    seed: options.seed,
    lockedShare: options.lockedShare,
    frames: options.frames,
    delay: options.delay,
  });
}

/**
 * Cache headers for a generated card.
 *
 * A fixture never changes, so it caches hard. Anything read from chain moves with the clock
 * and gets a short life. Shared by the still and animated routes so the two cannot drift.
 */
export function cardCacheControl(simulated: boolean): string {
  return simulated
    ? "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800"
    : "public, max-age=60, s-maxage=600, stale-while-revalidate=86400";
}
