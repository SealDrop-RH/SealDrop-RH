// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PonsLock} from "../src/PonsLock.sol";
import {PonsAirdrop} from "../src/PonsAirdrop.sol";
import {PonsDrip} from "../src/PonsDrip.sol";
import {ArbSys} from "../src/ArbSys.sol";

/// @notice Deploys both contracts and writes the addresses where the web app can read them.
///
/// @dev Neither contract takes constructor arguments and neither has an owner, so there is
/// nothing to configure and nothing to hand over afterwards. The deployer address has no
/// more power over a lock than any other wallet, which is the point.
///
/// forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
contract Deploy is Script {
    function run() external {
        // Re-checked here as well as in the canary: transient storage is load-bearing for
        // every nonReentrant function on both contracts, and a chain without it fails in a
        // way that is invisible until someone's withdrawal reverts.
        uint256 probe;
        assembly ("memory-safe") {
            tstore(0, 0xc0ffee)
            probe := tload(0)
        }
        require(probe == 0xc0ffee, "EIP-1153 unavailable: ReentrancyGuardTransient would brick");

        vm.startBroadcast();
        PonsLock lockbox = new PonsLock();
        PonsAirdrop airdrops = new PonsAirdrop();
        PonsDrip drips = new PonsDrip();
        vm.stopBroadcast();

        console.log("chainId      ", block.chainid);
        console.log("PonsLock     ", address(lockbox));
        console.log("PonsAirdrop  ", address(airdrops));
        console.log("PonsDrip     ", address(drips));
        console.log("L2 block     ", ArbSys.l2BlockNumber());

        _write(block.chainid, address(lockbox), address(airdrops), address(drips));
    }

    /// @dev One JSON file per chain, read by the web app's generated address map. Written
    /// rather than pasted, so the addresses in the app cannot drift from what was deployed.
    function _write(uint256 chainId, address lockbox, address airdrops, address drips) private {
        string memory json = string.concat(
            '{\n  "chainId": ',
            vm.toString(chainId),
            ',\n  "PonsLock": "',
            vm.toString(lockbox),
            '",\n  "PonsAirdrop": "',
            vm.toString(airdrops),
            '",\n  "PonsDrip": "',
            vm.toString(drips),
            '",\n  "deployedAtBlock": ',
            // The L2 height, not block.number. On this chain block.number is the Ethereum L1
            // height, and an indexer starting from it would scan a hundred million empty
            // blocks before reaching the first event. See src/ArbSys.sol.
            vm.toString(ArbSys.l2BlockNumber()),
            "\n}\n"
        );
        string memory path = string.concat("./deployments/", vm.toString(chainId), ".json");
        vm.writeFile(path, json);
        console.log("wrote", path);
    }
}
