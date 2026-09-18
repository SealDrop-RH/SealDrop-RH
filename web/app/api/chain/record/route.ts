import {NextResponse} from "next/server";
import {historyFor, verificationOf, type RecordKind} from "@/lib/chain/history";

/**
 * Everything needed to check one lock or airdrop against the chain: the contract, whether its
 * published source is the deployed code, the creating transaction, and what has happened since.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  if ((kind !== "lock" && kind !== "airdrop") || id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({error: "kind must be lock or airdrop, and id a record index"}, {status: 400});
  }

  try {
    const history = await historyFor(kind as RecordKind, BigInt(id));
    const verification = await verificationOf(history.contract);
    return NextResponse.json(
      {...history, verification},
      // Shared caches may hold it briefly: a payout lands at most once a minute.
      {headers: {"cache-control": "public, s-maxage=15, stale-while-revalidate=45"}},
    );
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Could not read the record from the chain"},
      {status: 502},
    );
  }
}
