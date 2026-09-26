#!/usr/bin/env bash
set -euo pipefail

# Starts a local anvil fork of Sepolia for FNS development/testing.
# Override the fork source with SEPOLIA_RPC_URL; it must be an archive node (pruned RPCs such as
# publicnode can't serve the pinned block).
#
# The fork is pinned to FORK_BLOCK (default 11784409, before the live fleet deploy at 11786237):
# on a fork of today's head vendor.eth, shopa.eth, ... already belong to the live actors and
# setup-names refuses to touch them. FORK_BLOCK=latest forks head instead, e.g. to rehearse
# against the live fleet.

FORK_URL="${SEPOLIA_RPC_URL:-https://sepolia.gateway.tenderly.co}"
FORK_BLOCK="${FORK_BLOCK:-11784409}"
BLOCK_ARGS=()
if [ "${FORK_BLOCK}" != "latest" ]; then
  BLOCK_ARGS=(--fork-block-number "${FORK_BLOCK}")
fi

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
  ${BLOCK_ARGS[@]+"${BLOCK_ARGS[@]}"} \
  --chain-id 11155111 \
  --port 8545
