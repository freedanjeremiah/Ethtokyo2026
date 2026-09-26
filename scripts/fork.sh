#!/usr/bin/env bash
set -euo pipefail

# Starts a local anvil fork of Sepolia for FNS development/testing.
# Override the fork source with SEPOLIA_RPC_URL; defaults to a public RPC.

FORK_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"

# Prefer anvil on PATH; fall back to the Foundry default install location.
if [ -n "${ANVIL:-}" ]; then
  ANVIL_BIN="${ANVIL}"
elif command -v anvil >/dev/null 2>&1; then
  ANVIL_BIN="anvil"
else
  ANVIL_BIN="${HOME}/.foundry/bin/anvil"
fi

exec "${ANVIL_BIN}" \
  --fork-url "${FORK_URL}" \
  --chain-id 11155111 \
  --port 8545
