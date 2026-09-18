// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PonsAirdrop} from "../src/PonsAirdrop.sol";
import {MerkleTreeLib} from "./MerkleTreeLib.sol";
import {MockToken, FeeToken} from "./mocks/Tokens.sol";

contract PonsAirdropTest is Test {
    using MerkleTreeLib for bytes32[];

    PonsAirdrop internal drops;
    MockToken internal token;

    address internal dev = address(0xDE7);
    address internal whale = address(0x1);
    address internal mid = address(0x2);
    address internal minnow = address(0x3);
    address internal stranger = address(0x4);

    uint256 internal constant POOL = 1_000_000 ether;
    uint64 internal constant DAY = 1 days;

    /// @dev The snapshot: three qualifying holders splitting the pool 50 / 30 / 20.
    address[3] internal HOLDERS = [address(0x1), address(0x2), address(0x3)];
    uint256[3] internal CUTS = [500_000 ether, 300_000 ether, 200_000 ether];

    bytes32[] internal leaves;
    bytes32 internal root;

    function setUp() public {
        vm.warp(1_760_000_000);
        drops = new PonsAirdrop();
        token = new MockToken("Span", "SPAN", 10_000_000 ether);
        token.transfer(dev, 5_000_000 ether);

        for (uint256 i = 0; i < HOLDERS.length; ++i) {
            leaves.push(MerkleTreeLib.leafOf(HOLDERS[i], CUTS[i]));
        }
        root = MerkleTreeLib.build(leaves);
    }

    function _create() internal returns (uint256 id) {
        uint64 startsAt = uint64(block.timestamp) + 7 * DAY;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        id = drops.create(address(token), POOL, root, uint64(block.number), startsAt, startsAt + 90 * DAY);
        vm.stopPrank();
    }

    function _open(uint256 id) internal {
        vm.warp(drops.getAirdrop(id).startsAt);
    }

    function _claim(uint256 id, uint256 index) internal {
        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, index);
        vm.prank(HOLDERS[index]);
        drops.claim(id, CUTS[index], proof);
    }

    /* ---------------------------------------------------------------- create ---- */

    function test_create_holdsThePoolAndPublishesTheRoot() public {
        uint256 id = _create();
        PonsAirdrop.Airdrop memory drop = drops.getAirdrop(id);

        assertEq(drop.creator, dev);
        assertEq(drop.pool, POOL);
        assertEq(drop.claimed, 0);
        assertEq(drop.merkleRoot, root);
        assertEq(token.balanceOf(address(drops)), POOL, "the pool is funded up front");
    }

    function test_create_rejectsAnEmptyPoolOrRoot() public {
        uint64 startsAt = uint64(block.timestamp) + DAY;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        vm.expectRevert(PonsAirdrop.PoolZero.selector);
        drops.create(address(token), 0, root, 1, startsAt, startsAt + DAY);

        vm.expectRevert(PonsAirdrop.RootZero.selector);
        drops.create(address(token), POOL, bytes32(0), 1, startsAt, startsAt + DAY);
        vm.stopPrank();
    }

    /// @dev Reclaiming before claiming opens would make the whole thing a no-op the creator
    /// could unwind at will.
    function test_create_refusesAReclaimDateBeforeClaimingOpens() public {
        uint64 startsAt = uint64(block.timestamp) + 7 * DAY;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        vm.expectRevert(
            abi.encodeWithSelector(PonsAirdrop.ReclaimBeforeStart.selector, startsAt - 1, startsAt)
        );
        drops.create(address(token), POOL, root, 1, startsAt, startsAt - 1);
        vm.stopPrank();
    }

    function test_create_recordsWhatArrivedFromAFeeToken() public {
        FeeToken fee = new FeeToken(1_000, 10_000_000 ether); // 10%
        fee.transfer(dev, 5_000_000 ether);
        uint64 startsAt = uint64(block.timestamp) + DAY;

        vm.startPrank(dev);
        fee.approve(address(drops), POOL);
        uint256 id = drops.create(address(fee), POOL, root, 1, startsAt, startsAt + DAY);
        vm.stopPrank();

        assertEq(drops.getAirdrop(id).pool, 900_000 ether, "the pool is what arrived");
    }

    /* ----------------------------------------------------------------- claim ---- */

    function test_claim_paysTheProvenAllocation() public {
        uint256 id = _create();
        _open(id);
        _claim(id, 0);

        assertEq(token.balanceOf(whale), CUTS[0]);
        assertEq(drops.claimedBy(id, whale), CUTS[0]);
        assertEq(drops.getAirdrop(id).claimed, CUTS[0]);
    }

    function test_claim_distributesTheWholePoolAcrossTheSnapshot() public {
        uint256 id = _create();
        _open(id);
        for (uint256 i = 0; i < HOLDERS.length; ++i) _claim(id, i);

        assertEq(drops.getAirdrop(id).claimed, POOL, "every unit is allocated");
        assertEq(token.balanceOf(address(drops)), 0);
    }

    function test_claim_refusesBeforeItOpens() public {
        uint256 id = _create();
        uint64 startsAt = drops.getAirdrop(id).startsAt;
        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);

        vm.prank(whale);
        vm.expectRevert(
            abi.encodeWithSelector(PonsAirdrop.NotOpenYet.selector, id, startsAt, uint64(block.timestamp))
        );
        drops.claim(id, CUTS[0], proof);
    }

    function test_claim_cannotHappenTwice() public {
        uint256 id = _create();
        _open(id);
        _claim(id, 0);

        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);
        vm.prank(whale);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.NothingToClaim.selector, id, whale));
        drops.claim(id, CUTS[0], proof);
    }

    /// @dev The point of the Merkle root: a wallet that was not in the snapshot gets nothing,
    /// however much of the token it holds now.
    function test_claim_refusesAWalletNotInTheSnapshot() public {
        uint256 id = _create();
        _open(id);
        token.transfer(stranger, 1_000_000 ether); // holds plenty, was not snapshotted

        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.BadProof.selector, id, stranger));
        drops.claim(id, CUTS[0], proof);
    }

    /// @dev And a snapshotted wallet cannot inflate its own number.
    function test_claim_refusesAnInflatedAmount() public {
        uint256 id = _create();
        _open(id);
        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 2);

        vm.prank(minnow);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.BadProof.selector, id, minnow));
        drops.claim(id, CUTS[2] + 1, proof);
    }

    function test_claim_refusesSomeoneElsesProof() public {
        uint256 id = _create();
        _open(id);
        bytes32[] memory whaleProof = MerkleTreeLib.proofFor(leaves, 0);

        vm.prank(mid);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.BadProof.selector, id, mid));
        drops.claim(id, CUTS[0], whaleProof);
    }

    /**
     * @dev The attack the Merkle root exists to stop.
     *
     * A live `balanceOf` at claim time would pay this out: the caller holds an enormous
     * balance at the moment of the call. Against a snapshot it is worth nothing, because the
     * snapshot was taken before they had it.
     */
    function test_claim_isUnaffectedByBuyingAfterTheSnapshot() public {
        uint256 id = _create();
        _open(id);

        // A flash loan, or simply a large purchase, lands in the attacker's wallet.
        token.transfer(stranger, 2_000_000 ether);
        assertGt(token.balanceOf(stranger), POOL);

        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.BadProof.selector, id, stranger));
        drops.claim(id, CUTS[0], proof);

        // And a holder who WAS snapshotted gets exactly their snapshot cut, not a larger one
        // reflecting anything they bought afterwards.
        token.transfer(whale, 2_000_000 ether);
        _claim(id, 0);
        assertEq(drops.claimedBy(id, whale), CUTS[0]);
    }

    /* ---------------------------------------------------------------- adjust ---- */

    function test_adjust_changesTermsBeforeItOpens() public {
        uint256 id = _create();
        uint64 later = uint64(block.timestamp) + 30 * DAY;

        vm.startPrank(dev);
        token.approve(address(drops), 500_000 ether);
        drops.adjust(id, 500_000 ether, root, later);
        vm.stopPrank();

        PonsAirdrop.Airdrop memory drop = drops.getAirdrop(id);
        assertEq(drop.pool, POOL + 500_000 ether);
        assertEq(drop.startsAt, later);
    }

    /// @dev The rule the design rests on. Once holders can act on the terms, they are fixed.
    function test_adjust_isRefusedOnceClaimingOpens() public {
        uint256 id = _create();
        uint64 startsAt = drops.getAirdrop(id).startsAt;
        vm.warp(startsAt);

        vm.prank(dev);
        vm.expectRevert(
            abi.encodeWithSelector(PonsAirdrop.TermsFrozen.selector, id, startsAt, startsAt)
        );
        drops.adjust(id, 0, root, startsAt + 30 * DAY);
    }

    function test_adjust_refusesAnyoneButTheCreator() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.NotCreator.selector, id, stranger));
        drops.adjust(id, 0, root, uint64(block.timestamp) + 30 * DAY);
    }

    /* --------------------------------------------------------------- reclaim ---- */

    function test_reclaim_returnsOnlyWhatNobodyTook() public {
        uint256 id = _create();
        _open(id);
        _claim(id, 0); // whale takes 500k of the 1M

        vm.warp(drops.getAirdrop(id).reclaimableAt);
        uint256 before = token.balanceOf(dev);
        vm.prank(dev);
        drops.reclaim(id);

        assertEq(token.balanceOf(dev) - before, 500_000 ether, "only the unclaimed half comes back");
        // The record of what holders took survives, so the page still reads correctly.
        assertEq(drops.getAirdrop(id).claimed, 500_000 ether);
    }

    function test_reclaim_refusesBeforeItsDate() public {
        uint256 id = _create();
        PonsAirdrop.Airdrop memory drop = drops.getAirdrop(id);
        _open(id);

        vm.prank(dev);
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsAirdrop.NotReclaimableYet.selector, id, drop.reclaimableAt, drop.startsAt
            )
        );
        drops.reclaim(id);
    }

    function test_reclaim_cannotBeBroughtForward() public {
        uint256 id = _create();
        uint64 current = drops.getAirdrop(id).reclaimableAt;
        vm.prank(dev);
        vm.expectRevert(
            abi.encodeWithSelector(PonsAirdrop.CannotShortenReclaim.selector, current, current - 1)
        );
        drops.extendReclaim(id, current - 1);
    }

    /// @dev A claim after a reclaim must not pay out of another airdrop's tokens.
    function test_claim_afterReclaimFindsAnEmptyPool() public {
        uint256 id = _create();
        _open(id);
        vm.warp(drops.getAirdrop(id).reclaimableAt);
        vm.prank(dev);
        drops.reclaim(id);

        bytes32[] memory proof = MerkleTreeLib.proofFor(leaves, 0);
        vm.prank(whale);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.PoolExhausted.selector, id, 0, CUTS[0]));
        drops.claim(id, CUTS[0], proof);
    }

    function test_deployerHasNoPowerOverAPool() public {
        uint256 id = _create();
        address deployer = address(this);

        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.NotCreator.selector, id, deployer));
        drops.adjust(id, 0, root, uint64(block.timestamp) + 30 * DAY);

        vm.warp(drops.getAirdrop(id).reclaimableAt);
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.NotCreator.selector, id, deployer));
        drops.reclaim(id);
    }

    /* ----------------------------------------------------------------- fuzz ---- */

    /**
     * @dev Allocations are allowed to sum past the pool here, on purpose.
     *
     * An off-chain snapshot that over-allocates is a real possibility, and what matters is
     * that the contract refuses to pay out tokens it does not hold rather than dipping into
     * another airdrop's pool. So each claim is allowed to fail, and the invariant is checked
     * against whatever actually happened.
     */
    function testFuzz_neverPaysMoreThanThePool(uint96 a, uint96 b, uint96 c) public {
        uint256 cutA = bound(a, 1 ether, 600_000 ether);
        uint256 cutB = bound(b, 1 ether, 600_000 ether);
        uint256 cutC = bound(c, 1 ether, 600_000 ether);

        bytes32[] memory fuzzLeaves = new bytes32[](3);
        fuzzLeaves[0] = MerkleTreeLib.leafOf(whale, cutA);
        fuzzLeaves[1] = MerkleTreeLib.leafOf(mid, cutB);
        fuzzLeaves[2] = MerkleTreeLib.leafOf(minnow, cutC);
        bytes32 fuzzRoot = MerkleTreeLib.build(fuzzLeaves);

        uint64 startsAt = uint64(block.timestamp) + DAY;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        uint256 id = drops.create(address(token), POOL, fuzzRoot, 1, startsAt, startsAt + DAY);
        vm.stopPrank();

        vm.warp(startsAt);
        address[3] memory who = [whale, mid, minnow];
        uint256[3] memory cuts = [cutA, cutB, cutC];
        uint256 paidOut = 0;

        for (uint256 i = 0; i < 3; ++i) {
            uint256 balanceBefore = token.balanceOf(who[i]);
            vm.prank(who[i]);
            // A claim past the remaining pool reverts, which is the behaviour under test.
            try drops.claim(id, cuts[i], MerkleTreeLib.proofFor(fuzzLeaves, i)) {
                paidOut += token.balanceOf(who[i]) - balanceBefore;
            } catch {
                assertEq(token.balanceOf(who[i]), balanceBefore, "a failed claim pays nothing");
            }
        }

        PonsAirdrop.Airdrop memory drop = drops.getAirdrop(id);
        assertLe(drop.claimed, drop.pool, "the contract never pays out more than it holds");
        assertEq(drop.claimed, paidOut, "the ledger matches the tokens that actually moved");
        assertEq(token.balanceOf(address(drops)), drop.pool - drop.claimed);
    }
}
