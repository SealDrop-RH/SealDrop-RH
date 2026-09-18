import Image from "next/image";
import mark from "@/public/brand/sealdrop-mark-light.png";
import {cn} from "@/lib/cn";

/**
 * The mark, for the app's own chrome.
 *
 * Deliberately the flat foreground silhouette rather than the rendered emerald tile. This
 * skin spends its one saturated accent on whatever you are currently looking at: the active
 * row on the nav rail, the locked share of a supply strip, the live figure on a card.
 * AppSidebar says so in its own header comment. A permanently green badge pinned to the
 * top of every page would outrank all of them and the rule would quietly stop being true.
 *
 * Set in the same --fg as the word beside it, the mark reads as the first glyph of the
 * wordmark instead of a second thing competing with it.
 *
 * The rendered tile is still the product's face everywhere the product is an icon rather
 * than a page: the tab, the home screen, the share card. public/brand holds both, and
 * scripts/brand.py draws every one of them from the same geometry.
 *
 * This is the seal on its own, without the six squares trailing off it. At the 22px the
 * chrome sets it, those squares are two grey pixels on the right that cost the seal the room
 * it needs to still have a drop in it. public/brand/README.md has the whole rule.
 */
export function Logo({size = 22, className}: {size?: number; className?: string}) {
  return (
    <Image
      src={mark}
      // Decorative in every place it is used, because the wordmark is right next to it and
      // a screen reader announcing "SealDrop SealDrop" is worse than silence.
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      className={cn("shrink-0", className)}
    />
  );
}
