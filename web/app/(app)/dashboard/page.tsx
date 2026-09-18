import {PageShell, Panel} from "@/components/layout/PageShell";
import {ActionCard} from "@/components/dashboard/ActionCard";
import {ActivityChart} from "@/components/dashboard/ActivityChart";
import {MyLocks} from "@/components/locks/MyLocks";
import {Readout} from "@/components/ui/instrument";
import {getAdapter, isSimulated} from "@/lib/locks/adapter";
import {startOfDay} from "@/lib/dashboard/series";
import {activeChain} from "@/lib/chain";
import {formatDate, formatDateTime, formatPercent} from "@/lib/format";

export const metadata = {title: "Dashboard"};

/** Everything here is derived from the current time, so it cannot be built ahead. */
export const dynamic = "force-dynamic";

/**
 * The dashboard, as a second view of the instrument.
 *
 * It used to open with "What would you like to do?" over two large cards, which is a menu
 * asking a question. The landing page argues that a trust product should open with a
 * reading, and this screen now does the same: the rail declares chain, source and snapshot,
 * the totals are readouts in the same stack the register uses, and the two things you can
 * do sit underneath them rather than in place of them.
 */
export default async function DashboardPage() {
  const adapter = getAdapter();
  const [stats, all] = await Promise.all([
    adapter.stats(),
    adapter.listLocks({sort: "newest", limit: 200}),
  ]);

  // From the stats snapshot, not from the clock. Render stays pure, and the server and the
  // browser cannot end up disagreeing about which day the chart runs to.
  const endDay = startOfDay(stats.asOf);

  return (
    <PageShell
      title="Dashboard"
      tag="Ovw. 01"
      rail={[
        {label: "Chain", value: activeChain.name},
        {label: "Source", value: isSimulated() ? "Simulated" : "Chain state"},
        {label: "Snapshot", value: formatDateTime(stats.asOf), show: "hidden lg:flex"},
        {label: "Records", value: String(stats.lockCount), show: "hidden lg:flex"},
      ]}
    >
      <div className="flex flex-col gap-6">
        <Panel tag="Sum" title="Register totals" note="All locks">
          {/* The same readout stack as the register's fold. Two columns on a phone so the
              figures stay large enough to be read as figures rather than shrinking to fit
              four across. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              <Readout label="Locks created" value={String(stats.lockCount)} />
            </div>
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              <Readout label="Tokens covered" value={String(stats.tokenCount)} />
            </div>
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              <Readout
                label="Mean share locked"
                value={formatPercent(stats.averageLockedShare, 1).replace("%", "")}
                unit="%"
              />
            </div>
            <div>
              <Readout
                label="Next release"
                // formatDate, not an ISO slice: every other date in the app reads
                // "18 Sep 2026", and one screen rendering "2026-09-18" makes the two look
                // like different fields.
                value={stats.nextUnlockAt ? formatDate(stats.nextUnlockAt) : "None"}
              />
            </div>
          </div>
        </Panel>

        <ActivityChart locks={all.items} endDay={endDay} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ActionCard
            primary
            title="Lock supply"
            body="Held by the contract until the date you choose. Extendable later, never shortenable."
            cta="Create a lock"
            href="/lock"
          />
          <ActionCard
            title="Explore / Verify"
            body="Look up any lock on the chain and check that it holds. No wallet needed."
            cta="Explore / Verify"
            href="/explore"
          />
        </div>

        <Panel tag="Tbl. 01" title="Your locks" note="This wallet">
          <MyLocks />
        </Panel>
      </div>
    </PageShell>
  );
}
