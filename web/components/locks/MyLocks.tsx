"use client";

import Link from "next/link";
import {useAccount} from "wagmi";
import {LockList, LockListSkeleton} from "./LockList";
import {Empty, buttonClass} from "@/components/ui/primitives";
import {useLocalLockSync, useLocksByOwner} from "@/lib/hooks/useLocks";

/**
 * Needs the connected address, so it is a client island rather than part of the server
 * page. The shell around it stays server-rendered.
 */
export function MyLocks() {
  const {address, isConnected} = useAccount();
  useLocalLockSync();
  const {data, isPending} = useLocksByOwner(address, {sort: "unlocking-soon", limit: 48});

  if (!isConnected) {
    return (
      <Empty
        title="Connect a wallet to see your locks"
        body="Nothing is signed in part 1. Every transaction here is simulated until the contract ships."
      />
    );
  }

  if (isPending) return <LockListSkeleton count={3} />;

  return (
    <LockList
      locks={data?.items ?? []}
      empty={{
        title: "This wallet has not locked anything yet",
        body: "Lock some supply and it will appear here with a countdown and a link you can share.",
        action: (
          <Link href="/lock" className={buttonClass("primary", "sm")}>
            Lock supply
          </Link>
        ),
      }}
    />
  );
}
