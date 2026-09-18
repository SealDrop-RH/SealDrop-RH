import {Empty, Skeleton} from "@/components/ui/primitives";
import {LockCard} from "./LockCard";
import type {Lock} from "@/lib/locks/types";

export function LockList({
  locks,
  empty,
}: {
  locks: Lock[];
  empty?: {title: string; body?: string; action?: React.ReactNode};
}) {
  if (locks.length === 0) {
    return (
      <Empty
        title={empty?.title ?? "No locks here"}
        body={empty?.body}
        action={empty?.action}
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {locks.map((lock) => (
        <li key={lock.id} className="contents">
          <LockCard lock={lock} />
        </li>
      ))}
    </ul>
  );
}

/** Matches LockCard's shape, so arriving content does not shift the page. */
export function LockListSkeleton({count = 6}: {count?: number}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({length: count}, (_, i) => (
        <div key={i} className="flex flex-col gap-4 bg-surface p-4 shadow-[var(--shadow-1)]">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
