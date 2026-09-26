# MOUNT contracts

Foundry project holding `contracts/test/Mount.t.sol`: fork tests against the real, deployed
ENSv2 contracts on Sepolia (no mocks — see `../docs/ensv2-notes.md` for the pinned addresses and
`../deployments/sepolia.json` for the machine-readable copy). There is no MOUNT Solidity source of
its own; MOUNT composes stock ENSv2 registries and resolvers from scripts (`../scripts/`) and a
TypeScript verifier (`../packages/verifier/`).

## Test

```shell
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test --fork-url "$SEPOLIA_RPC_URL" -vv
```

See `../README.md` for the full runbook (fork setup, demo scripts, verifier CLI, app).
