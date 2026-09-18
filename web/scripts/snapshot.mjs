#!/usr/bin/env node
/**
 * Builds the allocation tree for an airdrop, from real Transfer logs.
 *
 * Reads every Transfer of a token up to a block, reconstructs balances, drops the wallets
 * under the minimum, splits the pool across the rest, and writes a JSON file containing the
 * Merkle root, every allocation and every proof.
 *
 * The root goes on chain. The rest of the file is what serves claims, and anyone can rebuild
 * it from the same block and check that the root matches: that is the whole point of storing
 * `snapshotBlock` in the contract.
 *
 * Usage:
 *   node scripts/snapshot.mjs --token 0x... --pool 1000000 --min 1000 [--block latest]
 *                              [--exclude 0xaaa,0xbbb] [--from N] [--chunk N]
 *
 * Locked supply, burn addresses and this project's own contracts are excluded automatically.
 *
 * Amounts are given in whole tokens and scaled by the token's own decimals.
 */
import {createPublicClient, http, erc20Abi} from "viem";
import {writeFileSync, mkdirSync, readFileSync, existsSync} from "node:fs";
import {StandardMerkleTree} from "@openzeppelin/merkle-tree";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]?.startsWith("--") ? "true" : all[i + 1]]);
    return pairs;
  }, []),
);

const RPC = args.rpc ?? process.env.RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const token = args.token;
if (!token) {
  console.error("usage: node scripts/snapshot.mjs --token 0x... --pool <whole tokens> --min <whole tokens>");
  process.exit(1);
}

const client = createPublicClient({transport: http(RPC)});
const chainId = await client.getChainId();
const latest = await client.getBlockNumber();
const snapshotBlock = args.block && args.block !== "latest" ? BigInt(args.block) : latest;

const [symbol, decimals] = await Promise.all([
  client.readContract({address: token, abi: erc20Abi, functionName: "symbol"}),
  client.readContract({address: token, abi: erc20Abi, functionName: "decimals"}),
]);

/**
 * Addresses that hold the token but are not holders.
 *
 * The first run of this tool against a real token found two "holders", and one of them was
 * PonsLock: supply someone had deliberately locked. Allocating an airdrop to a lock contract
 * sends tokens to an address with no way to claim them, and takes that share away from the
 * people the drop was for. Locked supply is the opposite of circulating supply, which is the
 * thing an airdrop is dividing.
 *
 * Burn addresses go for the same reason, and the airdrop contract itself would otherwise be
 * allocated part of the pool it is holding.
 */
const BURN = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
];

const excluded = new Set(BURN);
// Our own contracts on this chain, read from the deploy record rather than pasted.
const deployment = `../contracts/deployments/${chainId}.json`;
if (existsSync(deployment)) {
  const d = JSON.parse(readFileSync(deployment, "utf8"));
  for (const key of ["PonsLock", "PonsAirdrop"]) {
    if (d[key]) excluded.add(d[key].toLowerCase());
  }
}
for (const extra of (args.exclude ?? "").split(",").filter(Boolean)) {
  excluded.add(extra.trim().toLowerCase());
}

const scale = 10n ** BigInt(decimals);
const pool = BigInt(Math.round(Number(args.pool ?? 0) * 1e6)) * scale / 1_000_000n;
const minimumHolding = BigInt(Math.round(Number(args.min ?? 0) * 1e6)) * scale / 1_000_000n;

console.log(`token           ${symbol} (${token})`);
console.log(`chain           ${chainId}`);
console.log(`snapshot block  ${snapshotBlock}${snapshotBlock === latest ? " (latest)" : ""}`);
console.log(`pool            ${args.pool ?? 0} ${symbol}`);
console.log(`minimum holding ${args.min ?? 0} ${symbol}`);
console.log("");

/* ---- replay Transfer logs ---- */

const TRANSFER = {
  type: "event",
  name: "Transfer",
  inputs: [
    {indexed: true, name: "from", type: "address"},
    {indexed: true, name: "to", type: "address"},
    {indexed: false, name: "value", type: "uint256"},
  ],
};
const ZERO = "0x0000000000000000000000000000000000000000";

const balances = new Map();
const credit = (who, amount) => {
  if (who.toLowerCase() === ZERO) return;
  const key = who.toLowerCase();
  balances.set(key, (balances.get(key) ?? 0n) + amount);
};

let chunk = BigInt(args.chunk ?? 50_000);
let cursor = BigInt(args.from ?? 0);
let transfers = 0;

while (cursor <= snapshotBlock) {
  const end = cursor + chunk - 1n > snapshotBlock ? snapshotBlock : cursor + chunk - 1n;
  let logs;
  try {
    logs = await client.getLogs({address: token, event: TRANSFER, fromBlock: cursor, toBlock: end});
  } catch (error) {
    // Usually "too many results" or "range too wide". The cap is rarely documented, so it
    // is discovered by halving rather than guessed at.
    if (chunk > 1_000n) {
      chunk /= 2n;
      continue;
    }
    throw error;
  }

  for (const log of logs) {
    credit(log.args.from, -log.args.value);
    credit(log.args.to, log.args.value);
    transfers += 1;
  }

  const pct = Number((end * 100n) / (snapshotBlock || 1n));
  process.stdout.write(`\r  scanned to ${end} (${pct}%)  ${transfers} transfers  ${balances.size} addresses`);
  cursor = end + 1n;
  if (chunk < BigInt(args.chunk ?? 50_000)) chunk *= 2n;
}
process.stdout.write("\n\n");

for (const [account, balance] of balances) {
  if (balance <= 0n) balances.delete(account);
}

const removed = [];
for (const address of excluded) {
  const held = balances.get(address);
  if (held !== undefined) {
    removed.push([address, held]);
    balances.delete(address);
  }
}
if (removed.length > 0) {
  console.log("excluded from the snapshot:");
  for (const [address, held] of removed) {
    const label = address === BURN[0] ? "zero address" : address === BURN[1] ? "burn address" : "contract";
    console.log(`  ${address}  ${(Number(held) / Number(scale)).toLocaleString("en-US")} ${symbol}  (${label})`);
  }
  console.log("");
}

/* ---- allocate ---- */

const qualifying = [...balances.entries()]
  .filter(([, b]) => b > 0n && b >= minimumHolding)
  // Sorted, so the same balances always give the same tree and therefore the same root.
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const eligibleSupply = qualifying.reduce((sum, [, b]) => sum + b, 0n);
if (eligibleSupply === 0n) {
  console.error("Nobody clears the minimum holding. Lower it, or pick a different block.");
  process.exit(1);
}

let handed = 0n;
const allocations = [];
for (const [account, balance] of qualifying) {
  // Multiply before dividing: the other order floors every small holder to zero.
  const amount = (pool * balance) / eligibleSupply;
  if (amount === 0n) continue;
  handed += amount;
  allocations.push({account, amount: amount.toString()});
}

const tree = StandardMerkleTree.of(allocations.map((a) => [a.account, a.amount]), ["address", "uint256"]);
const proofs = {};
for (const [index, value] of tree.entries()) proofs[String(value[0]).toLowerCase()] = tree.getProof(index);

const snapshot = {
  token,
  symbol,
  decimals,
  chainId,
  snapshotBlock: Number(snapshotBlock),
  pool: pool.toString(),
  minimumHolding: minimumHolding.toString(),
  eligibleSupply: eligibleSupply.toString(),
  eligibleHolders: allocations.length,
  excluded: [...excluded],
  root: tree.root,
  dust: (pool - handed).toString(),
  allocations,
  proofs,
};

mkdirSync("snapshots", {recursive: true});
const path = `snapshots/${chainId}-${token.toLowerCase()}-${snapshotBlock}.json`;
writeFileSync(path, JSON.stringify(snapshot, null, 2));

const whole = (v) => (Number(v) / Number(scale)).toLocaleString("en-US", {maximumFractionDigits: 4});

console.log(`holders found      ${balances.size}`);
console.log(`clearing the bar   ${allocations.length}`);
console.log(`eligible supply    ${whole(eligibleSupply)} ${symbol}`);
console.log(`dust left over     ${whole(pool - handed)} ${symbol}  (reclaimable after the deadline)`);
console.log("");
console.log(`root               ${tree.root}`);
console.log(`snapshot block     ${snapshotBlock}`);
console.log(`written            ${path}`);
console.log("");
console.log("Create the airdrop with:");
console.log(`  cast send <PonsAirdrop> "create(address,uint256,bytes32,uint64,uint64,uint64)" \\`);
console.log(`    ${token} ${pool} ${tree.root} ${snapshotBlock} <startsAt> <reclaimableAt>`);
