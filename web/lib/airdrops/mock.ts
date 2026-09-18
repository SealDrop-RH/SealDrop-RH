import {activeChain, activeChainId} from "@/lib/chain";
import {getAdapter} from "@/lib/locks/adapter";
import {simulatedBalance} from "@/lib/locks/balance";
import {lockId} from "@/lib/locks/id";
import {readFault} from "@/lib/locks/faults";
import {ContractRevertError, UserRejectedError} from "@/lib/locks/errors";
import {seeded} from "@/lib/strip/rng";
import {fixtureAirdrops} from "./fixtures";
import {adjustability, allocate, atTime} from "./derive";
import {canStop} from "./operators";
import {heldBack, scheduleProblem} from "./schedule";
import {readClaimed, readLocalAirdrops, saveClaimed, saveLocalAirdrop} from "./store";
import type {AdjustAirdropInput, Airdrop, AirdropTxHooks, AirdropsAdapter} from "./types";
import type {Address, Hash} from "@/lib/locks/types";

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Cancelled"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Cancelled"));
    }, {once: true});
  });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Every airdrop, as of this instant.
 *
 * `atTime` rather than a state fixup: a recurring airdrop's claimable pool is a function of
 * the clock, so reading one has to mean reading it *now*. Stored records keep the reserve and
 * the schedule; what is claimable out of them is worked out here, on every read.
 */
function allAirdrops(): Airdrop[] {
  const now = nowSeconds();
  const local = readLocalAirdrops().map((a) => atTime(a, now));
  const seen = new Set(local.map((a) => a.id));
  return [...local, ...fixtureAirdrops(now).filter((a) => !seen.has(a.id))];
}

function deterministicHash(seed: string): Hash {
  const random = seeded(seed);
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += "0123456789abcdef"[Math.floor(random() * 16)];
  return out as Hash;
}

/** Walks the same TxStatus union the lock flow walks, so both feel like one product. */
async function simulateTx(hash: Hash, {onStatus, signal}: AirdropTxHooks): Promise<void> {
  const fault = readFault();

  onStatus("simulating", {});
  await wait(380, signal);
  if (fault === "wrong-network") {
    throw new Error(`Wrong network: switch your wallet to ${activeChain.name} (chain ${activeChainId})`);
  }
  if (fault === "revert") throw new ContractRevertError("PonsAirdrop: pool must be greater than zero");
  if (fault === "insufficient-gas") {
    throw new Error(
      "Not enough ETH. Your wallet needs about 0.00038 ETH to cover this transaction's gas budget and it holds 0.00009 ETH.",
    );
  }

  onStatus("signing", {});
  await wait(fault === "slow-sign" ? 9000 : 850, signal);
  if (fault === "reject") throw new UserRejectedError();

  onStatus("confirming", {hash});
  await wait(1100, signal);
  if (fault === "timeout") throw new Error("Transaction not confirmed after 60 seconds. It may still land.");
}

export const mockAirdropsAdapter: AirdropsAdapter = {
  kind: "mock",

  async getAirdrop(id) {
    return allAirdrops().find((a) => a.id === id) ?? null;
  },

  async listAirdrops(filter = {}) {
    let items = allAirdrops();
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

    // Soonest to open first, then the ones already open, then the spent ones. What a holder
    // wants from this list is "what is coming and what can I take now".
    const rank = (a: Airdrop) => (a.state === "live" ? 0 : a.state === "scheduled" ? 1 : 2);
    items = [...items].sort((a, b) => rank(a) - rank(b) || a.startsAt - b.startsAt);

    return filter.limit ? items.slice(0, filter.limit) : items;
  },

  async allocationFor(id, holder) {
    const airdrop = await mockAirdropsAdapter.getAirdrop(id);
    if (!airdrop) return null;
    return allocate(airdrop, simulatedBalance(holder, airdrop.token), readClaimed(id, holder));
  },

  async listClaimable(holder) {
    return allAirdrops().map((airdrop) => ({
      airdrop,
      allocation: allocate(airdrop, simulatedBalance(holder, airdrop.token), readClaimed(airdrop.id, holder)),
    }));
  },

  async createAirdrop(input, hooks) {
    const hash = deterministicHash(`${input.token}:${input.reserve}:${input.startsAt}:${input.creator}`);
    await simulateTx(hash, hooks);

    // Resolved through the locks adapter, which is the same seam the form's TokenField used
    // to resolve it in the first place. Reading the fixture list directly meant the two
    // disagreed whenever the adapters were not both mock: with locks on chain, every real
    // token resolved in the field and then failed here with "No token at that address", which
    // reads as the address being wrong when the address was fine.
    const token = await getAdapter().getToken(input.token);
    if (!token) throw new ContractRevertError(`No token at ${input.token} on ${activeChain.name}`);
    if (input.reserve <= 0n) throw new ContractRevertError("PonsAirdrop: pool must be greater than zero");

    // Checked here and not only in the form. A rule that lives in a disabled button is not a
    // rule, and this is the code path a scripted caller would take.
    const schedule = input.kind === "recurring" ? input.schedule : undefined;
    if (input.kind === "recurring" && !schedule) {
      throw new ContractRevertError("PonsAirdrop: a recurring airdrop needs a schedule");
    }
    if (schedule) {
      const bad = scheduleProblem(schedule);
      if (bad) throw new ContractRevertError(`PonsAirdrop: ${bad.charAt(0).toLowerCase()}${bad.slice(1)}`);
    }

    const random = seeded(`new-airdrop:${hash}`);
    const created: Airdrop = {
      id: `ad_${lockId(`${input.creator}:${input.token}:${input.startsAt}`).slice(3)}`,
      token,
      creator: input.creator,
      kind: input.kind,
      reserve: input.reserve,
      schedule,
      // Filled in by atTime on the way out; a stored value here would go stale by the next round.
      pool: 0n,
      claimed: 0n,
      minimumHolding: input.minimumHolding,
      // In part 2 this comes from a holder snapshot taken on chain. Here it is a plausible
      // share of supply, fixed at creation so the allocation a holder is shown does not
      // move underneath them.
      eligibleSupply: (token.totalSupply * BigInt(2_000 + Math.floor(random() * 3_000))) / 10_000n,
      eligibleHolders: 180 + Math.floor(random() * 4_000),
      startsAt: input.startsAt,
      createdAt: nowSeconds(),
      lockId: input.lockId,
      txHash: hash,
      chainId: activeChainId,
      state: "scheduled",
      note: input.note,
      simulated: true,
    };

    saveLocalAirdrop(created);
    hooks.onStatus("success", {hash});
    return atTime(created, nowSeconds());
  },

  async adjustAirdrop(input: AdjustAirdropInput, hooks) {
    const existing = await mockAirdropsAdapter.getAirdrop(input.id);
    if (!existing) throw new ContractRevertError("No airdrop with that id");

    // Enforced here, not only in the UI. A control that is merely hidden is not a rule.
    const can = adjustability(existing, existing.creator, nowSeconds());
    if (!can.allowed) throw new ContractRevertError(can.reason ?? "This airdrop can no longer be changed");

    const schedule = existing.kind === "recurring" ? (input.schedule ?? existing.schedule) : undefined;
    if (schedule) {
      const bad = scheduleProblem(schedule);
      if (bad) throw new ContractRevertError(`PonsAirdrop: ${bad.charAt(0).toLowerCase()}${bad.slice(1)}`);
    }

    const hash = deterministicHash(
      `adjust:${input.id}:${input.reserve}:${input.minimumHolding}:${input.startsAt}:${schedule?.rateBps}:${schedule?.intervalSeconds}`,
    );
    await simulateTx(hash, hooks);

    const next: Airdrop = {
      ...existing,
      reserve: input.reserve ?? existing.reserve,
      minimumHolding: input.minimumHolding ?? existing.minimumHolding,
      startsAt: input.startsAt ?? existing.startsAt,
      schedule,
    };

    saveLocalAirdrop(next);
    hooks.onStatus("success", {hash});
    return atTime(next, nowSeconds());
  },

  /**
   * Halt the schedule and hand the operator back what it never released.
   *
   * What has already been released is left exactly where it is. A holder whose entitlement
   * accrued before the stop is still owed it and can still take it, which is the line between
   * calling off the rest of a giveaway and taking back a giveaway. Only the wallets in
   * operators.ts can do this, and only to an airdrop they funded themselves.
   */
  async stopAirdrop(id, caller, hooks) {
    const airdrop = await mockAirdropsAdapter.getAirdrop(id);
    if (!airdrop) throw new ContractRevertError("No airdrop with that id");

    const allowed = canStop(airdrop, caller);
    if (!allowed.allowed) throw new ContractRevertError(allowed.reason ?? "This airdrop cannot be stopped");

    const now = nowSeconds();
    const returning = heldBack(airdrop, now);
    if (returning <= 0n) {
      throw new ContractRevertError("PonsAirdrop: nothing is being held back to take back");
    }

    const hash = deterministicHash(`stop:${id}:${caller}:${now}`);
    await simulateTx(hash, hooks);

    const stopped: Airdrop = {...airdrop, stoppedAt: now, withdrawn: returning};
    saveLocalAirdrop(stopped);
    hooks.onStatus("success", {hash});
    return atTime(stopped, nowSeconds());
  },

  async claim(id, holder, hooks) {
    const airdrop = await mockAirdropsAdapter.getAirdrop(id);
    if (!airdrop) throw new ContractRevertError("No airdrop with that id");
    // The opening date is the only thing that closes claiming. Not the airdrop's state, and
    // not where the schedule happens to be in its cycle: a wallet that is owed something can
    // always take it.
    if (nowSeconds() < airdrop.startsAt) {
      throw new ContractRevertError("PonsAirdrop: claiming has not opened yet");
    }

    const balance = simulatedBalance(holder, airdrop.token);
    const before = allocate(airdrop, balance, readClaimed(id, holder));
    if (!before.qualifies) throw new ContractRevertError("PonsAirdrop: balance below the minimum holding");
    if (before.claimable <= 0n) throw new ContractRevertError("PonsAirdrop: nothing to claim yet");

    // Keyed on what has been released, which on a drip moves every second, so two claims are
    // never the same transaction.
    const hash = deterministicHash(`claim:${id}:${holder}:${airdrop.pool}`);
    await simulateTx(hash, hooks);

    saveClaimed(id, holder, before.amount);
    // The reserve never moves on a claim; only what has been taken out of it does.
    saveLocalAirdrop({...airdrop, claimed: airdrop.claimed + before.claimable});
    hooks.onStatus("success", {hash});

    return allocate(airdrop, balance, before.amount);
  },
};

export type {Address};
