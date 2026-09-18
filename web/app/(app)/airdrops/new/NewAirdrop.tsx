"use client";

import {useSearchParams} from "next/navigation";
import {AirdropForm} from "@/components/airdrops/AirdropForm";

/**
 * Reads the lock this airdrop is being funded from, when the flow arrived here from a lock
 * that was just created, so the two records can point at each other.
 */
export function NewAirdrop() {
  const params = useSearchParams();
  return (
    <AirdropForm
      lockId={params.get("lock") ?? undefined}
      presetToken={params.get("token") ?? undefined}
    />
  );
}
