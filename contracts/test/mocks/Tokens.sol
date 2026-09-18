// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev A plain, well-behaved ERC-20.
contract MockToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply) ERC20(name_, symbol_) {
        _mint(msg.sender, supply);
    }
}

/// @dev Takes a cut on every transfer. The reason PonsLock measures what it received rather
/// than trusting the amount it was asked for.
contract FeeToken is ERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 feeBps_, uint256 supply) ERC20("Fee", "FEE") {
        feeBps = feeBps_;
        _mint(msg.sender, supply);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || feeBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * feeBps) / 10_000;
        super._update(from, address(0xdead), fee);
        super._update(from, to, value - fee);
    }
}

/// @dev Returns false instead of reverting, the way some older tokens do. SafeERC20 has to
/// catch this or a failed transfer would look like a successful one.
contract FalseReturningToken is ERC20 {
    constructor(uint256 supply) ERC20("False", "FLS") {
        _mint(msg.sender, supply);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @dev Calls back into the lock during a transfer. Exists purely to be repelled.
contract ReentrantToken is ERC20 {
    address public target;
    bytes public payload;
    bool private _attacking;

    constructor(uint256 supply) ERC20("Reenter", "RNT") {
        _mint(msg.sender, supply);
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && !_attacking) {
            _attacking = true;
            // Ignoring the result on purpose: the point is whether the guard stops it, and
            // the test asserts on the lock's state afterwards.
            (bool ok,) = target.call(payload);
            ok;
            _attacking = false;
        }
    }
}
