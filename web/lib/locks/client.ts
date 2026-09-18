import {createPublicClient, http, type PublicClient} from "viem";
import {activeChain, publicRpcUrl} from "@/lib/chain";

/**
 * A read-only client for the chain adapters.
 *
 * Created here rather than taken from wagmi, because the adapters are plain modules that run
 * on the server as well as in the browser: a server component rendering a proof page has no
 * wagmi provider and still has to read the lock. Writes go through the WriteBridge, which is
 * where a wallet is genuinely needed.
 *
 * Batched, so a page rendering twenty locks makes one multicall rather than twenty requests.
 */
let cached: PublicClient | null = null;

export function readClient(): PublicClient {
  cached ??= createPublicClient({
    chain: activeChain,
    // A minute, not viem's ten seconds. Replaying a busy token's whole Transfer history means
    // eth_getLogs calls that genuinely take half a minute on this node, and the default made
    // them look like network failures and abandoned the scan.
    transport: http(publicRpcUrl, {batch: true, timeout: 60_000, retryCount: 2}),
  });
  return cached;
}
