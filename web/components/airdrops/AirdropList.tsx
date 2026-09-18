"use client";

import Link from "next/link";
import {useAccount} from "wagmi";
import {AirdropCard} from "./AirdropCard";
import {Empty, buttonClass} from "@/components/ui/primitives";
import {useAirdrops, useClaimable} from "@/lib/hooks/useAirdrops";
import type {Allocation} from "@/lib/airdrops/types";

/**
 * Every airdrop, with this wallet's allocation folded in where there is one.
 *
 * Both queries run regardless of connection state and are joined here, so the list renders
 * for a visitor with no wallet and simply gains a personal figure once one appears.
 */
export function AirdropList() {
  const {isConnected} = useAccount();
  const {data: airdrops, isPending, isError, error} = useAirdrops();
  const {data: claimable} = useClaimable();

  const byId = new Map<string, Allocation>(
    (claimable ?? []).map((entry) => [entry.airdrop.id, entry.allocation]),
  );

  if (isPending) return <Empty title="Loading airdrops" />;

  // A query that failed is not a query that is still going. Without this the page showed
  // "Loading airdrops" indefinitely, which reads as a slow chain rather than as a feature
  // that is not wired up.
  if (isError) {
    return (
      <Empty
        title="Airdrops could not be loaded"
        body={error instanceof Error ? error.message : "The airdrops source did not answer."}
      />
    );
  }

  if (!airdrops || airdrops.length === 0) {
    return (
      <Empty
        title="No airdrops yet"
        body="An airdrop sends part of a supply to the people holding it, split by how much they hold."
        action={
          <Link href="/airdrops/new" className={buttonClass("primary", "sm")}>
            Create an airdrop
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {airdrops.map((airdrop) => (
        <li key={airdrop.id} className="contents">
          <AirdropCard airdrop={airdrop} allocation={isConnected ? byId.get(airdrop.id) : undefined} />
        </li>
      ))}
    </ul>
  );
}
