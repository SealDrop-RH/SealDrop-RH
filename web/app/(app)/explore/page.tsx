import {Suspense} from "react";
import {PageShell, Panel} from "@/components/layout/PageShell";
import {LockFilters} from "@/components/locks/LockFilters";
import {LockList, LockListSkeleton} from "@/components/locks/LockList";
import {AirdropList} from "@/components/airdrops/AirdropList";
import {getAdapter, isSimulated} from "@/lib/locks/adapter";
import {formatDateTime, formatPercent} from "@/lib/format";
import {activeChain} from "@/lib/chain";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import type {LockFilter} from "@/lib/locks/types";

export const metadata = {title: "Explore locks and airdrops"};

/** Rendered per request: the list depends on the current time through every lock's state. */
export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = (typeof params.state === "string" ? params.state : "all") as NonNullable<LockFilter["state"]>;
  const sort = (typeof params.sort === "string" ? params.sort : "newest") as NonNullable<LockFilter["sort"]>;
  const record = typeof params.record === "string" ? params.record : "all";

  const showLocks = record !== "airdrops";
  const showAirdrops = record !== "locks";

  const adapter = getAdapter();
  const [page, stats] = await Promise.all([adapter.listLocks({state, sort, limit: 24}), adapter.stats()]);

  return (
    <PageShell
      title="Explore"
      tag="Tbl. 01"
      rail={[
        {label: "Chain", value: activeChain.name},
        {label: "Source", value: isSimulated() ? "Simulated" : "Chain state"},
        {label: "Snapshot", value: formatDateTime(stats.asOf), show: "hidden lg:flex"},
        {label: "Locks", value: String(page.total), show: "hidden lg:flex"},
      ]}
      lede={
        isSimulated()
          ? "Every lock and airdrop in the sample set. There is no index yet: these are fixtures, and they become real reads from chain in part 2."
          : "Every lock and airdrop on Robinhood Chain, newest first."
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LockFilters state={state} sort={sort} record={record} />
          <p className={cn(MICRO, "text-fg-subtle")}>
            {page.total} locks / {stats.tokenCount} tokens /{" "}
            {formatPercent(stats.averageLockedShare, 1)} average
          </p>
        </div>

        {/* Two registers, each headed, rather than one merged grid. A lock and an airdrop
            are answers to different questions, and interleaving them by date would make a
            reader check every card's tag to find the kind they came for. The tags say which
            is which; the heads say where each set starts. */}
        {showLocks ? (
          <Panel tag="Sec. 01" title="Supply locks" note="Frozen supply">
            <div className="p-3 sm:p-4">
              <Suspense fallback={<LockListSkeleton />}>
                <LockList
                  locks={page.items}
                  empty={{
                    title: "Nothing matches that filter",
                    body: "Try a different state, or clear the filter to see everything.",
                  }}
                />
              </Suspense>
            </div>
          </Panel>
        ) : null}

        {showAirdrops ? (
          <Panel tag="Sec. 02" title="Airdrops" note="Supply on its way out">
            <div className="p-3 sm:p-4">
              {/* Client rendered: an airdrop created in this browser lives in its own
                  storage until the contract is wired up, so the server cannot see it. */}
              <AirdropList />
            </div>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}
