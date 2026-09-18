import "server-only";
import {createWalletClient, formatEther, http, publicActions} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {activeChain, publicRpcUrl} from "@/lib/chain";
import {ponsDripAbi} from "@/lib/contracts/PonsDrip";
import {readClient} from "@/lib/locks/client";
import {payoutFor, type AllocationSet} from "./allocations";
import {proofsFor} from "./merkle";
import {dripAddress, readDrip, releasedAt, treeFor, type DripOnChain} from "./snapshot";
import type {Address} from "@/lib/locks/types";

/**
 * The keeper: keeps every drip's holder set current, and sends holders what they are owed.
 *
 * Two jobs, run in that order for each drip.
 *
 * Republishing the split, so people who buy or sell after the last snapshot get counted. Since
 * leaves carry shares rather than amounts, nothing depends on this for correctness: if it stops,
 * holders keep being owed on the shares last published rather than being cut off.
 *
 * Paying out. Holders do not connect a wallet or claim; this sends each qualifying wallet its
 * share of whatever the schedule has released since the last payout, through `distribute`. The
 * contract still refuses to pay anyone past their own entitlement or past its curve, so the most
 * this job can get wrong is timing. `claim` stays on the contract as the way to be paid if the
 * job ever stops running.
 *
 * It needs a key, and that is worth being plain about. The nominated publisher may restate who
 * holds what and deliver what is owed. It cannot stop a drip, change a term, or send a token to
 * an account the tree does not name, all enforced on chain. A leaked key could still misstate the
 * split, so it belongs in a secret store, in a wallet that holds only gas and does nothing else.
 */

export interface PayoutOutcome {
  action: "paid" | "waiting" | "skipped";
  reason?: string;
  /** Wallets sent something by this run. */
  accounts?: number;
  /** Total sent, in the token's smallest unit, as a decimal string. */
  amount?: string;
  hashes?: `0x${string}`[];
}

export interface PublishOutcome {
  id: string;
  action: "published" | "unchanged" | "skipped";
  reason?: string;
  root?: `0x${string}`;
  snapshotBlock?: string;
  hash?: `0x${string}`;
  holders?: number;
  payout?: PayoutOutcome;
}

/**
 * Holders per `distribute` call.
 *
 * Measured in the contract tests: about 63k gas a holder on a first payout, when every storage
 * slot is new, and 26k after. A hundred is 6.3M at worst, well inside a block, and small enough
 * that one failed batch does not hold up everybody else's.
 */
const BATCH = 100;
/** Reads of `claimedBy` per round trip. The batching transport folds each chunk into one request. */
const READ_CHUNK = 200;

function signer() {
  const key = process.env.AIRDROP_PUBLISHER_KEY;
  if (!key) return null;
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  return createWalletClient({account, chain: activeChain, transport: http(publicRpcUrl)}).extend(
    publicActions,
  );
}

type Keeper = NonNullable<ReturnType<typeof signer>>;

/**
 * The creator, or the publisher they nominated when they created it. Nominating is what lets
 * this run for drips made from someone else's browser without their key being anywhere near
 * this process.
 */
function controls(drip: DripOnChain, wallet: string): boolean {
  const me = wallet.toLowerCase();
  return drip.creator.toLowerCase() === me || (drip.publisher ?? "").toLowerCase() === me;
}

/** Whether the split may still be restated. Payouts do not need this; republishing does. */
function republishable(drip: DripOnChain): {ok: boolean; reason?: string} {
  if (drip.stoppedAt > 0n) return {ok: false, reason: "stopped"};
  // A drip that promised its holders a fixed split is not something this job gets to reopen.
  if (!drip.revocable) return {ok: false, reason: "not revocable, its split is fixed for ever"};
  return {ok: true};
}

interface Due {
  released: bigint;
  /** Released and not yet paid to anyone: the most any payout can send. */
  room: bigint;
  /** What the next interval will release. Zero once the schedule has stopped or run out. */
  round: bigint;
  due: boolean;
  reason?: string;
}

/**
 * Whether a payout is worth a transaction yet.
 *
 * Cheap, and deliberately asked before anything expensive: a stopped drip that has paid out has
 * nothing to do, and finding that out should not cost a scan of the token's history.
 *
 * A running drip waits until at least half a round has built up. Waiting for a whole one would
 * miss by seconds whenever this job runs on the same cadence as the drip, because the last
 * payout landed a little after its run started, and the drip would then be paid every other run.
 * Half means a drip is paid no more than twice a round, not in a sliver every minute.
 */
async function dueNow(id: bigint, drip: DripOnChain, now: bigint): Promise<Due> {
  const [released, ahead] = await Promise.all([
    releasedAt(id, now),
    releasedAt(id, now + BigInt(drip.intervalSeconds)),
  ]);
  const room = released > drip.claimed ? released - drip.claimed : 0n;
  const round = ahead > released ? ahead - released : 0n;

  if (room === 0n) return {released, room, round, due: false, reason: "everything released has been paid"};
  if (round > 0n && room * 2n < round) {
    return {released, room, round, due: false, reason: "less than half a round has built up since the last payout"};
  }
  // Nothing more will ever be released. What integer division left behind is not worth a fee.
  if (round === 0n && room * 1_000_000n < released) {
    return {released, room, round, due: false, reason: "only rounding dust is left"};
  }
  return {released, room, round, due: true};
}

/** What each holder in the tree is sent this time. The rule itself is `payoutFor`. */
async function payoutsFor(
  id: bigint,
  set: AllocationSet,
  due: Due,
): Promise<Array<{account: Address; share: bigint; amount: bigint}>> {
  const client = readClient();
  const address = dripAddress();
  const accounts = set.allocations.map((a) => a.account);

  const taken: bigint[] = [];
  for (let i = 0; i < accounts.length; i += READ_CHUNK) {
    const chunk = accounts.slice(i, i + READ_CHUNK);
    taken.push(
      ...((await Promise.all(
        chunk.map((account) =>
          client.readContract({address, abi: ponsDripAbi, functionName: "claimedBy", args: [id, account]}),
        ),
      )) as bigint[]),
    );
  }

  const settling = due.round === 0n;
  return set.allocations
    .map((allocation, index) => {
      const share = BigInt(allocation.amount);
      const amount = payoutFor({released: due.released, room: due.room, share, taken: taken[index], settling});
      return {account: allocation.account, share, amount};
    })
    .filter((payout) => payout.amount > 0n)
    // Largest first, so if the keeper runs out of gas or time partway, the most goes out.
    .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
}

async function payOut(
  wallet: Keeper,
  id: bigint,
  set: AllocationSet,
  due: Due,
  claimedAtStart: bigint,
): Promise<PayoutOutcome> {
  const address = dripAddress();
  const payouts = await payoutsFor(id, set, due);
  if (payouts.length === 0) return {action: "waiting", reason: "nobody in the split is owed anything yet"};

  const proofs = proofsFor(set.allocations);
  const hashes: `0x${string}`[] = [];
  let accounts = 0;
  let amount = 0n;
  // What the drip had paid out when these amounts were worked out, moved on only by this run's
  // own batches. Anything else moving it means an overlapping run got there first.
  let expected = claimedAtStart;

  for (let i = 0; i < payouts.length; i += BATCH) {
    // Runs overlap when one takes longer than the minute between them. The contract would never
    // pay anyone twice, but a second run sending amounts worked out before the first run paid
    // would spend a fee to deliver slivers. Checked as late as possible, just before sending.
    const before = (await readDrip(id)).claimed;
    if (before !== expected) {
      return {
        action: hashes.length ? "paid" : "skipped",
        reason: "another keeper run paid this drip in the meantime",
        accounts,
        amount: amount.toString(),
        hashes,
      };
    }

    const batch = payouts.slice(i, i + BATCH);
    const args = [
      id,
      set.root,
      batch.map((p) => p.account),
      batch.map((p) => p.share),
      batch.map((p) => proofs.get(p.account.toLowerCase()) ?? []),
      batch.map((p) => p.amount),
    ] as const;

    try {
      // The estimate doubles as a dry run: a batch the contract would refuse fails here, for
      // free, rather than on chain for a fee.
      const gas = await wallet.estimateContractGas({address, abi: ponsDripAbi, functionName: "distribute", args});
      const [price, balance] = await Promise.all([
        wallet.getGasPrice(),
        wallet.getBalance({address: wallet.account.address}),
      ]);
      // Headroom on the estimate: on this chain part of the fee follows L1 prices, which can
      // move between the estimate and the block.
      const limit = (gas * 13n) / 10n;
      if (balance < limit * price) {
        return {
          action: hashes.length ? "paid" : "skipped",
          reason: `the keeper wallet ${wallet.account.address} needs gas: it holds ${formatEther(balance)} ETH and this batch needs about ${formatEther(limit * price)}`,
          accounts,
          amount: amount.toString(),
          hashes,
        };
      }

      const hash = await wallet.writeContract({address, abi: ponsDripAbi, functionName: "distribute", args, gas: limit});
      const receipt = await wallet.waitForTransactionReceipt({hash});
      hashes.push(hash);
      if (receipt.status !== "success") {
        return {action: "paid", reason: `batch ${hash} reverted`, accounts, amount: amount.toString(), hashes};
      }
      accounts += batch.length;
      amount += batch.reduce((sum, p) => sum + p.amount, 0n);
      expected = (await readDrip(id)).claimed;
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : "the payout failed";
      return {
        action: hashes.length ? "paid" : "skipped",
        // Two overlapping runs that pass the check above in the same instant collide on the
        // keeper's nonce, and the node refuses the second before it is broadcast. Nothing was
        // sent and nothing was spent; the other run is the one paying.
        reason: /nonce/i.test(message) ? "another keeper run sent this payout at the same moment" : message,
        accounts,
        amount: amount.toString(),
        hashes,
      };
    }
  }

  return {action: "paid", accounts, amount: amount.toString(), hashes};
}

export async function publishAll(limit = 50): Promise<PublishOutcome[]> {
  const wallet = signer();
  if (!wallet) return [{id: "-", action: "skipped", reason: "AIRDROP_PUBLISHER_KEY is not set"}];

  const address = dripAddress();
  const client = readClient();
  const total = (await client.readContract({
    address,
    abi: ponsDripAbi,
    functionName: "dripCount",
  })) as bigint;

  const head = await client.getBlock();
  const outcomes: PublishOutcome[] = [];
  const first = total > BigInt(limit) ? total - BigInt(limit) : 0n;

  for (let id = first; id < total; id += 1n) {
    const outcome: PublishOutcome = {id: id.toString(), action: "skipped"};
    outcomes.push(outcome);

    try {
      const drip = await readDrip(id);
      if (!controls(drip, wallet.account.address)) {
        outcome.reason = "this wallet is neither its creator nor its nominated publisher";
        continue;
      }

      // The tree the payout is built from has to be the one on chain at the moment it is sent,
      // or every proof in the batch fails. Null until one is known to match.
      let current: AllocationSet | null = null;
      const allowed = republishable(drip);

      if (allowed.ok) {
        // Built by the same function the proof route rebuilds with. They were briefly two
        // different calculations, and a root nobody could produce a matching proof against is a
        // drip nobody can be paid from.
        const set = await treeFor(id, drip, head.number);
        if (set.allocations.length === 0) {
          outcome.reason = "nobody qualifies yet";
        } else if (set.root.toLowerCase() === drip.merkleRoot.toLowerCase()) {
          // Nothing has moved: no transaction, no fee. On a quiet drip this is most runs.
          Object.assign(outcome, {action: "unchanged", root: set.root});
          current = set;
        } else {
          // An overlapping run may have published while this one was scanning. If it published
          // this same split there is nothing to send; if it published another, this run's view
          // is the older one and it stands down rather than overwrite a newer snapshot.
          const onChain = (await readDrip(id)).merkleRoot.toLowerCase();
          if (onChain === set.root.toLowerCase()) {
            Object.assign(outcome, {action: "unchanged", root: set.root});
            current = set;
          } else if (onChain !== drip.merkleRoot.toLowerCase()) {
            outcome.reason = "another keeper run republished this drip in the meantime";
            continue;
          } else {
            const hash = await wallet.writeContract({
              address,
              abi: ponsDripAbi,
              functionName: "updateRoot",
              args: [id, set.root, head.number],
            });
            await wallet.waitForTransactionReceipt({hash});
            Object.assign(outcome, {
              action: "published",
              root: set.root,
              snapshotBlock: head.number.toString(),
              hash,
              holders: set.allocations.length,
            });
            current = set;
          }
        }
      } else {
        outcome.reason = allowed.reason;
      }

      const due = await dueNow(id, drip, head.timestamp);
      if (!due.due) {
        outcome.payout = {action: "waiting", reason: due.reason};
        continue;
      }

      if (!current) {
        // Stopped or fixed: the split is whatever was last published, rebuilt at its own block.
        // Only reached when something is actually owed, because this is a scan of history.
        const published = await treeFor(id, drip, drip.snapshotBlock);
        if (published.root.toLowerCase() !== drip.merkleRoot.toLowerCase()) {
          outcome.payout = {
            action: "skipped",
            reason: "the published split could not be rebuilt, so there are no proofs to pay with",
          };
          continue;
        }
        current = published;
      }

      outcome.payout = await payOut(wallet, id, current, due, drip.claimed);
    } catch (error) {
      outcome.reason = error instanceof Error ? error.message.split("\n")[0] : "failed";
    }
  }

  return outcomes;
}
