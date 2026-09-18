import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {allocationsFor} from "@/lib/airdrops/allocations";
import {releasedAtCreationOnChain} from "@/lib/airdrops/curve-onchain";
import {holdersOf} from "@/lib/airdrops/holders";
import {readClient} from "@/lib/locks/client";

/**
 * The first snapshot for a drip that does not exist yet.
 *
 * Creation is the one moment the contract cannot be asked how much it has released, because
 * there is nothing to ask. So the figure is computed here with a mirror of the contract's own
 * arithmetic (lib/airdrops/curve-onchain.ts) rather than with the app's model, which carries
 * more precision and would round differently. A root built from a figure one unit out is a root
 * nobody can claim against.
 *
 * Every root after this one is rebuilt from `releasedAt` on chain instead.
 */
export const dynamic = "force-dynamic";
// Pro allows 300s. A cold holder scan is the only thing here that needs more than a moment,
// and 60 put the cliff about a month into a token's life rather than several.
export const maxDuration = 300;

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const token = searchParams.get("token");
  const reserve = searchParams.get("reserve");
  const rateBps = searchParams.get("rateBps");
  const minimumHolding = searchParams.get("minimumHolding") ?? "0";

  if (!token || !isAddress(token)) {
    return NextResponse.json({error: "token must be an address"}, {status: 400});
  }
  if (!reserve || !/^\d+$/.test(reserve) || !rateBps || !/^\d+$/.test(rateBps)) {
    return NextResponse.json({error: "reserve and rateBps must be integers"}, {status: 400});
  }
  if (!/^\d+$/.test(minimumHolding)) {
    return NextResponse.json({error: "minimumHolding must be an integer"}, {status: 400});
  }

  try {
    const block = await readClient().getBlockNumber();
    const {balances} = await holdersOf(token, Number(block));
    // A share tree does not depend on how much has been released, so the delicate business of
    // mirroring the contract's curve before the drip exists is simply gone. The figure is kept
    // for the response because the form shows it.
    const released = releasedAtCreationOnChain(BigInt(reserve), Number(rateBps));
    const set = allocationsFor(balances, released, BigInt(minimumHolding));

    if (set.allocations.length === 0) {
      return NextResponse.json(
        {error: "No wallet holds enough of this token to qualify, so there is nobody to pay"},
        {status: 422},
      );
    }

    return NextResponse.json({
      root: set.root,
      snapshotBlock: block.toString(),
      released: released.toString(),
      eligibleSupply: set.eligibleSupply.toString(),
      eligibleHolders: set.eligibleHolders,
      dust: set.dust.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Could not read the holder set"},
      {status: 502},
    );
  }
}
