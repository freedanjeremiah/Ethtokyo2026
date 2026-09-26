# FNS contracts

Foundry project holding `contracts/test/Mount.t.sol`: fork tests against the real, deployed
ENSv2 contracts on Sepolia (no mocks — see
`../deployments/sepolia.json` for the pinned addresses). There is no FNS Solidity source of
its own; FNS composes stock ENSv2 registries and resolvers from scripts (`../scripts/`) and a
TypeScript verifier (`../packages/verifier/`).

## Test

```shell
SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co forge test -vv
```

The RPC must be an **archive** node: the tests fork at block 11,784,409. Pruned endpoints such as
publicnode and 0xrpc.io fail in `setUp()` with "historical state … is not available".

The tests select their own fork with `vm.createSelectFork("sepolia", FORK_BLOCK)`, which reads the
`sepolia` RPC endpoint from `foundry.toml` (`${SEPOLIA_RPC_URL}`) — don't also pass `--fork-url
"$SEPOLIA_RPC_URL"` on this line: in a fresh shell that hasn't exported the var, it expands to
`--fork-url ""`, which forge rejects.

See `../README.md` for the full runbook (fork setup, demo scripts, verifier CLI, app).
