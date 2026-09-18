// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

/// @dev Builds the same tree the off-chain snapshot builds, so the tests exercise the real
/// verification path rather than a hand-written proof that happens to line up.
///
/// Pairs are hashed commutatively (sorted before hashing), matching OpenZeppelin's
/// MerkleProof. Leaves are double-hashed for the same reason the contract expects: a single
/// hash lets an internal node be replayed as a leaf.
library MerkleTreeLib {
    function leafOf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// @dev An odd node at any level is promoted rather than paired with itself, which is
    /// what the standard JavaScript builders do.
    function build(bytes32[] memory leaves) internal pure returns (bytes32 root) {
        require(leaves.length > 0, "no leaves");
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            uint256 next = (level.length + 1) / 2;
            bytes32[] memory parents = new bytes32[](next);
            for (uint256 i = 0; i < next; ++i) {
                uint256 left = i * 2;
                parents[i] = left + 1 < level.length
                    ? _hashPair(level[left], level[left + 1])
                    : level[left];
            }
            level = parents;
        }
        return level[0];
    }

    function proofFor(bytes32[] memory leaves, uint256 index)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        require(index < leaves.length, "index out of range");

        bytes32[] memory scratch = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; ++i) scratch[i] = leaves[i];

        // Depth is bounded by log2(n); 64 is far more than any realistic snapshot needs.
        bytes32[] memory collected = new bytes32[](64);
        uint256 depth = 0;
        uint256 position = index;
        bytes32[] memory level = scratch;

        while (level.length > 1) {
            uint256 sibling = position ^ 1;
            if (sibling < level.length) {
                collected[depth] = level[sibling];
                depth += 1;
            }
            uint256 next = (level.length + 1) / 2;
            bytes32[] memory parents = new bytes32[](next);
            for (uint256 i = 0; i < next; ++i) {
                uint256 left = i * 2;
                parents[i] = left + 1 < level.length
                    ? _hashPair(level[left], level[left + 1])
                    : level[left];
            }
            level = parents;
            position /= 2;
        }

        proof = new bytes32[](depth);
        for (uint256 i = 0; i < depth; ++i) proof[i] = collected[i];
    }
}
