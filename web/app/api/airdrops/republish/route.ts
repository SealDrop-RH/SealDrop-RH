import {NextResponse} from "next/server";
import {readDrip, treeFor} from "@/lib/airdrops/snapshot";
import {readClient} from "@/lib/locks/client";

/**
 * The root a drip should be carrying right now.
 *
 * Computed here and signed in the browser, so a creator can hand over what has accrued without
 * anything on a server holding their key. The scheduled publisher does the same calculation
 * unattended for the drips it is allowed to touch; this is the same answer, on demand.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({error: "id must be a drip index"}, {status: 400});
  }

  try {
    const drip = await readDrip(BigInt(id));
    const head = await readClient().getBlockNumber();
    const set = await treeFor(BigInt(id), drip, head);

    if (set.allocations.length === 0) {
      return NextResponse.json({error: "Nobody qualifies yet, so there is no split to publish"}, {status: 422});
    }

    return NextResponse.json({
      root: set.root,
      snapshotBlock: head.toString(),
      released: set.released.toString(),
      holders: set.allocations.length,
      // The publish is pointless when it would commit to what is already committed to, and
      // saying so lets the caller skip a signature and a fee rather than discover it after.
      unchanged: set.root.toLowerCase() === drip.merkleRoot.toLowerCase(),
    });
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Could not work out the current split"},
      {status: 502},
    );
  }
}
