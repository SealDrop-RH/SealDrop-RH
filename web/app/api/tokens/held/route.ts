import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {explorerUrl} from "@/lib/chain";
import {tokensReceivedBy} from "@/lib/airdrops/wallet-tokens";

/**
 * The ERC-20s a wallet holds, for the token picker.
 *
 * Server-side because it is a third-party call whose CORS headers this chain's explorer sends
 * malformed, and because a browser holding an indexer key is a browser leaking one.
 *
 * Convenience only. Nothing downstream trusts this list: the address a person ends up with is
 * resolved against the chain the same way a pasted one is, so a wrong or stale row costs a
 * failed lookup rather than an airdrop funded against the wrong token.
 */
export const dynamic = "force-dynamic";

interface TokenRow {
  balance?: string;
  contractAddress?: string;
  decimals?: string;
  name?: string;
  symbol?: string;
  type?: string;
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({error: "address must be an address"}, {status: 400});
  }

  try {
    const response = await fetch(
      `${explorerUrl}/api?module=account&action=tokenlist&address=${address}`,
      {headers: {accept: "application/json"}, cache: "no-store"},
    );
    if (!response.ok) throw new Error(`The explorer answered ${response.status}`);
    // A challenge page is a 200 with HTML in it, which JSON.parse would turn into a crash
    // rather than a fallback.
    if (!(response.headers.get("content-type") ?? "").includes("json")) {
      throw new Error("The explorer answered a challenge page");
    }

    const body = (await response.json()) as {result?: TokenRow[]};
    const rows = Array.isArray(body.result) ? body.result : [];

    const tokens = rows
      // NFTs are not a supply anyone can be paid a share of.
      .filter((row) => (row.type ?? "ERC-20") === "ERC-20")
      .filter((row) => row.contractAddress && isAddress(row.contractAddress))
      .map((row) => ({
        address: row.contractAddress as `0x${string}`,
        symbol: row.symbol || "???",
        name: row.name || "Unknown token",
        decimals: Number(row.decimals ?? 18),
        balance: row.balance ?? "0",
      }))
      .filter((token) => {
        try {
          return BigInt(token.balance) > 0n;
        } catch {
          return false;
        }
      })
      // Largest holding first: the one someone means is usually the one they have most of.
      .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? 1 : -1));

    return NextResponse.json({tokens});
  } catch (explorerError) {
    // The indexer is the good answer where it exists. Where it does not -- this chain's
    // mainnet explorer answers a bot challenge -- the chain itself still knows what this
    // wallet has been sent, so ask it that instead of showing an empty picker.
    try {
      return NextResponse.json({tokens: await tokensReceivedBy(address), source: "chain"});
    } catch {
      return NextResponse.json({
        tokens: [],
        error: explorerError instanceof Error ? explorerError.message : "Could not list held tokens",
      });
    }
  }
}
