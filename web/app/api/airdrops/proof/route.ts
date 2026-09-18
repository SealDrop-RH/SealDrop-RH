import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {claimFor} from "@/lib/airdrops/allocations";
import {publishedTree} from "@/lib/airdrops/snapshot";

/**
 * One holder's leaf and Merkle proof for a drip.
 *
 * Rebuilt on demand rather than stored. The tree is a pure function of things that are already
 * public -- the drip's snapshot block, its threshold, its schedule, and the balances at that
 * block -- so keeping a copy would add a database whose only job is to agree with a
 * computation anyone can redo. If this route and the publisher ever disagreed, the proof would
 * simply fail against the root rather than pay out something wrong.
 */
export const dynamic = "force-dynamic";
// Pro allows 300s. A cold holder scan is the only thing here that needs more than a moment,
// and 60 put the cliff about a month into a token's life rather than several.
export const maxDuration = 300;

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const id = searchParams.get("id");
  const account = searchParams.get("account");

  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({error: "id must be a drip index"}, {status: 400});
  }
  if (!account || !isAddress(account)) {
    return NextResponse.json({error: "account must be an address"}, {status: 400});
  }

  try {
    const {drip, tree} = await publishedTree(BigInt(id));

    // Proof against the published root only. A tree that does not hash to what is on chain is
    // a tree built from different inputs, and handing back a proof from it would send someone
    // to sign a transaction that cannot succeed.
    if (tree.root.toLowerCase() !== drip.merkleRoot.toLowerCase()) {
      return NextResponse.json(
        {error: "The rebuilt snapshot does not match the published root", rebuilt: tree.root},
        {status: 409},
      );
    }

    // The facts about the snapshot are the same for everyone and are returned either way.
    // Only the leaf depends on who is asking, and a wallet that is not in the tree still needs
    // to be told what it is not part of: the page shows the size of the eligible set whether or
    // not the reader is in it, and an empty answer made every airdrop read "0 wallets".
    const claim = claimFor(tree.allocations, account);
    return NextResponse.json({
      amount: claim?.amount ?? "0",
      proof: claim?.proof ?? [],
      qualifies: Boolean(claim),
      root: tree.root,
      snapshotBlock: tree.snapshotBlock.toString(),
      eligibleSupply: tree.eligibleSupply.toString(),
      eligibleHolders: tree.eligibleHolders,
    });
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Could not rebuild the snapshot"},
      {status: 502},
    );
  }
}
