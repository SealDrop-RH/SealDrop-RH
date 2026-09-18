// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title PonsLock
/// @notice Holds ERC-20 supply until a date its owner chose, and proves it.
///
/// @dev The design is defined by what it deliberately cannot do:
///
///  - There is no owner, no admin and no pause. This contract has no privileged address at
///    all, so there is nothing to compromise and nothing to trust. Every function below is
///    either callable by a lock's own owner or by anyone.
///  - There is no path that returns tokens before `unlockAt`. Not for the lock owner, not
///    for the deployer.
///  - `unlockAt` can only move later. A lock can become stronger, never weaker, which is
///    what makes a proof link worth anything: the terms a reader sees today are a floor.
///
/// Time is `block.timestamp` throughout. On Robinhood Chain `block.number` reports the L1
/// height rather than this chain's, so it is not a usable clock here.
contract PonsLock is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Lock {
        address owner;
        address token;
        /// @dev The amount actually received, which is what gets returned. See the
        /// fee-on-transfer note in `lock`.
        uint256 amount;
        uint64 lockedAt;
        uint64 unlockAt;
        uint64 withdrawnAt;
    }

    /// @dev Locks are append-only and never deleted, so a proof link keeps resolving after
    /// the tokens have been withdrawn. `withdrawnAt` records that it happened.
    Lock[] private _locks;

    mapping(address owner => uint256[] lockIds) private _byOwner;
    mapping(address token => uint256[] lockIds) private _byToken;
    /// @notice Tokens currently held by this contract for a given ERC-20, still locked.
    mapping(address token => uint256 amount) public totalLocked;

    event Locked(
        uint256 indexed id,
        address indexed owner,
        address indexed token,
        uint256 amount,
        uint64 unlockAt
    );
    event Extended(uint256 indexed id, uint64 previousUnlockAt, uint64 newUnlockAt);
    event ToppedUp(uint256 indexed id, uint256 added, uint256 newAmount);
    event Withdrawn(uint256 indexed id, address indexed to, uint256 amount);

    error AmountZero();
    error UnlockNotInFuture(uint64 unlockAt, uint64 nowTs);
    error NoSuchLock(uint256 id);
    error NotLockOwner(uint256 id, address caller);
    error StillLocked(uint256 id, uint64 unlockAt, uint64 nowTs);
    error AlreadyWithdrawn(uint256 id);
    /// @dev Raised when an extension would shorten a lock. The one rule the whole design rests on.
    error CannotShorten(uint64 currentUnlockAt, uint64 requestedUnlockAt);
    error NothingReceived();

    /// @notice Lock `amount` of `token` until `unlockAt`.
    /// @dev The caller must have approved this contract for `amount` first.
    /// @return id The lock's id, used by every other function and by the proof page.
    function lock(address token, uint256 amount, uint64 unlockAt)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0) revert AmountZero();
        if (unlockAt <= block.timestamp) revert UnlockNotInFuture(unlockAt, _now());

        // Measured rather than assumed. A fee-on-transfer or rebasing token delivers less
        // than `amount`, and recording the requested figure would promise a withdrawal this
        // contract cannot honour, leaving the shortfall to come out of another lock's tokens.
        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();

        id = _locks.length;
        _locks.push(
            Lock({
                owner: msg.sender,
                token: token,
                amount: received,
                lockedAt: _now(),
                unlockAt: unlockAt,
                withdrawnAt: 0
            })
        );

        _byOwner[msg.sender].push(id);
        _byToken[token].push(id);
        totalLocked[token] += received;

        emit Locked(id, msg.sender, token, received, unlockAt);
    }

    /// @notice Push a lock's unlock date further out. It can never be pulled in.
    function extend(uint256 id, uint64 newUnlockAt) external {
        Lock storage entry = _get(id);
        if (entry.owner != msg.sender) revert NotLockOwner(id, msg.sender);
        if (entry.withdrawnAt != 0) revert AlreadyWithdrawn(id);
        // `<=` rather than `<`: a no-op extension is a mistake worth surfacing rather than a
        // transaction worth paying for.
        if (newUnlockAt <= entry.unlockAt) revert CannotShorten(entry.unlockAt, newUnlockAt);

        uint64 previous = entry.unlockAt;
        entry.unlockAt = newUnlockAt;
        emit Extended(id, previous, newUnlockAt);
    }

    /// @notice Add more of the same token to an existing lock, under the same unlock date.
    /// @dev Anyone may top up a lock. There is no way to get the tokens back out except
    /// through its owner after `unlockAt`, so a hostile top-up is a donation.
    function topUp(uint256 id, uint256 amount) external nonReentrant {
        Lock storage entry = _get(id);
        if (entry.withdrawnAt != 0) revert AlreadyWithdrawn(id);
        if (amount == 0) revert AmountZero();

        IERC20 erc20 = IERC20(entry.token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();

        entry.amount += received;
        totalLocked[entry.token] += received;
        emit ToppedUp(id, received, entry.amount);
    }

    /// @notice Withdraw a matured lock. Owner only, and only once.
    function withdraw(uint256 id) external nonReentrant {
        Lock storage entry = _get(id);
        if (entry.owner != msg.sender) revert NotLockOwner(id, msg.sender);
        if (entry.withdrawnAt != 0) revert AlreadyWithdrawn(id);
        if (block.timestamp < entry.unlockAt) {
            revert StillLocked(id, entry.unlockAt, _now());
        }

        // Effects before interactions. The reentrancy guard makes this belt and braces, but
        // the ordering is what actually closes the hole if the guard ever goes away.
        uint256 amount = entry.amount;
        entry.withdrawnAt = _now();
        totalLocked[entry.token] -= amount;

        IERC20(entry.token).safeTransfer(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount);
    }

    /* ---------------------------------------------------------------- views ---- */

    function lockCount() external view returns (uint256) {
        return _locks.length;
    }

    function getLock(uint256 id) external view returns (Lock memory) {
        return _get(id);
    }

    /// @notice Every lock id a wallet owns. Paged by the caller; the array is append-only.
    function lockIdsByOwner(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    function lockIdsByToken(address token) external view returns (uint256[] memory) {
        return _byToken[token];
    }

    /// @notice A window of locks, newest first, for listing pages.
    /// @dev Reading the array in one call is the cheapest way to render a page, and an
    /// off-chain caller has no gas limit to worry about. `offset` is from the newest end.
    function latestLocks(uint256 offset, uint256 limit)
        external
        view
        returns (Lock[] memory page, uint256 total)
    {
        total = _locks.length;
        if (offset >= total) return (new Lock[](0), total);

        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Lock[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _locks[total - 1 - offset - i];
        }
    }

    /// @dev The current time as uint64.
    ///
    /// One cast in one place instead of a dozen scattered ones. uint64 holds seconds until
    /// the year 584942417355, so the truncation the linter warns about cannot occur before
    /// the sun does; every deadline in this contract is a uint64 for the storage packing.
    function _now() private view returns (uint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp);
    }

    function _get(uint256 id) private view returns (Lock storage) {
        if (id >= _locks.length) revert NoSuchLock(id);
        return _locks[id];
    }
}
