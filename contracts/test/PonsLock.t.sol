// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PonsLock} from "../src/PonsLock.sol";
import {MockToken, FeeToken, FalseReturningToken, ReentrantToken} from "./mocks/Tokens.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PonsLockTest is Test {
    PonsLock internal lockbox;
    MockToken internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant SUPPLY = 1_000_000 ether;
    uint64 internal constant YEAR = 365 days;

    function setUp() public {
        lockbox = new PonsLock();
        token = new MockToken("Span", "SPAN", SUPPLY);
        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);
        // Start well clear of zero so `unlockAt` in the past is expressible.
        vm.warp(1_760_000_000);
    }

    function _lockAs(address who, uint256 amount, uint64 until) internal returns (uint256 id) {
        vm.startPrank(who);
        token.approve(address(lockbox), amount);
        id = lockbox.lock(address(token), amount, until);
        vm.stopPrank();
    }

    /* ------------------------------------------------------------- locking ---- */

    function test_lock_movesTokensAndRecordsTerms() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        PonsLock.Lock memory entry = lockbox.getLock(id);
        assertEq(entry.owner, alice);
        assertEq(entry.token, address(token));
        assertEq(entry.amount, 1_000 ether);
        assertEq(entry.unlockAt, until);
        assertEq(entry.withdrawnAt, 0);

        assertEq(token.balanceOf(address(lockbox)), 1_000 ether, "tokens are held by the contract");
        assertEq(lockbox.totalLocked(address(token)), 1_000 ether);
    }

    function test_lock_rejectsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(PonsLock.AmountZero.selector);
        lockbox.lock(address(token), 0, uint64(block.timestamp) + YEAR);
    }

    function test_lock_rejectsUnlockInThePast() public {
        uint64 past = uint64(block.timestamp) - 1;
        vm.startPrank(alice);
        token.approve(address(lockbox), 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(PonsLock.UnlockNotInFuture.selector, past, uint64(block.timestamp))
        );
        lockbox.lock(address(token), 1 ether, past);
        vm.stopPrank();
    }

    /// @dev The whole reason `lock` measures its own balance instead of trusting `amount`.
    function test_lock_recordsWhatArrivedNotWhatWasAsked() public {
        FeeToken fee = new FeeToken(500, SUPPLY); // 5% burned on transfer
        fee.transfer(alice, 10_000 ether);

        vm.startPrank(alice);
        fee.approve(address(lockbox), 1_000 ether);
        uint256 id = lockbox.lock(address(fee), 1_000 ether, uint64(block.timestamp) + YEAR);
        vm.stopPrank();

        PonsLock.Lock memory entry = lockbox.getLock(id);
        assertEq(entry.amount, 950 ether, "records the 950 that arrived, not the 1000 requested");
        assertEq(fee.balanceOf(address(lockbox)), 950 ether);

        // And the withdrawal honours it without touching anybody else's tokens.
        vm.warp(block.timestamp + YEAR + 1);
        vm.prank(alice);
        lockbox.withdraw(id);
        assertEq(fee.balanceOf(address(lockbox)), 0);
    }

    function test_lock_revertsOnATokenThatReturnsFalse() public {
        FalseReturningToken bad = new FalseReturningToken(SUPPLY);
        bad.transfer(alice, 1_000 ether);
        vm.startPrank(alice);
        bad.approve(address(lockbox), 100 ether);
        // SafeERC20 turns the silent false into a revert. Without it the lock would record
        // tokens it never received.
        vm.expectRevert();
        lockbox.lock(address(bad), 100 ether, uint64(block.timestamp) + YEAR);
        vm.stopPrank();
    }

    /* ---------------------------------------------------------- withdrawing ---- */

    function test_withdraw_refusesBeforeUnlock() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        // The warped time is named rather than re-read from block.timestamp afterwards.
        // Under via_ir the optimizer caches TIMESTAMP in a local, which is correct inside a
        // transaction and wrong across a vm.warp: the expectation would be built from the
        // pre-warp value and the test would fail for a reason that has nothing to do with
        // the contract.
        uint64 attemptAt = until - 1;
        vm.warp(attemptAt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.StillLocked.selector, id, until, attemptAt));
        lockbox.withdraw(id);
    }

    function test_withdraw_worksExactlyAtUnlock() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        vm.warp(until);
        vm.prank(alice);
        lockbox.withdraw(id);
        assertEq(token.balanceOf(alice), 100_000 ether);
        assertEq(lockbox.totalLocked(address(token)), 0);
    }

    function test_withdraw_refusesAnyoneButTheOwner() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);
        vm.warp(until);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.NotLockOwner.selector, id, bob));
        lockbox.withdraw(id);
    }

    function test_withdraw_cannotHappenTwice() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);
        vm.warp(until);

        vm.startPrank(alice);
        lockbox.withdraw(id);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.AlreadyWithdrawn.selector, id));
        lockbox.withdraw(id);
        vm.stopPrank();
    }

    /// @dev A withdrawn lock still resolves, so a shared proof link does not rot.
    function test_withdraw_leavesTheRecordReadable() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);
        vm.warp(until);
        vm.prank(alice);
        lockbox.withdraw(id);

        PonsLock.Lock memory entry = lockbox.getLock(id);
        assertEq(entry.amount, 1_000 ether, "the amount that was locked is still on record");
        // `until`, not a re-read of block.timestamp: see the note in
        // test_withdraw_refusesBeforeUnlock.
        assertEq(entry.withdrawnAt, until);
    }

    /* ------------------------------------------------------------ extending ---- */

    function test_extend_movesTheDateLater() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        vm.prank(alice);
        lockbox.extend(id, until + YEAR);
        assertEq(lockbox.getLock(id).unlockAt, until + YEAR);
    }

    /// @dev The single rule the product's whole claim rests on.
    function test_extend_cannotShorten() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.CannotShorten.selector, until, until - 1 days));
        lockbox.extend(id, until - 1 days);

        // Not even to the same value: a no-op is a mistake, not a transaction.
        vm.expectRevert(abi.encodeWithSelector(PonsLock.CannotShorten.selector, until, until));
        lockbox.extend(id, until);
        vm.stopPrank();
    }

    function test_extend_refusesAnyoneButTheOwner() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.NotLockOwner.selector, id, bob));
        lockbox.extend(id, until + YEAR);
    }

    /* -------------------------------------------------------------- topping ---- */

    function test_topUp_addsToAnExistingLock() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        vm.startPrank(bob);
        token.approve(address(lockbox), 500 ether);
        lockbox.topUp(id, 500 ether);
        vm.stopPrank();

        assertEq(lockbox.getLock(id).amount, 1_500 ether);
        // A stranger's top-up is a donation: it still only comes out through alice.
        vm.warp(until);
        vm.prank(alice);
        lockbox.withdraw(id);
        assertEq(token.balanceOf(alice), 100_500 ether);
    }

    /* ------------------------------------------------------- what cannot be ---- */

    /// @dev There is no privileged address, so there is no function to test for. This asserts
    /// the absence: the deployer has no more power over a lock than a stranger does.
    function test_deployerHasNoPowerOverALock() public {
        uint64 until = uint64(block.timestamp) + YEAR;
        uint256 id = _lockAs(alice, 1_000 ether, until);

        address deployer = address(this);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.NotLockOwner.selector, id, deployer));
        lockbox.withdraw(id);

        vm.expectRevert(abi.encodeWithSelector(PonsLock.NotLockOwner.selector, id, deployer));
        lockbox.extend(id, until + YEAR);

        vm.warp(until);
        vm.expectRevert(abi.encodeWithSelector(PonsLock.NotLockOwner.selector, id, deployer));
        lockbox.withdraw(id);
    }

    function test_reentrantTokenCannotDrainASecondLock() public {
        ReentrantToken evil = new ReentrantToken(SUPPLY);
        evil.transfer(alice, 10_000 ether);

        uint64 until = uint64(block.timestamp) + YEAR;
        vm.startPrank(alice);
        evil.approve(address(lockbox), 2_000 ether);
        uint256 first = lockbox.lock(address(evil), 1_000 ether, until);
        vm.stopPrank();

        // Arm the token to re-enter withdraw() during the transfer out.
        evil.arm(address(lockbox), abi.encodeWithSelector(PonsLock.withdraw.selector, first));

        vm.warp(until);
        vm.prank(alice);
        lockbox.withdraw(first);

        // The re-entry got nothing: the lock is settled once and the contract is empty.
        assertEq(lockbox.getLock(first).withdrawnAt, until);
        assertEq(evil.balanceOf(address(lockbox)), 0, "no second payout");
        assertEq(lockbox.totalLocked(address(evil)), 0);
    }

    /* ----------------------------------------------------------------- fuzz ---- */

    function testFuzz_lockThenWithdrawReturnsExactlyWhatWentIn(uint96 amount, uint32 duration) public {
        amount = uint96(bound(amount, 1, 100_000 ether));
        uint64 until = uint64(block.timestamp) + uint64(bound(duration, 1, 10 * YEAR));

        uint256 before = token.balanceOf(alice);
        uint256 id = _lockAs(alice, amount, until);
        assertEq(token.balanceOf(alice), before - amount);

        vm.warp(until);
        vm.prank(alice);
        lockbox.withdraw(id);
        assertEq(token.balanceOf(alice), before, "nothing is lost and nothing is created");
    }

    function testFuzz_neverWithdrawableEarly(uint96 amount, uint32 duration, uint32 attemptAt) public {
        amount = uint96(bound(amount, 1, 100_000 ether));
        uint64 start = uint64(block.timestamp);
        uint64 until = start + uint64(bound(duration, 2, 10 * YEAR));
        uint256 id = _lockAs(alice, amount, until);

        uint64 attempt = start + uint64(bound(attemptAt, 0, until - start - 1));
        vm.warp(attempt);
        vm.prank(alice);
        vm.expectRevert();
        lockbox.withdraw(id);
    }
}
