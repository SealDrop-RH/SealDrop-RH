"use client";

import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useCallback} from "react";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";

/**
 * Filters write to the URL rather than to component state.
 *
 * That keeps the results server-rendered, makes a filtered view shareable, and makes the
 * back button do what it looks like it should. The cost is a navigation per change, which
 * on a static list is cheaper than shipping the whole set to the client to filter it there.
 */

const STATES = [
  {value: "all", label: "All"},
  {value: "active", label: "Locked"},
  {value: "unlockable", label: "Unlockable"},
  {value: "withdrawn", label: "Withdrawn"},
] as const;

const SORTS = [
  {value: "newest", label: "Newest"},
  {value: "unlocking-soon", label: "Unlocking soon"},
  {value: "largest-share", label: "Largest share"},
] as const;

const RECORDS = [
  {value: "all", label: "All"},
  {value: "locks", label: "Locks"},
  {value: "airdrops", label: "Airdrops"},
] as const;

export function LockFilters({
  state,
  sort,
  record,
}: {
  state: string;
  sort: string;
  /** Omitted on screens that only ever list locks, which hides the record group. */
  record?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      // The default is expressed as an absent parameter, so a default view has a clean URL.
      if (value === "all" || value === "newest") next.delete(key);
      else next.set(key, value);
      // A filter change is not a new place, so it replaces rather than stacking history.
      router.replace(next.size ? `${pathname}?${next}` : pathname, {scroll: false});
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {record !== undefined ? (
        <Group
          label="Record"
          options={RECORDS}
          value={record}
          onChange={(v) => setParam("record", v)}
        />
      ) : null}
      {/* State and sort describe locks. With only airdrops on screen they would be controls
          for something that is not there, so they go rather than sit disabled. */}
      {record !== "airdrops" ? (
        <>
          <Group label="State" options={STATES} value={state} onChange={(v) => setParam("state", v)} />
          <Group label="Sort" options={SORTS} value={sort} onChange={(v) => setParam("sort", v)} />
        </>
      ) : null}
    </div>
  );
}

function Group({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{value: string; label: string}>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // One hairline box divided into cells, rather than loose chips floating in a padded
      // tray. It matches the chart's range switch and the register's own segmented heads.
      className="flex items-stretch divide-x divide-border border border-border"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            MICRO,
            "flex h-8 items-center px-3 transition-colors duration-[var(--dur-micro)] ease-out",
            value === option.value
              ? "bg-surface-2 text-fg"
              : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
