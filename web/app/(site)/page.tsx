import type {Metadata} from "next";
import {getAdapter} from "@/lib/locks/adapter";
import {formatDateTime, lockedShare} from "@/lib/format";
import {activeChain} from "@/lib/chain";
import {Rail} from "@/components/ui/Rail";
import {FeaturedAirdrop, FeaturedLock, Instrument} from "@/components/home/Instrument";
import {featuredAirdropFor} from "@/lib/airdrops/featured";
import {SEAL_ADDRESS} from "@/lib/social";
import type {Address} from "@/lib/locks/types";
import {Register} from "@/components/home/Register";
import {Extremes} from "@/components/home/Extremes";
import {Procedure} from "@/components/home/Procedure";
import {Assertions} from "@/components/home/Assertions";
import {Closing} from "@/components/home/Closing";
import type {Lock} from "@/lib/locks/types";

/**
 * The landing page: the register.
 *
 * The thesis is that a trust product should not open like a SaaS site. A skeptic did not
 * come for a claim, they came for the readout, so the fold is the readout: one real lock
 * measured twice, the totals for the whole set, and the top of a register of every lock
 * that exists. The sentence that would normally be the headline is set at caption size in
 * the corner, and the slogan does not appear until the end of the page.
 *
 * The register is a table and a chart in the same object. Every row is filled to its exact
 * locked share against one axis ruled through all of them, so the column of fill edges is
 * the distribution of locked supply across the chain, while the figures still align down
 * their own column. The exact number and the shape, without having to choose.
 */
export const metadata: Metadata = {title: "Supply lock register"};

/** Lock states depend on the current time, so this cannot be baked at build time. */
export const dynamic = "force-dynamic";

/**
 * The clearest lock, not the biggest number.
 *
 * The largest lock in the set freezes 90% of its supply, which is the strongest claim and
 * the worst illustration, because the strip comes out almost solid and the one distinction
 * the picture exists to make is the hardest thing to see in it. The lock nearest 60% shows
 * both halves. It matters more here than it would lower down the page, since the strip is
 * sitting next to the number it is supposed to be drawing.
 */
function nearest(locks: Lock[], target: number): Lock | undefined {
  return [...locks].sort(
    (a, b) =>
      Math.abs(lockedShare(a.amount, a.token.totalSupply) - target) -
      Math.abs(lockedShare(b.amount, b.token.totalSupply) - target),
  )[0];
}

export default async function HomePage() {
  const adapter = getAdapter();
  const [stats, page, tokenAirdrop] = await Promise.all([
    adapter.stats(),
    // The whole set, in one read. The register is the page, so there is no "see all" link
    // to a second screen: sorted by share, every row is already here.
    adapter.listLocks({sort: "largest-share", limit: 100}),
    // The project's own airdrop leads the fold when there is one. Resolves to null rather
    // than throwing, and a null simply means a lock is featured instead.
    /^0x[0-9a-fA-F]{40}$/.test(SEAL_ADDRESS)
      ? featuredAirdropFor(SEAL_ADDRESS as Address)
      : Promise.resolve(null),
  ]);

  const locks = page.items;
  const active = locks.filter((lock) => lock.state === "active");
  const featured = nearest(active, 0.6) ?? locks[0];

  /** What the rail declares before any number on the page is quoted. */
  const railFields = (records: number, simulated: boolean) => [
    {label: "Chain", value: activeChain.name},
    {label: "Source", value: simulated ? "Simulated" : "Chain state"},
    {label: "Snapshot", value: formatDateTime(stats.asOf), show: "hidden lg:flex"},
    {label: "Records", value: String(records), show: "hidden lg:flex"},
  ];

  if (!featured) {
    return (
      <div className="flex flex-col">
        <Rail title="Supply lock register" fields={railFields(0, true)} wide />
        <p className="mx-auto w-full max-w-[1680px] px-3 py-16 font-mono text-[11px] text-fg-muted sm:px-4">
          The register is empty. Nothing has been locked yet.
        </p>
      </div>
    );
  }

  // Counted across distinct tokens rather than across locks, so a token with six small
  // locks does not outweigh one with a single large one.
  const tokens = new Set(locks.map((lock) => lock.token.address.toLowerCase())).size;
  const largestShare = lockedShare(locks[0].amount, locks[0].token.totalSupply);

  /**
   * The range: heaviest, median, lightest, from the share-sorted list. The median is
   * stepped one along if it happens to be the lock the fold is already showing, so the
   * figure shows three different locks rather than repeating the hero at a smaller size.
   *
   * Both the median and that step are held inside the interior of the list. A median that
   * lands on the first or last entry is literally the same lock as one of the other two
   * columns, which renders one lock twice and hands two React children the same key. That
   * is not hypothetical at the sizes this register starts at: with two locks on the chain
   * the unclamped index put the same lock in the median and lightest columns.
   */
  const interior = (index: number) => Math.min(Math.max(index, 1), active.length - 2);
  const middle = interior(Math.floor(active.length / 2));
  const medianIndex = active[middle]?.id === featured.id ? interior(middle + 1) : middle;
  const range = [
    {lock: active[0], caption: "Heaviest lock"},
    {lock: active[medianIndex], caption: "Median lock"},
    {lock: active[active.length - 1], caption: "Lightest lock"},
  ].filter((entry) => Boolean(entry.lock));

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <Rail
        title="Supply lock register"
        fields={railFields(stats.lockCount, featured.simulated)}
        wide
      />

      <Instrument
        featured={
          tokenAirdrop ? (
            <FeaturedAirdrop airdrop={tokenAirdrop} />
          ) : (
            <FeaturedLock lock={featured} asOf={stats.asOf} />
          )
        }
        asOf={stats.asOf}
        records={stats.lockCount}
        tokens={tokens}
        meanShare={stats.averageLockedShare}
        largestShare={largestShare}
        nextUnlockAt={stats.nextUnlockAt}
      />

      <Register locks={locks} asOf={stats.asOf} />
      {/* Three readings across the instrument's range. Below three active locks there is
          no range to read, and the figure would be the same lock shown more than once. */}
      {active.length >= 3 ? <Extremes locks={range} /> : null}
      <Procedure />
      <Assertions />
      <Closing records={stats.lockCount} />
    </div>
  );
}
