// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PonsAirdrop} from "../src/PonsAirdrop.sol";
import {MockToken} from "./mocks/Tokens.sol";

/**
 * @notice Proves the TypeScript snapshot tool and this contract agree on the tree.
 *
 * The root and proofs below were produced by web/lib/airdrops/merkle.ts, which builds with
 * OpenZeppelin's StandardMerkleTree. They are pasted here verbatim and never recomputed in
 * Solidity, which is the whole point: if either side ever changes how it hashes a leaf,
 * sorts a pair or promotes an odd node, this test fails.
 *
 * That failure mode is otherwise invisible. A mismatched implementation still produces a
 * perfectly well-formed root, publishes happily on chain, and rejects every single claim.
 *
 * To regenerate, run the snapshot tool over the same three values:
 *   0x..01 -> 500000e18, 0x..02 -> 300000e18, 0x..03 -> 200000e18
 */
contract CrossLanguageMerkleTest is Test {
    PonsAirdrop internal drops;
    MockToken internal token;
    address internal dev = address(0xDE7);

    uint256 internal constant E18 = 1e18;
    uint256 internal constant POOL = 1_000_000 * E18;

    /// @dev Emitted by @openzeppelin/merkle-tree, not by this file.
    bytes32 internal constant TS_ROOT =
        0x14fd7943e10f40fbc7d7881bcf01509d7d173b90209f6ce898c998e0e33c64f6;

    function setUp() public {
        vm.warp(1_760_000_000);
        drops = new PonsAirdrop();
        token = new MockToken("Span", "SPAN", 10_000_000 * E18);
        token.transfer(dev, 5_000_000 * E18);
    }

    function _create() internal returns (uint256 id) {
        uint64 startsAt = uint64(block.timestamp) + 1 days;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        id = drops.create(address(token), POOL, TS_ROOT, 1, startsAt, startsAt + 30 days);
        vm.stopPrank();
        vm.warp(startsAt);
    }

    function test_solidityAcceptsEveryProofTypescriptProduced() public {
        uint256 id = _create();

        // Holder 1, 500,000.
        bytes32[] memory p0 = new bytes32[](2);
        p0[0] = 0x0ecb7e4024b5a304d43d420f6fe9b3ab616e6d27671512893c71c491aa6fbb09;
        p0[1] = 0xa69d8210ad7194ffee90424b24f2f60f2f16ea25accca9a5585ae835fbdfaae4;
        vm.prank(address(0x1));
        drops.claim(id, 500_000 * E18, p0);
        assertEq(token.balanceOf(address(0x1)), 500_000 * E18);

        // Holder 2, 300,000.
        bytes32[] memory p1 = new bytes32[](2);
        p1[0] = 0x597bc6742f789a941fdaef733de5d0b635eb763ba6024b12c2aacf822e025f9d;
        p1[1] = 0xa69d8210ad7194ffee90424b24f2f60f2f16ea25accca9a5585ae835fbdfaae4;
        vm.prank(address(0x2));
        drops.claim(id, 300_000 * E18, p1);
        assertEq(token.balanceOf(address(0x2)), 300_000 * E18);

        // Holder 3, 200,000. An odd node, so its proof is one element shorter.
        bytes32[] memory p2 = new bytes32[](1);
        p2[0] = 0x97409dbc17d83e4f56c65ac0931090891049cd1846f0c32a0f7c89a9dc7d3147;
        vm.prank(address(0x3));
        drops.claim(id, 200_000 * E18, p2);
        assertEq(token.balanceOf(address(0x3)), 200_000 * E18);

        // And the pool is exactly emptied, which is the arithmetic agreeing as well as the
        // hashing.
        assertEq(drops.getAirdrop(id).claimed, POOL);
        assertEq(token.balanceOf(address(drops)), 0);
    }

    /// @dev The same proof against a root built any other way must not verify.
    function test_aDifferentRootRejectsTheseProofs() public {
        uint64 startsAt = uint64(block.timestamp) + 1 days;
        vm.startPrank(dev);
        token.approve(address(drops), POOL);
        uint256 id = drops.create(
            address(token), POOL, bytes32(uint256(TS_ROOT) + 1), 1, startsAt, startsAt + 30 days
        );
        vm.stopPrank();
        vm.warp(startsAt);

        bytes32[] memory p0 = new bytes32[](2);
        p0[0] = 0x0ecb7e4024b5a304d43d420f6fe9b3ab616e6d27671512893c71c491aa6fbb09;
        p0[1] = 0xa69d8210ad7194ffee90424b24f2f60f2f16ea25accca9a5585ae835fbdfaae4;

        vm.prank(address(0x1));
        vm.expectRevert(abi.encodeWithSelector(PonsAirdrop.BadProof.selector, id, address(0x1)));
        drops.claim(id, 500_000 * E18, p0);
    }
}
