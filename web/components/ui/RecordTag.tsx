import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";

/**
 * What kind of record a card is.
 *
 * Explore lists locks and airdrops together, and the two are genuinely different promises:
 * a lock is supply that cannot move, an airdrop is supply on its way out to holders. A
 * reader scanning one grid has to be able to tell them apart without reading the figures,
 * so the kind is stated rather than implied by the card's shape.
 *
 * It is a left edge and a word, not a filled pill. The accent is already spent on the
 * measured figures in these cards, and a second saturated block competing with them is how
 * a dense list stops being readable.
 */
export function RecordTag({kind}: {kind: "lock" | "airdrop"}) {
  return (
    <span
      className={cn(
        MICRO,
        "inline-flex shrink-0 items-center border-l-2 pl-1.5",
        kind === "lock" ? "border-fg-subtle text-fg-subtle" : "border-accent text-accent",
      )}
    >
      {kind === "lock" ? "Lock" : "Airdrop"}
    </span>
  );
}
