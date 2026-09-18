// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PonsDrip} from "../src/PonsDrip.sol";
import {MerkleTreeLib} from "./MerkleTreeLib.sol";
import {MockToken, FeeToken} from "./mocks/Tokens.sol";

contract PonsDripTest is Test {
    PonsDrip internal drips;
    MockToken internal token;

    address internal dev = address(0xDE7);
    address internal whale = address(0x1);
    address internal mid = address(0x2);
    address internal minnow = address(0x3);
    address internal stranger = address(0x4);

    uint256 internal constant RESERVE = 100_000 ether;
    uint16 internal constant RATE = 500; // 5%
    uint32 internal constant EVERY = 600; // ten minutes

    /// @dev The snapshot: three holders splitting everything 50 / 30 / 20.
    address[3] internal HOLDERS = [address(0x1), address(0x2), address(0x3)];

    function setUp() public {
        vm.warp(1_760_000_000);
        drips = new PonsDrip();
        token = new MockToken("Pons Test", "PTEST", 10_000_000 ether);
        token.transfer(dev, 5_000_000 ether);
    }

    /* ------------------------------------------------------------- helpers ---- */

    uint256 internal constant WAD = 1e18;
    /// @dev Shares of the qualifying supply, 50 / 30 / 20, scaled by SHARE_SCALE. The argument
    /// is ignored: a share tree does not depend on how much has been released, which is exactly
    /// what lets one root keep paying out for ever.
    function _rootFor(uint256) internal view returns (bytes32, bytes32[] memory) {
        bytes32[] memory leaves = new bytes32[](3);
        leaves[0] = MerkleTreeLib.leafOf(HOLDERS[0], (WAD * 50) / 100);
        leaves[1] = MerkleTreeLib.leafOf(HOLDERS[1], (WAD * 30) / 100);
        leaves[2] = MerkleTreeLib.leafOf(HOLDERS[2], (WAD * 20) / 100);
        return (MerkleTreeLib.build(leaves), leaves);
    }

    /// @dev What a holder with `pct` of the qualifying supply is owed once `released` is out.
    function _owed(uint256 released, uint256 pct) internal pure returns (uint256) {
        return (released * ((WAD * pct) / 100)) / WAD;
    }

    function _create(bool revocable) internal returns (uint256 id) {
        (bytes32 root,) = _rootFor(RESERVE);
        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        id = drips.create(address(token), RESERVE, root, 1234, 0, RATE, EVERY, 0, address(0), revocable);
        vm.stopPrank();
    }

    /* -------------------------------------------------------------- funding ---- */

    function test_create_movesTheTokensIntoTheContract() public {
        uint256 devBefore = token.balanceOf(dev);
        uint256 id = _create(false);

        // The whole point of the exercise: the reserve leaves the creator and sits here.
        assertEq(token.balanceOf(dev), devBefore - RESERVE, "creator did not pay");
        assertEq(token.balanceOf(address(drips)), RESERVE, "contract did not receive");
        assertEq(drips.getDrip(id).reserve, RESERVE);
        assertEq(drips.getDrip(id).creator, dev);
    }

    function test_create_recordsWhatArrivedNotWhatWasPromised() public {
        FeeToken fee = new FeeToken(100, 1_000_000 ether);
        fee.transfer(dev, 500_000 ether);
        (bytes32 root,) = _rootFor(RESERVE);

        vm.startPrank(dev);
        fee.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(fee), RESERVE, root, 1, 0, RATE, EVERY, 0, address(0), false);
        vm.stopPrank();

        // A fee-on-transfer token must not be able to promise holders more than it funded.
        assertEq(drips.getDrip(id).reserve, fee.balanceOf(address(drips)));
        assertLt(drips.getDrip(id).reserve, RESERVE);
    }

    function test_create_claimingIsOpenImmediately() public {
        uint256 id = _create(false);
        assertEq(drips.getDrip(id).startsAt, uint64(block.timestamp));
        // The first round is already out at the instant of creation.
        assertEq(drips.releasedAt(id, block.timestamp), 5_000 ether);
    }

    function test_create_rejectsNonsense() public {
        (bytes32 root,) = _rootFor(RESERVE);
        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);

        vm.expectRevert(PonsDrip.ReserveZero.selector);
        drips.create(address(token), 0, root, 1, 0, RATE, EVERY, 0, address(0), false);

        vm.expectRevert(PonsDrip.RootZero.selector);
        drips.create(address(token), RESERVE, bytes32(0), 1, 0, RATE, EVERY, 0, address(0), false);

        vm.expectRevert(abi.encodeWithSelector(PonsDrip.RateOutOfRange.selector, uint16(0)));
        drips.create(address(token), RESERVE, root, 1, 0, 0, EVERY, 0, address(0), false);

        vm.expectRevert(abi.encodeWithSelector(PonsDrip.IntervalOutOfRange.selector, uint32(59)));
        drips.create(address(token), RESERVE, root, 1, 0, RATE, 59, 0, address(0), false);
        vm.stopPrank();
    }

    /* --------------------------------------------------------------- curve ---- */

    /// @dev The shape the whole contract exists for: a share of what is left, not of the start.
    function test_releasedAt_takesAShareOfTheRemainder() public {
        uint256 id = _create(false);
        uint256 t0 = block.timestamp;

        assertEq(drips.releasedAt(id, t0), 5_000 ether, "round 1");
        assertEq(drips.releasedAt(id, t0 + EVERY), 9_750 ether, "round 2 adds 4,750");
        assertEq(drips.releasedAt(id, t0 + 2 * EVERY), 14_262.5 ether, "round 3 adds 4,512.5");
    }

    function test_releasedAt_accruesContinuouslyBetweenRounds() public {
        uint256 id = _create(false);
        uint256 t0 = block.timestamp;

        // Halfway through the first interval: all of round 1 and half of round 2.
        assertEq(drips.releasedAt(id, t0 + EVERY / 2), 5_000 ether + 4_750 ether / 2);
        // And it is owed something again one second later, which is the point of continuity.
        assertGt(drips.releasedAt(id, t0 + 1), drips.releasedAt(id, t0));
    }

    function test_releasedAt_neverGoesBackwardsAndNeverExceedsTheReserve() public {
        uint256 id = _create(false);
        uint256 previous;
        for (uint256 i = 0; i < 400; ++i) {
            uint256 released = drips.releasedAt(id, block.timestamp + i * 137);
            assertGe(released, previous, "went backwards");
            assertLe(released, RESERVE, "released more than was funded");
            previous = released;
        }
    }

    function test_releasedAt_stopsAtMaxRounds() public {
        (bytes32 root,) = _rootFor(RESERVE);
        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, RATE, EVERY, 2, address(0), false);
        vm.stopPrank();

        uint256 capped = drips.releasedAt(id, block.timestamp + EVERY);
        assertEq(capped, 9_750 ether);
        assertEq(drips.releasedAt(id, block.timestamp + 500 * EVERY), capped, "kept releasing past the cap");
    }

    function testFuzz_releasedAt_isMonotonic(uint16 rateBps, uint32 interval, uint32 a, uint32 b) public {
        rateBps = uint16(bound(rateBps, 1, 10_000));
        interval = uint32(bound(interval, 60, 365 days));
        uint256 ta = block.timestamp + bound(a, 0, 3650 days);
        uint256 tb = block.timestamp + bound(b, 0, 3650 days);
        if (ta > tb) (ta, tb) = (tb, ta);

        (bytes32 root,) = _rootFor(RESERVE);
        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, rateBps, interval, 0, address(0), false);
        vm.stopPrank();

        assertLe(drips.releasedAt(id, ta), drips.releasedAt(id, tb));
        assertLe(drips.releasedAt(id, tb), RESERVE);
    }

    /* -------------------------------------------------------------- claims ---- */

    function test_claim_paysTheProvenShare() public {
        uint256 id = _create(false);
        vm.warp(block.timestamp + 400 * EVERY);

        (, bytes32[] memory leaves) = _rootFor(0);
        uint256 released = drips.releasedAt(id, block.timestamp);

        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, MerkleTreeLib.proofFor(leaves, 0));
        assertEq(token.balanceOf(whale), _owed(released, 50));
    }

    /**
     * The point of the whole share model. One root, published once, keeps paying as the curve
     * advances: nobody signs anything in between and the holder simply claims again later.
     */
    function test_claim_keepsPayingFromOneRootAsTimePasses() public {
        uint256 id = _create(false);
        (, bytes32[] memory leaves) = _rootFor(0);
        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);

        vm.warp(block.timestamp + 5 * EVERY);
        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, proof);
        uint256 first = token.balanceOf(whale);
        assertGt(first, 0);

        // No updateRoot, no publisher, nothing. Just five more rounds of the clock.
        vm.warp(block.timestamp + 5 * EVERY);
        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, proof);
        assertGt(token.balanceOf(whale), first, "a second claim paid nothing without a new root");

        // And it is still exactly half of everything released, never more.
        assertEq(token.balanceOf(whale), _owed(drips.releasedAt(id, block.timestamp), 50));
    }

    /**
     * The wall. A root is a claim about how to split what the schedule released; it is not a
     * claim about how much the schedule released. Even a root that says an account is owed the
     * entire reserve cannot pull a token out ahead of the curve.
     */
    function test_claim_cannotOutrunTheSchedule() public {
        // A tree that hands one wallet twice the entire qualifying supply. Shares that sum past
        // 100% are the one way a root can promise more than the schedule has released, and the
        // contract has to refuse rather than pay the first claimer out of everyone else's share.
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = MerkleTreeLib.leafOf(HOLDERS[0], WAD * 2);
        leaves[1] = MerkleTreeLib.leafOf(HOLDERS[1], WAD);
        bytes32 root = MerkleTreeLib.build(leaves);

        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, RATE, EVERY, 0, address(0), false);
        vm.stopPrank();

        uint256 released = drips.releasedAt(id, block.timestamp);
        vm.prank(whale);
        drips.claim(id, WAD * 2, MerkleTreeLib.proofFor(leaves, 0));
        // Paid what had been released and not a token more, though the leaf says twice that.
        assertEq(token.balanceOf(whale), released, "paid past the curve");

        // And the next account finds nothing left rather than being paid out of thin air.
        vm.prank(mid);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NothingToClaim.selector, id, mid));
        drips.claim(id, WAD, MerkleTreeLib.proofFor(leaves, 1));
        assertEq(drips.getDrip(id).claimed, released);
    }

    /// @dev Capped by what is left, a claim records what it paid, so the rest stays owed.
    function test_claim_aCappedClaimKeepsTheRemainderOwed() public {
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = MerkleTreeLib.leafOf(HOLDERS[0], WAD * 2);
        leaves[1] = MerkleTreeLib.leafOf(HOLDERS[1], WAD);
        bytes32 root = MerkleTreeLib.build(leaves);

        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, RATE, EVERY, 0, address(0), false);
        vm.stopPrank();

        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);
        uint256 first = drips.releasedAt(id, block.timestamp);
        vm.prank(whale);
        drips.claim(id, WAD * 2, proof);
        assertEq(drips.claimedBy(id, whale), first);

        vm.warp(block.timestamp + EVERY);
        uint256 later = drips.releasedAt(id, block.timestamp);
        vm.prank(whale);
        drips.claim(id, WAD * 2, proof);
        assertEq(token.balanceOf(whale), later, "the capped remainder was written off");
    }

    function test_claim_paysOnlyTheDifferenceOnASecondClaim() public {
        uint256 id = _create(true);
        // Far enough that the curve has flattened and a second claim in the same block adds
        // nothing, which is the case where double-paying would show up.
        vm.warp(block.timestamp + 5_000 * EVERY);

        (, bytes32[] memory leaves) = _rootFor(0);
        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);

        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, proof);
        uint256 paid = token.balanceOf(whale);

        // The same leaf in the same block is not a second payday.
        vm.prank(whale);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NothingToClaim.selector, id, whale));
        drips.claim(id, (WAD * 50) / 100, proof);
        assertEq(token.balanceOf(whale), paid);
    }

    function test_claim_refusesAProofFromAnotherTree() public {
        uint256 id = _create(false);
        (, bytes32[] memory leaves) = _rootFor(0);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.BadProof.selector, id, stranger));
        drips.claim(id, (WAD * 50) / 100, MerkleTreeLib.proofFor(leaves, 0));
    }

    /* --------------------------------------------------------- fresh roots ---- */

    /// @dev What the cron does: a new snapshot, a new set of cumulative totals, one call.
    function test_updateRoot_letsTheSplitFollowTheHolders() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + 400 * EVERY);

        (bytes32 root2,) = _rootFor(RESERVE);
        vm.prank(dev);
        drips.updateRoot(id, root2, 9999);
        assertEq(drips.getDrip(id).snapshotBlock, 9999);
    }

    function test_updateRoot_isClosedToEveryoneElse() public {
        uint256 id = _create(true);
        (bytes32 root2,) = _rootFor(RESERVE);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotCreator.selector, id, stranger));
        drips.updateRoot(id, root2, 1);
    }

    /// @dev The promise a non-revocable drip makes, and the only thing that makes it worth more.
    function test_updateRoot_isImpossibleOnANonRevocableDrip() public {
        uint256 id = _create(false);
        (bytes32 root2,) = _rootFor(RESERVE);

        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotRevocable.selector, id));
        drips.updateRoot(id, root2, 1);
    }

    /* ---------------------------------------------------------------- stop ---- */

    /**
     * The line the operator power turns on. Stopping calls off the rounds that have not
     * happened; it must never reach back into what the schedule already handed over.
     */
    function test_stop_returnsOnlyWhatWasNeverReleased() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY); // 9,750 released of 100,000.

        uint256 devBefore = token.balanceOf(dev);
        vm.prank(dev);
        uint256 returned = drips.stop(id);

        assertEq(returned, RESERVE - 9_750 ether, "took back more than it was holding");
        assertEq(token.balanceOf(dev), devBefore + returned);
        // Everything the schedule had released is still here for the holders it was released to.
        assertEq(token.balanceOf(address(drips)), 9_750 ether);
    }

    function test_stop_leavesAlreadyReleasedTokensClaimable() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);

        vm.prank(dev);
        drips.stop(id);

        // The whale's half of the 9,750 that went out before the stop is still theirs, and the
        // share leaf needs no new root to say so.
        (, bytes32[] memory leaves) = _rootFor(0);
        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, MerkleTreeLib.proofFor(leaves, 0));
        assertEq(token.balanceOf(whale), _owed(9_750 ether, 50));
    }

    function test_stop_freezesTheCurveForEver() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);
        vm.prank(dev);
        drips.stop(id);

        uint256 atStop = drips.releasedAt(id, block.timestamp);
        vm.warp(block.timestamp + 1000 * EVERY);
        assertEq(drips.releasedAt(id, block.timestamp), atStop, "kept releasing after the stop");
    }

    function test_stop_isClosedToEveryoneElseAndToSecondAttempts() public {
        uint256 id = _create(true);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotCreator.selector, id, stranger));
        drips.stop(id);

        vm.prank(dev);
        drips.stop(id);
        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.AlreadyStopped.selector, id));
        drips.stop(id);
    }

    /// @dev A funded non-revocable drip is beyond its creator's reach. That is the whole promise.
    function test_stop_isImpossibleOnANonRevocableDrip() public {
        uint256 id = _create(false);
        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotRevocable.selector, id));
        drips.stop(id);
    }

    /* ----------------------------------------------------------- solvency ---- */

    /**
     * The invariant that matters most: the contract can always pay what it says it owes.
     * Claims, a fresh root and a stop, interleaved, must never leave it short.
     */
    function test_staysSolventThroughClaimsAndAStop() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + 10 * EVERY);

        uint256 released = drips.releasedAt(id, block.timestamp);
        (, bytes32[] memory leaves) = _rootFor(0);
        vm.prank(whale);
        drips.claim(id, (WAD * 50) / 100, MerkleTreeLib.proofFor(leaves, 0));
        vm.prank(mid);
        drips.claim(id, (WAD * 30) / 100, MerkleTreeLib.proofFor(leaves, 1));

        vm.prank(dev);
        drips.stop(id);

        // The real solvency invariant, and the one that holds before and after a stop alike:
        // whatever the schedule has released but nobody has taken yet is still sitting here.
        // Measuring against the funded reserve instead would be measuring against money the
        // creator took back precisely because it was never released.
        uint256 outstanding = drips.releasedAt(id, block.timestamp) - drips.getDrip(id).claimed;
        assertGe(token.balanceOf(address(drips)), outstanding, "cannot cover what it owes");
        assertGe(token.balanceOf(address(drips)), _owed(released, 20), "minnow cannot be paid");

        vm.prank(minnow);
        drips.claim(id, (WAD * 20) / 100, MerkleTreeLib.proofFor(leaves, 2));
    }

    /* ---------------------------------------------------------- distribute ---- */

    address internal keeper = address(0xC0FFEE);

    /// @dev The batch the keeper sends: every holder in the 50 / 30 / 20 tree, with proofs.
    function _batch() internal view returns (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) {
        (, bytes32[] memory leaves) = _rootFor(0);
        accounts = new address[](3);
        shares = new uint256[](3);
        proofs = new bytes32[][](3);
        uint256[3] memory pct = [uint256(50), 30, 20];
        for (uint256 i = 0; i < 3; ++i) {
            accounts[i] = HOLDERS[i];
            shares[i] = (WAD * pct[i]) / 100;
            proofs[i] = MerkleTreeLib.proofFor(leaves, i);
        }
    }

    /// @dev No holding back: send each account everything it is owed.
    function _all(uint256 n) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) amounts[i] = type(uint256).max;
    }

    function _createWithPublisher(address publisher, bool revocable) internal returns (uint256 id) {
        (bytes32 root,) = _rootFor(RESERVE);
        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        id = drips.create(address(token), RESERVE, root, 1234, 0, RATE, EVERY, 0, publisher, revocable);
        vm.stopPrank();
    }

    /// @dev The whole request: holders are paid and none of them lifted a finger.
    function test_distribute_paysEveryoneWithoutAClaim() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + 3 * EVERY);
        uint256 released = drips.releasedAt(id, block.timestamp);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        uint256 total = drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));

        assertEq(token.balanceOf(whale), _owed(released, 50));
        assertEq(token.balanceOf(mid), _owed(released, 30));
        assertEq(token.balanceOf(minnow), _owed(released, 20));
        assertEq(total, _owed(released, 50) + _owed(released, 30) + _owed(released, 20));
        assertEq(drips.getDrip(id).claimed, total);
    }

    /// @dev Push and pull must be the same payment. Anything else and a holder's total would
    /// depend on which one happened to reach them.
    function test_distribute_paysExactlyWhatAClaimWould() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + 7 * EVERY + 123);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        bytes32 root = drips.getDrip(id).merkleRoot;

        uint256 snap = vm.snapshotState();
        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(accounts[i]);
            drips.claim(id, shares[i], proofs[i]);
        }
        uint256[3] memory pulled = [token.balanceOf(whale), token.balanceOf(mid), token.balanceOf(minnow)];
        vm.revertToState(snap);

        vm.prank(dev);
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        assertEq(token.balanceOf(whale), pulled[0]);
        assertEq(token.balanceOf(mid), pulled[1]);
        assertEq(token.balanceOf(minnow), pulled[2]);
    }

    /// @dev A second push later pays only what accrued since, and a claim in between is
    /// respected rather than paid again.
    function test_distribute_afterAClaimPaysOnlyTheDifference() public {
        uint256 id = _create(true);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        bytes32 root = drips.getDrip(id).merkleRoot;

        vm.warp(block.timestamp + EVERY);
        vm.prank(whale);
        drips.claim(id, shares[0], proofs[0]);

        vm.warp(block.timestamp + 5 * EVERY);
        vm.prank(dev);
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        uint256 released = drips.releasedAt(id, block.timestamp);
        assertEq(token.balanceOf(whale), _owed(released, 50), "whale paid twice or short");

        vm.warp(block.timestamp + 2 * EVERY);
        vm.prank(dev);
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        released = drips.releasedAt(id, block.timestamp);
        assertEq(token.balanceOf(whale), _owed(released, 50));
        assertEq(token.balanceOf(mid), _owed(released, 30));
        assertEq(token.balanceOf(minnow), _owed(released, 20));
    }

    /// @dev Someone who claimed a moment ago must not sink the whole batch.
    function test_distribute_skipsSomeoneWithNothingOwed() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();

        vm.prank(whale);
        drips.claim(id, shares[0], proofs[0]);
        uint256 whaleBefore = token.balanceOf(whale);

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));
        assertEq(token.balanceOf(whale), whaleBefore, "paid twice in one block");
        assertGt(token.balanceOf(mid), 0);
        assertGt(token.balanceOf(minnow), 0);
    }

    function test_distribute_isClosedToEveryoneElse() public {
        uint256 id = _create(true);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        bytes32 root = drips.getDrip(id).merkleRoot;

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotCreator.selector, id, stranger));
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));

        // Not even a holder in the tree: a push decides when *everyone* is paid.
        vm.prank(whale);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.NotCreator.selector, id, whale));
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
    }

    function test_distribute_isOpenToTheNominatedPublisher() public {
        uint256 id = _createWithPublisher(keeper, true);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();

        uint256 keeperBefore = token.balanceOf(keeper);
        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(keeper);
        drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));
        assertGt(token.balanceOf(whale), 0);
        // The keeper delivers. It never receives.
        assertEq(token.balanceOf(keeper), keeperBefore);
    }

    /// @dev Delivering what the terms already owe changes no term, so the non-revocable promise
    /// does not stand in its way.
    function test_distribute_worksOnANonRevocableDrip() public {
        uint256 id = _createWithPublisher(keeper, false);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(keeper);
        drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));
        assertEq(token.balanceOf(minnow), _owed(drips.releasedAt(id, block.timestamp), 20));
    }

    function test_distribute_refusesAStaleRoot() public {
        uint256 id = _create(true);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        bytes32 old = drips.getDrip(id).merkleRoot;

        bytes32 fresh = keccak256("another snapshot");
        vm.prank(dev);
        drips.updateRoot(id, fresh, 5555);

        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.StaleRoot.selector, id, fresh, old));
        drips.distribute(id, old, accounts, shares, proofs, _all(accounts.length));
    }

    /// @dev The keeper chooses the accounts but cannot invent one: the leaf names who is paid.
    function test_distribute_refusesAForgedRecipient() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        accounts[0] = stranger; // the whale's share and proof, a stranger's address

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        vm.expectRevert(abi.encodeWithSelector(PonsDrip.BadProof.selector, id, stranger));
        drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));
    }

    function test_distribute_cannotOutrunTheSchedule() public {
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = MerkleTreeLib.leafOf(HOLDERS[0], WAD * 2);
        leaves[1] = MerkleTreeLib.leafOf(HOLDERS[1], WAD);
        bytes32 root = MerkleTreeLib.build(leaves);

        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, RATE, EVERY, 0, address(0), true);
        vm.stopPrank();

        address[] memory accounts = new address[](1);
        uint256[] memory shares = new uint256[](1);
        bytes32[][] memory proofs = new bytes32[][](1);
        accounts[0] = HOLDERS[0];
        shares[0] = WAD * 2;
        proofs[0] = MerkleTreeLib.proofFor(leaves, 0);

        uint256 released = drips.releasedAt(id, block.timestamp);
        vm.prank(dev);
        uint256 total = drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        assertEq(total, released, "paid past the curve");
        assertEq(token.balanceOf(HOLDERS[0]), released);
    }

    /// @dev The case the amounts exist for. A paid holder sells and leaves the tree, so the
    /// holders who remain are owed more in total than is left. The keeper sends each their
    /// share of what is left, and nobody is starved because someone else came first.
    function test_distribute_splitsWhatIsLeftWhenOwedExceedsIt() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        bytes32 root = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        drips.distribute(id, root, accounts, shares, proofs, _all(3));

        // The whale sells. The new split is mid 60%, minnow 40%, over a history the whale was
        // paid half of, so between them they are owed far more than the next round releases.
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = MerkleTreeLib.leafOf(mid, (WAD * 60) / 100);
        leaves[1] = MerkleTreeLib.leafOf(minnow, (WAD * 40) / 100);
        bytes32 root2 = MerkleTreeLib.build(leaves);
        vm.prank(dev);
        drips.updateRoot(id, root2, 2);

        vm.warp(block.timestamp + EVERY);
        uint256 room = drips.releasedAt(id, block.timestamp) - drips.getDrip(id).claimed;
        address[] memory two = new address[](2);
        uint256[] memory twoShares = new uint256[](2);
        bytes32[][] memory twoProofs = new bytes32[][](2);
        uint256[] memory amounts = new uint256[](2);
        two[0] = mid;
        two[1] = minnow;
        twoShares[0] = (WAD * 60) / 100;
        twoShares[1] = (WAD * 40) / 100;
        twoProofs[0] = MerkleTreeLib.proofFor(leaves, 0);
        twoProofs[1] = MerkleTreeLib.proofFor(leaves, 1);
        amounts[0] = (room * twoShares[0]) / WAD;
        amounts[1] = (room * twoShares[1]) / WAD;

        uint256 midBefore = token.balanceOf(mid);
        uint256 minnowBefore = token.balanceOf(minnow);
        vm.prank(dev);
        drips.distribute(id, root2, two, twoShares, twoProofs, amounts);

        assertEq(token.balanceOf(mid) - midBefore, amounts[0], "mid did not get 60% of what was left");
        assertEq(token.balanceOf(minnow) - minnowBefore, amounts[1], "minnow was starved");
        assertLe(drips.getDrip(id).claimed, drips.releasedAt(id, block.timestamp));
    }

    /// @dev An amount can hold a payment back. It can never push one past what is owed.
    function test_distribute_anAmountCannotInflateAPayment() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = RESERVE; // asks for the whole reserve for the whale
        amounts[1] = 1 ether;
        amounts[2] = 0;

        bytes32 root = drips.getDrip(id).merkleRoot;
        uint256 released = drips.releasedAt(id, block.timestamp);
        vm.prank(dev);
        drips.distribute(id, root, accounts, shares, proofs, amounts);

        assertEq(token.balanceOf(whale), _owed(released, 50), "amount inflated a payment");
        assertEq(token.balanceOf(mid), 1 ether);
        assertEq(token.balanceOf(minnow), 0);
        assertEq(drips.claimedBy(id, mid), 1 ether, "held-back remainder was written off");
    }

    function test_distribute_rejectsMismatchedLengths() public {
        uint256 id = _create(true);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();
        uint256[] memory short = new uint256[](2);
        short[0] = shares[0];
        short[1] = shares[1];

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        vm.expectRevert(PonsDrip.LengthMismatch.selector);
        drips.distribute(id, current, accounts, short, proofs, _all(accounts.length));
    }

    /// @dev After a stop the keeper still delivers what went out before it, and the books
    /// close: everything released is paid, everything else went home, nothing is left owed.
    function test_distribute_settlesEverythingAfterAStop() public {
        uint256 id = _create(true);
        vm.warp(block.timestamp + 10 * EVERY);
        (address[] memory accounts, uint256[] memory shares, bytes32[][] memory proofs) = _batch();

        vm.prank(dev);
        drips.stop(id);
        vm.warp(block.timestamp + 50 * EVERY);

        bytes32 current = drips.getDrip(id).merkleRoot;
        vm.prank(dev);
        drips.distribute(id, current, accounts, shares, proofs, _all(accounts.length));

        uint256 released = drips.releasedAt(id, block.timestamp);
        uint256 dust = released - drips.getDrip(id).claimed;
        // Integer division may leave a wei or two per holder behind; never more.
        assertLe(dust, 3, "left owed tokens undelivered");
        assertEq(token.balanceOf(address(drips)), dust);
    }

    /// @dev What one keeper transaction costs at a realistic batch size. Printed, not asserted:
    /// it is the number the batch size in the keeper is chosen from.
    function test_distribute_gasForAHundredHolders() public {
        uint256 n = 100;
        bytes32[] memory leaves = new bytes32[](n);
        address[] memory accounts = new address[](n);
        uint256[] memory shares = new uint256[](n);
        bytes32[][] memory proofs = new bytes32[][](n);
        for (uint256 i = 0; i < n; ++i) {
            accounts[i] = address(uint160(0x10000 + i));
            shares[i] = WAD / n;
            leaves[i] = MerkleTreeLib.leafOf(accounts[i], shares[i]);
        }
        bytes32 root = MerkleTreeLib.build(leaves);
        for (uint256 i = 0; i < n; ++i) proofs[i] = MerkleTreeLib.proofFor(leaves, i);

        vm.startPrank(dev);
        token.approve(address(drips), RESERVE);
        uint256 id = drips.create(address(token), RESERVE, root, 1, 0, RATE, EVERY, 0, address(0), true);
        vm.stopPrank();
        vm.warp(block.timestamp + EVERY);

        vm.prank(dev);
        uint256 before = gasleft();
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        uint256 firstPush = before - gasleft();

        vm.warp(block.timestamp + EVERY);
        vm.prank(dev);
        before = gasleft();
        drips.distribute(id, root, accounts, shares, proofs, _all(accounts.length));
        uint256 laterPush = before - gasleft();

        emit log_named_uint("gas, first push to 100 new holders", firstPush);
        emit log_named_uint("gas, later push to the same 100", laterPush);
        assertEq(token.balanceOf(accounts[0]), (drips.releasedAt(id, block.timestamp) * shares[0]) / WAD);
    }
}
