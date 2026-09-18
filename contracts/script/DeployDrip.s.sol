// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {PonsDrip} from "../src/PonsDrip.sol";
import {ArbSys} from "../src/ArbSys.sol";

/// @notice Deploys PonsDrip alone and adds it to an existing deployment file.
///
/// @dev Separate from Deploy.s.sol on purpose. That one deploys all three contracts and
/// rewrites the address file, which is right for a fresh chain and wrong for this one: PonsLock
/// already holds real locks, and re-running it would hand the app a brand new lockbox address
/// while the tokens stayed in the old one. Every lock on the site would vanish.
///
/// This adds a contract without touching the two that are already live, and it refuses to run
/// if there is no existing deployment to add to, because writing a file with one address in it
/// would lose the other two just as thoroughly.
///
/// forge script script/DeployDrip.s.sol --rpc-url robinhood_testnet --broadcast --verify
contract DeployDrip is Script {
    function run() external {
        // Same canary as the full deploy: every nonReentrant function on PonsDrip is built on
        // transient storage, and a chain without EIP-1153 fails invisibly until a claim reverts.
        uint256 probe;
        assembly ("memory-safe") {
            tstore(0, 0xc0ffee)
            probe := tload(0)
        }
        require(probe == 0xc0ffee, "EIP-1153 unavailable: ReentrancyGuardTransient would brick");

        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        require(vm.exists(path), "No deployment for this chain: run Deploy.s.sol instead");
        string memory existing = vm.readFile(path);

        address lockbox = vm.parseJsonAddress(existing, ".PonsLock");
        address airdrops = vm.parseJsonAddress(existing, ".PonsAirdrop");
        uint256 deployedAtBlock = vm.parseJsonUint(existing, ".deployedAtBlock");

        vm.startBroadcast();
        PonsDrip drips = new PonsDrip();
        vm.stopBroadcast();

        console.log("chainId      ", block.chainid);
        console.log("PonsLock     ", lockbox, "(untouched)");
        console.log("PonsAirdrop  ", airdrops, "(untouched)");
        console.log("PonsDrip     ", address(drips), "(new)");
        console.log("L2 block     ", ArbSys.l2BlockNumber());

        // Only a real broadcast may touch the address file. `vm.writeFile` runs during a dry
        // run too, so without this guard a simulation would stamp the address of a contract
        // that was never deployed into the file the web app reads, and the app would send
        // approvals to nothing.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("simulation only: deployments file left alone");
            return;
        }

        // deployedAtBlock stays where it was: it is where an indexer starts, and the earlier
        // of the two is the one that finds every event.
        vm.writeFile(
            path,
            string.concat(
                '{\n  "chainId": ',
                vm.toString(block.chainid),
                ',\n  "PonsLock": "',
                vm.toString(lockbox),
                '",\n  "PonsAirdrop": "',
                vm.toString(airdrops),
                '",\n  "PonsDrip": "',
                vm.toString(address(drips)),
                '",\n  "deployedAtBlock": ',
                vm.toString(deployedAtBlock),
                "\n}\n"
            )
        );
        console.log("wrote", path);
    }
}
