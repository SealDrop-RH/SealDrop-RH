// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

/// @dev Writes and reads a transient slot. If EIP-1153 is unavailable the call fails here,
/// loudly and for a few cents, rather than silently bricking every `nonReentrant` function
/// on PonsLock and PonsAirdrop after they hold real money. ReentrancyGuardTransient is built
/// entirely on TSTORE/TLOAD, and a chain without them does not fail at deploy time.
contract TstoreProbe {
    function probe() external returns (uint256 value) {
        assembly ("memory-safe") {
            tstore(0, 0xc0ffee)
            value := tload(0)
        }
    }
}

/// @notice Run against any chain BEFORE deploying there.
/// forge script script/TstoreCanary.s.sol --rpc-url robinhood_testnet --broadcast
contract TstoreCanary is Script {
    error TstoreUnsupported(uint256 got);

    function run() external {
        vm.startBroadcast();
        TstoreProbe probe = new TstoreProbe();
        uint256 value = probe.probe();
        vm.stopBroadcast();

        if (value != 0xc0ffee) revert TstoreUnsupported(value);
        console.log("EIP-1153 transient storage OK on chain", block.chainid);
        console.log("ReentrancyGuardTransient is safe to deploy here.");
    }
}
