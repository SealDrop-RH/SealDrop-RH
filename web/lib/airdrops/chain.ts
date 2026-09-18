import {erc20Abi} from "viem";
import {activeChainId} from "@/lib/chain";
import {ponsDripAbi} from "@/lib/contracts/PonsDrip";
import {deploymentFor} from "@/lib/contracts/addresses";
import {readClient} from "@/lib/locks/client";
import {NotImplementedError, NothingToDoError} from "@/lib/locks/errors";
import {SHARE_SCALE} from "./allocations";
import {allocate, atTime} from "./derive";
import {isOperator} from "./operators";
import type {
  AdjustAirdropInput,
  Airdrop,
  AirdropTxHooks,
  AirdropsAdapter,
  Allocation,
  CreateAirdropInput,
} from "./types";
import type {Address, TokenMeta} from "@/lib/locks/types";

/**
 * Airdrops, read from and written to PonsDrip.
 *
 * The same AirdropsAdapter the mock implements, so nothing above this file changes: swapping
 * NEXT_PUBLIC_AIRDROPS_ADAPTER to "chain" is the whole migration. Writes arrive through the
 * WriteBridge because this is a plain module and cannot call wagmi hooks.
 *
 * Two things live off chain and are fetched rather than computed here. Who holds the token,
 * because no contract and no node can enumerate that; and a holder's proof, because rebuilding
 * the tree means talking to an indexer. Both come from this app's own API routes, which
 * rebuild them from public inputs rather than from a database.
 */

/**
 * The address the scheduled publisher signs with, nominated on every drip this app creates.
 *
 * Public on purpose: it is an address, not a key, and a holder reading the drip can see exactly
 * which wallet is allowed to restate the split.
 */
function publisherAddress(): Address {
  const configured = process.env.NEXT_PUBLIC_AIRDROP_PUBLISHER;
  return (configured && /^0x[0-9a-fA-F]{40}$/.test(configured)
    ? configured
    : "0x0000000000000000000000000000000000000000") as Address;
}

function contract(): Address {
  const deployment = deploymentFor(activeChainId);
  if (!deployment?.PonsDrip) {
    throw new NotImplementedError(
      `PonsDrip is not deployed on chain ${activeChainId}. Run contracts/script/DeployDrip.s.sol`,
    );
  }
  return deployment.PonsDrip;
}

/** The struct PonsDrip returns, before it becomes the app's Airdrop. */
interface OnChainDrip {
  creator: Address;
  token: Address;
  reserve: bigint;
  claimed: bigint;
  merkleRoot: `0x${string}`;
  snapshotBlock: bigint;
  minimumHolding: bigint;
  startsAt: bigint;
  stoppedAt: bigint;
  stoppedRelease: bigint;
  createdAt: bigint;
  rateBps: number;
  intervalSeconds: number;
  maxRounds: number;
  publisher: Address;
  revocable: boolean;
}

/** Token metadata is immutable, so one read per token per page load is enough. */
const tokenCache = new Map<string, TokenMeta>();

async function readToken(address: Address): Promise<TokenMeta | null> {
  const key = address.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit) return hit;

  try {
    const client = readClient();
    const [symbol, name, decimals, totalSupply] = await Promise.all([
      client.readContract({address, abi: erc20Abi, functionName: "symbol"}),
      client.readContract({address, abi: erc20Abi, functionName: "name"}),
      client.readContract({address, abi: erc20Abi, functionName: "decimals"}),
      client.readContract({address, abi: erc20Abi, functionName: "totalSupply"}),
    ]);
    const meta: TokenMeta = {address, symbol, name, decimals, totalSupply};
    tokenCache.set(key, meta);
    return meta;
  } catch {
    return null;
  }
}

/**
 * The eligible supply and holder count, from the same rebuild the proofs come from.
 *
 * Cached per drip per snapshot block: it costs an indexer round trip, it is the same answer
 * for everyone until the root moves, and a list of airdrops would otherwise make one call per
 * card.
 */
const snapshotCache = new Map<string, {eligibleSupply: bigint; eligibleHolders: number}>();

async function snapshotFacts(id: bigint, snapshotBlock: bigint, holder?: Address) {
  const key = `${id}:${snapshotBlock}`;
  const hit = snapshotCache.get(key);
  if (hit && !holder) return hit;

  // A relative URL has no origin to resolve against on the server. The figures are cosmetic
  // until a wallet is connected, and the browser fetches them a moment later, so a server
  // render says "not known yet" rather than throwing inside a page.
  if (typeof window === "undefined") return {eligibleSupply: 0n, eligibleHolders: 0};

  const account = holder ?? "0x0000000000000000000000000000000000000001";
  const response = await fetch(`/api/airdrops/proof?id=${id}&account=${account}`);
  if (!response.ok) return hit ?? {eligibleSupply: 0n, eligibleHolders: 0};

  const body = (await response.json()) as {eligibleSupply?: string; eligibleHolders?: number};
  const facts = {
    eligibleSupply: BigInt(body.eligibleSupply ?? "0"),
    eligibleHolders: body.eligibleHolders ?? 0,
  };
  snapshotCache.set(key, facts);
  return facts;
}

async function toAirdrop(index: bigint, raw: OnChainDrip): Promise<Airdrop | null> {
  const token = await readToken(raw.token);
  if (!token) return null;

  const facts = await snapshotFacts(index, raw.snapshotBlock).catch(() => ({
    eligibleSupply: 0n,
    eligibleHolders: 0,
  }));

  const airdrop: Airdrop = {
    id: String(index),
    token,
    creator: raw.creator,
    // Every drip made by this app is recurring; the schedule is what PonsDrip is for.
    kind: "recurring",
    reserve: raw.reserve,
    schedule: {
      rateBps: Number(raw.rateBps),
      intervalSeconds: Number(raw.intervalSeconds),
      maxRounds: Number(raw.maxRounds) || undefined,
    },
    stoppedAt: raw.stoppedAt > 0n ? Number(raw.stoppedAt) : undefined,
    withdrawn: raw.stoppedAt > 0n ? raw.reserve - raw.stoppedRelease : undefined,
    pool: 0n, // Filled in by atTime, which is the only thing that should set it.
    claimed: raw.claimed,
    minimumHolding: raw.minimumHolding,
    eligibleSupply: facts.eligibleSupply,
    eligibleHolders: facts.eligibleHolders,
    startsAt: Number(raw.startsAt),
    createdAt: Number(raw.createdAt),
    txHash: "0x",
    chainId: activeChainId,
    state: "live",
    // Never simulated. This one holds real tokens, and the watermark saying otherwise is what
    // tells a reader whether a proof is worth anything.
    simulated: false,
  };

  return atTime(airdrop, Math.floor(Date.now() / 1000));
}

async function readDrip(index: bigint): Promise<Airdrop | null> {
  const raw = (await readClient().readContract({
    address: contract(),
    abi: ponsDripAbi,
    functionName: "getDrip",
    args: [index],
  })) as unknown as OnChainDrip;
  return toAirdrop(index, raw);
}

export const chainAirdropsAdapter: AirdropsAdapter = {
  kind: "chain",

  async getAirdrop(id) {
    if (!/^\d+$/.test(id)) return null;
    try {
      return await readDrip(BigInt(id));
    } catch {
      return null;
    }
  },

  async listAirdrops(filter = {}) {
    const [page] = (await readClient().readContract({
      address: contract(),
      abi: ponsDripAbi,
      functionName: "latestDrips",
      args: [0n, BigInt(filter.limit ?? 50)],
    })) as unknown as [OnChainDrip[], bigint];

    const total = (await readClient().readContract({
      address: contract(),
      abi: ponsDripAbi,
      functionName: "dripCount",
    })) as bigint;

    // latestDrips walks backwards from the end, so index n of the page is total-1-n.
    const airdrops = await Promise.all(
      page.map((raw, offset) => toAirdrop(total - 1n - BigInt(offset), raw)),
    );

    let items = airdrops.filter((a): a is Airdrop => a !== null);
    if (filter.token) {
      const token = filter.token.toLowerCase();
      items = items.filter((a) => a.token.address.toLowerCase() === token);
    }
    if (filter.creator) {
      const creator = filter.creator.toLowerCase();
      items = items.filter((a) => a.creator.toLowerCase() === creator);
    }
    if (filter.state && filter.state !== "all") items = items.filter((a) => a.state === filter.state);
    if (filter.kind && filter.kind !== "all") items = items.filter((a) => a.kind === filter.kind);
    return items;
  },

  async allocationFor(id, holder) {
    const airdrop = await chainAirdropsAdapter.getAirdrop(id);
    if (!airdrop) return null;

    const claim = await fetchClaim(id, holder);
    const balance = await readClient()
      .readContract({
        address: airdrop.token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [holder],
      })
      .catch(() => 0n);

    const taken = (await readClient().readContract({
      address: contract(),
      abi: ponsDripAbi,
      functionName: "claimedBy",
      args: [BigInt(id), holder],
    })) as bigint;

    /*
      The leaf is a *share*, not an amount, so it has to be applied to the curve before it
      means anything in tokens: entitled = releasedAt(now) * share / SHARE_SCALE. Reading the
      leaf as though it were an amount put a wallet's percentage on the page dressed up as a
      token balance -- a 5.3% share showed as "0.05 PTEST owed" while the real figure was 19.6.

      Asked of the contract rather than worked out here, because the contract is what will
      actually pay, and it applies its own reading of the curve and its own record of what has
      been taken. Anything this file computed instead would be a second opinion, and the one
      that loses is the one on the screen.
    */
    const share = claim ? BigInt(claim.amount) : 0n;
    let claimable = 0n;
    let entitled = 0n;
    if (share > 0n) {
      claimable = (await readClient().readContract({
        address: contract(),
        abi: ponsDripAbi,
        functionName: "claimableOf",
        args: [BigInt(id), holder, share],
      })) as bigint;
      entitled = (airdrop.pool * share) / SHARE_SCALE;
    }

    const base = allocate(airdrop, balance as bigint, taken);
    return {
      ...base,
      qualifies: share > 0n || base.qualifies,
      share: Number((share * 1_000_000n) / SHARE_SCALE) / 1_000_000,
      shareScaled: share,
      amount: entitled,
      claimed: taken,
      claimable,
    };
  },

  async listClaimable(holder) {
    const airdrops = await chainAirdropsAdapter.listAirdrops({});
    return Promise.all(
      airdrops.map(async (airdrop) => ({
        airdrop,
        allocation: (await chainAirdropsAdapter.allocationFor(airdrop.id, holder)) as Allocation,
      })),
    );
  },

  async createAirdrop(input: CreateAirdropInput, {bridge, onStatus}: AirdropTxHooks) {
    if (!bridge?.account) throw new Error("Wallet not connected");
    if (input.kind !== "recurring" || !input.schedule) {
      throw new Error("PonsDrip only backs airdrops that pay out in rounds");
    }
    const drip = contract();

    onStatus("simulating", {});

    // The first root has to be built before the drip exists, from the holder set as it stands
    // now. Everything after this is rebuilt from the contract's own reading of the curve.
    const snapshot = await fetch(
      `/api/airdrops/snapshot?token=${input.token}&reserve=${input.reserve}` +
        `&rateBps=${input.schedule.rateBps}&minimumHolding=${input.minimumHolding}`,
    );
    const snapshotBody = (await snapshot.json()) as {
      root?: `0x${string}`;
      snapshotBlock?: string;
      error?: string;
    };
    if (!snapshot.ok || !snapshotBody.root) {
      throw new Error(snapshotBody.error ?? "Could not work out who holds this token");
    }

    // Approve only the shortfall. Re-approving an allowance that is already large enough is a
    // signature the person did not need to give and a fee they did not need to pay.
    const allowance = (await bridge.readErc20<bigint>(input.token, "allowance", [
      bridge.account,
      drip,
    ])) as bigint;
    if (allowance < input.reserve) {
      onStatus("signing", {});
      const approveHash = await bridge.write({
        address: input.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [drip, input.reserve],
      });
      onStatus("confirming", {hash: approveHash});
      const approval = await bridge.wait(approveHash);
      if (approval.status !== "success") throw new Error("The approval did not go through");
    }

    const request = {
      address: drip,
      abi: ponsDripAbi as readonly unknown[],
      functionName: "create",
      args: [
        input.token,
        input.reserve,
        snapshotBody.root,
        BigInt(snapshotBody.snapshotBlock ?? "0"),
        input.minimumHolding,
        input.schedule.rateBps,
        input.schedule.intervalSeconds,
        input.schedule.maxRounds ?? 0,
        // The wallet the scheduled job signs with. It may restate who holds the token and
        // nothing else: it cannot stop the drip, change a term, or move a token. Nominating it
        // here is what lets the holder set stay current without this creator's key living on a
        // server. Zero means nobody but the creator.
        publisherAddress(),
        // Whether this creator keeps the right to republish the root and stop it. The on-chain
        // form of lib/airdrops/operators.ts, and public, so holders can check it themselves.
        isOperator(input.creator),
      ],
    };

    // Simulated before signing, so a revert is a readable sentence rather than a wallet popup
    // the person pays for and then watches fail.
    await bridge.simulate(request);

    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("Creating the airdrop reverted on chain");

    const total = (await readClient().readContract({
      address: drip,
      abi: ponsDripAbi,
      functionName: "dripCount",
    })) as bigint;

    const created = await readDrip(total - 1n);
    if (!created) throw new Error("The airdrop was created but could not be read back");
    onStatus("success", {hash});
    return created;
  },

  /**
   * Republishes the split, signed by the creator in their own browser.
   *
   * The only movable part of a live drip is its root, and moving it hands holders whatever has
   * accrued since the last one. The scheduled job does this unattended, but only for drips its
   * own wallet created; every other creator needs a way to do it themselves, and this is it.
   * No server holds their key, and the figures come from the same calculation the job uses.
   *
   * Reserve, rate and interval are not touched: holders are already claiming against them.
   */
  async adjustAirdrop(input: AdjustAirdropInput, {bridge, onStatus}: AirdropTxHooks) {
    if (!bridge?.account) throw new Error("Wallet not connected");

    onStatus("simulating", {});
    const response = await fetch(`/api/airdrops/republish?id=${input.id}`);
    const body = (await response.json()) as {
      root?: `0x${string}`;
      snapshotBlock?: string;
      unchanged?: boolean;
      error?: string;
    };
    if (!response.ok || !body.root) {
      throw new Error(body.error ?? "Could not work out the current split");
    }
    if (body.unchanged) {
      throw new NothingToDoError(
        "The published split is already up to date. The scheduled job keeps it that way, so there was nothing to sign",
      );
    }

    const request = {
      address: contract(),
      abi: ponsDripAbi as readonly unknown[],
      functionName: "updateRoot",
      args: [BigInt(input.id), body.root, BigInt(body.snapshotBlock ?? "0")],
    };
    await bridge.simulate(request);

    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("Publishing the snapshot reverted on chain");

    const updated = await readDrip(BigInt(input.id));
    if (!updated) throw new Error("Published, but the airdrop could not be read back");
    onStatus("success", {hash});
    return updated;
  },

  async stopAirdrop(id, caller, {bridge, onStatus}: AirdropTxHooks) {
    if (!bridge?.account) throw new Error("Wallet not connected");
    const request = {
      address: contract(),
      abi: ponsDripAbi as readonly unknown[],
      functionName: "stop",
      args: [BigInt(id)],
    };

    onStatus("simulating", {});
    await bridge.simulate(request);
    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("Stopping the airdrop reverted on chain");

    const stopped = await readDrip(BigInt(id));
    if (!stopped) throw new Error("The airdrop was stopped but could not be read back");
    onStatus("success", {hash});
    return stopped;
  },

  async claim(id, holder, {bridge, onStatus}: AirdropTxHooks) {
    if (!bridge?.account) throw new Error("Wallet not connected");

    onStatus("simulating", {});
    const claim = await fetchClaim(id, holder);
    if (!claim) throw new Error("This wallet is not in the current snapshot, so there is nothing to prove");

    const request = {
      address: contract(),
      abi: ponsDripAbi as readonly unknown[],
      functionName: "claim",
      args: [BigInt(id), BigInt(claim.amount), claim.proof],
    };
    await bridge.simulate(request);

    onStatus("signing", {});
    const hash = await bridge.write(request);
    onStatus("confirming", {hash});
    const receipt = await bridge.wait(hash);
    if (receipt.status !== "success") throw new Error("The claim reverted on chain");
    onStatus("success", {hash});

    const allocation = await chainAirdropsAdapter.allocationFor(id, holder);
    if (!allocation) throw new Error("Claimed, but the allocation could not be read back");
    return allocation;
  },
};

interface ProofResponse {
  amount: string;
  proof: `0x${string}`[];
  qualifies: boolean;
}

async function fetchClaim(id: string, holder: Address): Promise<ProofResponse | null> {
  const response = await fetch(`/api/airdrops/proof?id=${id}&account=${holder}`);
  if (!response.ok) return null;
  const body = (await response.json()) as ProofResponse;
  return body.qualifies && BigInt(body.amount) > 0n ? body : null;
}
