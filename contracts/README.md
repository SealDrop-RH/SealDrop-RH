# SealDrop contracts

Two contracts, no owner between them.

| | |
| --- | --- |
| `PonsLock` | Holds ERC-20 supply until a date its owner chose |
| `PonsAirdrop` | Distributes a slice of a supply to holders, by Merkle proof |

## Running the tests

```bash
./deps.sh          # pinned forge-std v1.16.2 + openzeppelin v5.7.0
forge test         # 39 tests, including fuzz
forge test -vvv    # with traces
```

## Deploying

```bash
cp .env.example .env     # fill in PRIVATE_KEY
source .env

# 1. Prove the chain supports transient storage. A few cents, and the only way to find
#    out before a withdrawal reverts on someone.
forge script script/TstoreCanary.s.sol:TstoreCanary --rpc-url robinhood_testnet --broadcast

# 2. Deploy. Writes deployments/<chainId>.json.
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_testnet --broadcast --verify
```

Swap `robinhood_testnet` for `robinhood` for mainnet. Use a different key there.

```bash
# 3. Copy the ABIs and addresses into the web app. Generated, never pasted.
node script/export-abi.mjs
```

## Live on testnet

| | |
| --- | --- |
| Chain | Robinhood Chain testnet, 46630 |
| `PonsLock` | `0x0B2B9B3D465c28F198729661A1B09F113D2CDd26` |
| `PonsAirdrop` | `0x74B04279dd9686FEF8E8F6a07A523bEab511504c` |
| Deployed at L2 block | 119908921 |

Both verified on Blockscout. Total deploy cost: about 0.000024 ETH.

**`deployedAtBlock` is the L2 height, not `block.number`.** The deploy script originally
recorded `block.number` and wrote 11710135, while the chain was at 119908921: an Orbit chain
reports the Ethereum L1 height there. An indexer starting from the wrong one would scan a
hundred and eight million empty blocks before reaching the first event. `src/ArbSys.sol` reads
the real height from the precompile at `0x64`.

## Three things about Robinhood Chain that shaped this

**`block.timestamp` is the only usable clock.** `block.number` reports the L1 height, not
this chain's, so every deadline here is a timestamp. The `block-timestamp` lint is disabled
in `foundry.toml` for that reason rather than out of laziness.

**Transient storage is load-bearing.** `ReentrancyGuardTransient` is built entirely on
TSTORE/TLOAD. On a chain without EIP-1153 it does not fail to deploy, it silently bricks
every guarded function. `script/TstoreCanary.s.sol` proves support before anything holds
money, and `Deploy.s.sol` re-checks it inline. Confirmed working on testnet 46630.

**`via_ir` caches `block.timestamp`.** Correct inside a transaction, where it cannot change.
It also means re-reading `block.timestamp` after `vm.warp` in a test gives the pre-warp
value, so expectations are built from named variables rather than re-read. Three tests
failed this way before it was understood.

## What the contracts deliberately cannot do

- **No owner, no admin, no pause.** Neither contract has a privileged address, so there is
  nothing to compromise. `test_deployerHasNoPowerOverALock` and
  `test_deployerHasNoPowerOverAPool` assert the absence.
- **No early exit.** There is no path that returns a lock before `unlockAt`.
- **Dates only move later.** `extend` reverts on any value at or below the current one, so a
  lock can become stronger and never weaker. That is what makes a proof link mean something.
- **Airdrop terms freeze when claiming opens.** A creator can change the pool, the root and
  the start time, but only before `startsAt`. After that holders have relied on them.

## Why the airdrop uses a Merkle root

A contract cannot enumerate the holders of an ERC-20. Reading `balanceOf(msg.sender)` at
claim time is the obvious shortcut and it is unsafe: a caller can flash-loan a large balance,
claim against it and repay in one transaction, taking a share they never held.

So balances are snapshotted off-chain at a chosen block, each wallet's cut is computed there,
and only the root goes on chain. `snapshotBlock` is stored so anyone can rebuild the tree and
check the root themselves.

Leaves are `keccak256(bytes.concat(keccak256(abi.encode(account, amount))))`. The double hash
stops an internal node being replayed as a leaf.

`test_claim_isUnaffectedByBuyingAfterTheSnapshot` is the test that pins this: a wallet that
buys a huge balance after the snapshot still gets nothing.
