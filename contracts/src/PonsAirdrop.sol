// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title PonsAirdrop
/// @notice Distributes a slice of a token's supply to the wallets holding it, pro rata.
///
/// @dev Allocations come from a Merkle root, not from a balance read at claim time.
///
/// A contract cannot enumerate the holders of an ERC-20, so "split the pool by how much
/// everyone holds" has to be decided somewhere. Reading `balanceOf(msg.sender)` when the
/// claim arrives is the obvious shortcut and it is unsafe: a caller can flash-loan a large
/// balance, claim against it and repay in one transaction, taking a share of the pool they
/// never held. Even without a flash loan, buying before claiming and selling afterwards is
/// free money out of everyone else's allocation.
///
/// So balances are snapshotted off-chain at a chosen block, each wallet's cut is computed
/// there, and only the root of that tree goes on chain. A holder proves their leaf when they
/// claim. The snapshot is fixed, so nothing anyone does after it changes what they get.
///
/// Leaves are `keccak256(bytes.concat(keccak256(abi.encode(account, amount))))`. The double
/// hash is the standard defence against a second-preimage attack, where an internal node of
/// the tree is passed off as a leaf.
///
/// What this contract deliberately cannot do:
///  - There is no owner and no admin. Nobody can move a funded pool except its claimants.
///  - Terms freeze when claiming opens. A creator can change the pool, the root and the
///    start time, but only before `startsAt`, because after it holders have relied on them.
///  - Unclaimed tokens return to the creator only after `reclaimableAt`, which is set at
///    creation and cannot be brought forward.
contract PonsAirdrop is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Airdrop {
        address creator;
        address token;
        /// @dev Actually received, so a fee-on-transfer token cannot promise more than it funded.
        uint256 pool;
        uint256 claimed;
        /// @notice Root of the allocation tree for the snapshot.
        bytes32 merkleRoot;
        /// @notice The snapshot's block, recorded so anyone can rebuild the tree and check the root.
        uint64 snapshotBlock;
        uint64 startsAt;
        /// @notice When the creator may take back what nobody claimed. Never moves earlier.
        uint64 reclaimableAt;
        uint64 createdAt;
        bool reclaimed;
    }

    Airdrop[] private _airdrops;
    mapping(uint256 id => mapping(address account => uint256 amount)) public claimedBy;
    mapping(address creator => uint256[] ids) private _byCreator;
    mapping(address token => uint256[] ids) private _byToken;

    event Created(
        uint256 indexed id,
        address indexed creator,
        address indexed token,
        uint256 pool,
        bytes32 merkleRoot,
        uint64 startsAt
    );
    event Adjusted(uint256 indexed id, uint256 pool, bytes32 merkleRoot, uint64 startsAt);
    event Claimed(uint256 indexed id, address indexed account, uint256 amount);
    event Reclaimed(uint256 indexed id, address indexed creator, uint256 amount);

    error PoolZero();
    error RootZero();
    error StartNotInFuture(uint64 startsAt, uint64 nowTs);
    error ReclaimBeforeStart(uint64 reclaimableAt, uint64 startsAt);
    error NoSuchAirdrop(uint256 id);
    error NotCreator(uint256 id, address caller);
    /// @dev The rule the design rests on: once holders can act on the terms, the terms are fixed.
    error TermsFrozen(uint256 id, uint64 startsAt, uint64 nowTs);
    error NotOpenYet(uint256 id, uint64 startsAt, uint64 nowTs);
    error BadProof(uint256 id, address account);
    error NothingToClaim(uint256 id, address account);
    error PoolExhausted(uint256 id, uint256 remaining, uint256 requested);
    error NotReclaimableYet(uint256 id, uint64 reclaimableAt, uint64 nowTs);
    error AlreadyReclaimed(uint256 id);
    error NothingReceived();
    error CannotShortenReclaim(uint64 current, uint64 requested);

    /// @notice Fund an airdrop and publish the allocation root for it.
    /// @param pool How much of `token` to set aside. The caller must have approved it.
    /// @param merkleRoot Root of the tree of (account, amount) leaves from the snapshot.
    /// @param snapshotBlock The block the balances were read at, so the root can be rechecked.
    /// @param startsAt When claiming opens. Terms are fixed from this moment.
    /// @param reclaimableAt When the creator may take back anything unclaimed.
    function create(
        address token,
        uint256 pool,
        bytes32 merkleRoot,
        uint64 snapshotBlock,
        uint64 startsAt,
        uint64 reclaimableAt
    ) external nonReentrant returns (uint256 id) {
        if (pool == 0) revert PoolZero();
        if (merkleRoot == bytes32(0)) revert RootZero();
        if (startsAt <= block.timestamp) revert StartNotInFuture(startsAt, _now());
        // Reclaiming before claiming opens would make the whole thing a no-op the creator
        // could unwind at will.
        if (reclaimableAt <= startsAt) revert ReclaimBeforeStart(reclaimableAt, startsAt);

        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), pool);
        uint256 received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();

        id = _airdrops.length;
        _airdrops.push(
            Airdrop({
                creator: msg.sender,
                token: token,
                pool: received,
                claimed: 0,
                merkleRoot: merkleRoot,
                snapshotBlock: snapshotBlock,
                startsAt: startsAt,
                reclaimableAt: reclaimableAt,
                createdAt: _now(),
                reclaimed: false
            })
        );
        _byCreator[msg.sender].push(id);
        _byToken[token].push(id);

        emit Created(id, msg.sender, token, received, merkleRoot, startsAt);
    }

    /// @notice Change the terms before claiming opens.
    /// @dev Pool can only go up, and topping it up moves real tokens in. The root and the
    /// start time can change freely until `startsAt`, and not at all after it.
    function adjust(uint256 id, uint256 addToPool, bytes32 merkleRoot, uint64 startsAt)
        external
        nonReentrant
    {
        Airdrop storage drop = _get(id);
        if (drop.creator != msg.sender) revert NotCreator(id, msg.sender);
        if (block.timestamp >= drop.startsAt) revert TermsFrozen(id, drop.startsAt, _now());
        if (startsAt <= block.timestamp) revert StartNotInFuture(startsAt, _now());
        if (merkleRoot == bytes32(0)) revert RootZero();

        if (addToPool > 0) {
            IERC20 erc20 = IERC20(drop.token);
            uint256 before = erc20.balanceOf(address(this));
            erc20.safeTransferFrom(msg.sender, address(this), addToPool);
            uint256 received = erc20.balanceOf(address(this)) - before;
            if (received == 0) revert NothingReceived();
            drop.pool += received;
        }

        drop.merkleRoot = merkleRoot;
        drop.startsAt = startsAt;
        // The reclaim date moves with the start so it can never end up behind it, but only
        // ever later, never sooner.
        if (drop.reclaimableAt <= startsAt) drop.reclaimableAt = startsAt + 1 days;

        emit Adjusted(id, drop.pool, merkleRoot, startsAt);
    }

    /// @notice Push the reclaim date further out. It can never be pulled in.
    function extendReclaim(uint256 id, uint64 newReclaimableAt) external {
        Airdrop storage drop = _get(id);
        if (drop.creator != msg.sender) revert NotCreator(id, msg.sender);
        if (newReclaimableAt <= drop.reclaimableAt) {
            revert CannotShortenReclaim(drop.reclaimableAt, newReclaimableAt);
        }
        drop.reclaimableAt = newReclaimableAt;
    }

    /// @notice Claim an allocation by proving it against the published root.
    /// @param amount The total this account is owed, exactly as it appears in the tree.
    /// @param proof The Merkle path for this account's leaf.
    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Airdrop storage drop = _get(id);
        if (block.timestamp < drop.startsAt) revert NotOpenYet(id, drop.startsAt, _now());

        // Double-hashed leaf: a single hash lets an internal node be replayed as a leaf.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verify(proof, drop.merkleRoot, leaf)) revert BadProof(id, msg.sender);

        // `amount` in the tree is a total, not an instalment, so a second claim after the
        // root changed pays only the difference rather than the whole thing again.
        uint256 taken = claimedBy[id][msg.sender];
        if (amount <= taken) revert NothingToClaim(id, msg.sender);
        uint256 owed = amount - taken;

        uint256 remaining = drop.pool - drop.claimed;
        if (owed > remaining) revert PoolExhausted(id, remaining, owed);

        claimedBy[id][msg.sender] = amount;
        drop.claimed += owed;

        IERC20(drop.token).safeTransfer(msg.sender, owed);
        emit Claimed(id, msg.sender, owed);
    }

    /// @notice Take back what nobody claimed, once `reclaimableAt` has passed.
    function reclaim(uint256 id) external nonReentrant {
        Airdrop storage drop = _get(id);
        if (drop.creator != msg.sender) revert NotCreator(id, msg.sender);
        if (drop.reclaimed) revert AlreadyReclaimed(id);
        if (block.timestamp < drop.reclaimableAt) {
            revert NotReclaimableYet(id, drop.reclaimableAt, _now());
        }

        uint256 remaining = drop.pool - drop.claimed;
        drop.reclaimed = true;
        // The pool is closed rather than emptied, so `claimed` stays a true record of what
        // holders took and the page can still show it.
        drop.pool = drop.claimed;

        if (remaining > 0) IERC20(drop.token).safeTransfer(msg.sender, remaining);
        emit Reclaimed(id, msg.sender, remaining);
    }

    /* ---------------------------------------------------------------- views ---- */

    function airdropCount() external view returns (uint256) {
        return _airdrops.length;
    }

    function getAirdrop(uint256 id) external view returns (Airdrop memory) {
        return _get(id);
    }

    function airdropIdsByCreator(address creator) external view returns (uint256[] memory) {
        return _byCreator[creator];
    }

    function airdropIdsByToken(address token) external view returns (uint256[] memory) {
        return _byToken[token];
    }

    /// @notice What `account` could still take, given the allocation it can prove.
    /// @dev A pure read for the UI. It does not verify the proof: the caller already knows
    /// the amount from the published tree, and `claim` is where the proof is checked.
    function claimableOf(uint256 id, address account, uint256 allocation)
        external
        view
        returns (uint256)
    {
        Airdrop storage drop = _get(id);
        uint256 taken = claimedBy[id][account];
        if (allocation <= taken) return 0;
        uint256 owed = allocation - taken;
        uint256 remaining = drop.pool - drop.claimed;
        return owed < remaining ? owed : remaining;
    }

    function latestAirdrops(uint256 offset, uint256 limit)
        external
        view
        returns (Airdrop[] memory page, uint256 total)
    {
        total = _airdrops.length;
        if (offset >= total) return (new Airdrop[](0), total);
        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Airdrop[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _airdrops[total - 1 - offset - i];
        }
    }

    function _get(uint256 id) private view returns (Airdrop storage) {
        if (id >= _airdrops.length) revert NoSuchAirdrop(id);
        return _airdrops[id];
    }

    /// @dev See the note in PonsLock: one cast, one place. uint64 seconds outlive the sun.
    function _now() private view returns (uint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp);
    }
}
