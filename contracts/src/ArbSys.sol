// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Arbitrum Nitro system precompile.
/// @dev Robinhood Chain is an Arbitrum Orbit chain, so `block.number` inside the EVM reports
/// the Ethereum L1 height, not this chain's. On testnet that is ~11.7M against a real L2
/// height of ~119.9M: a gap of a hundred and eight million blocks. Recording the wrong one as
/// a contract's deploy block makes every from-deploy log scan sweep that entire gap before
/// reaching the first real event.
///
/// `block.timestamp` is unaffected and remains the correct clock, which is why every deadline
/// in these contracts is a timestamp rather than a block height.
interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbChainID() external view returns (uint256);
    function arbOSVersion() external view returns (uint256);
}

library ArbSys {
    address internal constant PRECOMPILE = address(0x64);

    /// @notice The real L2 block height.
    /// @dev Falls back to `block.number` on a plain EVM chain such as anvil, where the
    /// precompile does not exist and the two numbers are the same thing anyway.
    function l2BlockNumber() internal view returns (uint256) {
        (bool ok, bytes memory data) =
            PRECOMPILE.staticcall(abi.encodeWithSelector(IArbSys.arbBlockNumber.selector));
        return ok && data.length == 32 ? abi.decode(data, (uint256)) : block.number;
    }
}
