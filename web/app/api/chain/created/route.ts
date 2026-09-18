import {NextResponse} from "next/server";
import {creationTxs, type RecordKind} from "@/lib/chain/history";

/** The creating transaction of every lock or every airdrop, keyed by id, for list views. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "lock" && kind !== "airdrop") {
    return NextResponse.json({error: "kind must be lock or airdrop"}, {status: 400});
  }
  try {
    const txs = await creationTxs(kind as RecordKind);
    return NextResponse.json({txs}, {headers: {"cache-control": "public, s-maxage=30, stale-while-revalidate=120"}});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Could not read creation transactions"},
      {status: 502},
    );
  }
}
