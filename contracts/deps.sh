#!/usr/bin/env bash
# Restores the pinned Foundry dependencies.
#
# Pinned by tag rather than floating, and cloned rather than submoduled so the tree stays
# simple. Same versions as the other pons contracts, so a pattern that has been reviewed
# once does not have to be reviewed again against a different OpenZeppelin.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf lib && mkdir -p lib
git clone --depth 1 --branch v1.16.2 -q https://github.com/foundry-rs/forge-std.git lib/forge-std
git clone --depth 1 --branch v5.7.0  -q https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
rm -rf lib/forge-std/.git lib/openzeppelin-contracts/.git
echo "forge-std v1.16.2 + openzeppelin-contracts v5.7.0 restored"
