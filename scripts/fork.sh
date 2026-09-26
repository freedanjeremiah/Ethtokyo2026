#!/usr/bin/env bash
set -euo pipefail

# Starts a local anvil fork of Sepolia for MOUNT development/testing.
# Override the fork source with SEPOLIA_RPC_URL; defaults to a public RPC.

FORK_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"

exec ~/.foundry/bin/anvil \
  --fork-url "${FORK_URL}" \
  --chain-id 11155111 \
  --port 8545
