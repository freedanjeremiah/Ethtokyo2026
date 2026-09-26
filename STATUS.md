# ENF backend status

The state of everything behind the ENF (Ethereum Naming Fleet) UI, written to get a new reader oriented in the
codebase fast. It covers the on-chain setup, the Foundry tests, the setup and demo scripts, the `@enf/verifier`
package and the Next.js server routes. The pitch is in [`idea.md`](idea.md), the build log in
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), and the full runbook in [`README.md`](README.md).

Last updated: 2026-09-27, branch `feat/mount`.

---

## 1. What the system does, in one paragraph

One ENSv2 `UserRegistry` (the **fleet**) holds three agents: `mia`, `kai` and `rin`. The fleet is **mounted** under
several `.eth` names at once (`support.vendor.eth`, `support.shopa.eth`, `support.shopb.eth`) using
`setSubregistry`. So `mia.support.shopa.eth` and `mia.support.shopb.eth` resolve to the **same ERC-1155 token**.

There are two kill switches, owned by opposite parties:
- A **merchant** unmounts its doorway with one transaction.
- The **vendor** unregisters an agent everywhere with one transaction.

Anyone can also mount the fleet under a name without consent (`support.scam.eth`). That name resolves, and the
**verifier** flags it red, because the fleet's own `enf.parents` record does not list it.

## 2. Repository map

| Path | What it is | Status |
|---|---|---|
| `deployments/sepolia.json`, `deployments/abis/` | Pinned ENSv2 Sepolia addresses, ABIs and code hashes (deployment tag `sepolia-deployment-2026-09-15`). Nothing else hardcodes an address. | Done, checked by `scripts/check-deployment.ts` |
| `deployments/fleet.11155111.json` | The live Sepolia fleet this project deployed (addresses in §3). Written by the setup scripts. | Live |
| `deployments/fleet.anvil.json` | The same file for a local anvil fork. Gitignored. | Local only |
| `contracts/` | Foundry **fork tests** against the real deployed ENSv2 contracts (no mocks), plus interface files. No contracts of our own are deployed; the project only composes ENSv2 primitives. | Done |
| `scripts/` | TypeScript (tsx + viem) setup, demo and check scripts. Actor keys come from `.env.local`. | Done |
| `packages/verifier/` | `@enf/verifier`: the verdict algorithm (C1 to C5), deployment loader and C5 screening adapters. Used by `scripts/verify.ts` and the app. | Done, unit tests passing |
| `app/` | Next.js 16 app: the landing page `/`, the workflow editor `/editor`, and the server routes under `app/src/app/api/`. | Done |
| `docs/` | `ensv2-notes.md` (verified ENSv2 facts), `intercepta.md` (C5 design), `runbook-evidence.md` (fork run logs), `screenshots/` (README evidence). | Done |

## 3. What is live on Sepolia

From `deployments/fleet.11155111.json`:

| Thing | Address |
|---|---|
| Fleet registry (UserRegistry proxy) | `0xb40c4F85B9a7E4B57669C979c16132898a13BedD` (deployed at block 11,786,237) |
| Shared resolver (PermissionedResolver proxy) | `0x8b51e6668b8703fFeE6f0f554cdfeA28457688a4` |
| Vendor (fleet owner, all roles) | `0x1607846398FeF2cB4573445160B57aBA3fB68dDB` |
| Operator (all roles on the shared resolver) | `0x7A9092d9C7fFEc85f2ba5ED037B4FCC9e845b05B` |
| Parent registries | vendor `0xB7B4…6284`, shopa `0x1C4c…1460`, shopb `0xb74E…d282`, scam `0xE9d5…a198` |
| Clean settlement address (default `addr(60)`) | `0xe2841c6Eb0FD27DdB7d5B0738396bC260d31Fe33` |

**On-chain state as of 2026-09-27:** `support.vendor.eth` is **unmounted**, left over from an earlier demo run. Because the
canonical doorway has no registry, check C2 fails for every doorway, and every verdict reads Counterfeit or Not live.
To restore the demo world, run the **Reset the demo** playbook in the editor, or `npx tsx scripts/demo-reset.ts`.

### Topology rules the whole design depends on

- A parent node (`support.<parent>.eth`) gets `setSubregistry` **only**; its resolver stays `0x0`. The shared resolver
  is attached to **members at `register()`**. So non-members and the bare parent return `ResolverNotFound`, a true
  negative, instead of resolving through an inherited resolver.
- Members get **no roles** (`roleBitmap = 0`), which makes them soulbound, and they never hold setter roles on the shared
  resolver. Only the operator does.
- The fleet-wide records live in the shared resolver's **default record** (DNS name `0x00`): `addr(60)`, `enf.canonical`,
  `enf.parents`, `agent-context` and `agent-endpoint[web]` (ENSIP-26). Every member falls back to it with zero
  per-member writes.

## 4. Foundry fork tests (`contracts/test/Mount.t.sol`)

These run against a Sepolia fork (`forge test` with a fork URL; see `contracts/README.md`). Each test proves one claim
from the pitch:

| Test | Claim |
|---|---|
| `test_oneTokenThreeMounts` | One `register()` gives one token that resolves under all three mounts |
| `test_nonMemberAndParentHaveNoResolver` | Non-members and the parent node return `ResolverNotFound` |
| `test_defaultBundleZeroMemberWrites` | Members read the default record with no per-member writes |
| `test_merchantUnmountKillsOnlyItsDoorway` | One merchant transaction kills only that doorway |
| `test_vendorUnregisterKillsAllDoorways` | One vendor transaction kills the agent everywhere |
| `test_parentLapseKillsOnlyThatDoorway` | An expired parent kills only its doorway |
| `test_soulboundEvenViaApprovedOperator` | Member tokens can't be moved, even by an approved operator |
| `test_memberCannotWriteSharedResolver` | A member can't write the shared resolver |
| `test_scopedMemberRoleWouldRewriteEveryone` | Shows why a member must never get a setter role |
| `test_counterfeitMountResolves` | A non-consenting mount resolves (the verifier has to catch it) |

These tests were not re-run in this pass because they need a Sepolia fork URL. The last recorded run is in
`docs/runbook-evidence.md`.

## 5. Scripts (`scripts/`)

All scripts read `RPC_URL` and the actor keys (`VENDOR_PK`, `OPERATOR_PK`, `SHOPA_PK`, `SHOPB_PK`, `SCAM_PK`,
`MIA_PK`, `KAI_PK`, `RIN_PK`) from `.env.local`. Every setup step is idempotent.

| Script | Does |
|---|---|
| `00-keys.ts` | Generates fresh actor keys into `.env.local`; on anvil, also funds them |
| `fund-actors.ts` | Live Sepolia: tops up every signing actor from the vendor |
| `setup-names.ts` | Registers `vendor/shopa/shopb/scam.eth` through the real ETHRegistrar commit/reveal |
| `01-deploy-fleet.ts` | Deploys the fleet registry and shared resolver through VerifiableFactory |
| `02-mount.ts` | Gives each parent its own registry, mounts `support` onto the fleet, sets canonical back-pointers |
| `03-register.ts` | Registers mia, kai and rin (owner = agent key, resolver = shared, no roles) |
| `04-records.ts` | Operator writes the default-record bundle in one multicall |
| `setup-all.ts` | Runs setup-names, then 01 to 04, in order |
| `demo-unmount.ts <parent>` | Kill switch 1: the merchant's `setSubregistry(support, 0x0)` |
| `demo-unregister.ts <label>` | Kill switch 2: the vendor's `unregister(label)` |
| `demo-dirty-settlement.ts` / `demo-clean-settlement.ts` | Point `addr(60)` at an OFAC-sanctioned address, or back to the clean one |
| `demo-counterfeit.ts` | Ensures the counterfeit `support.scam.eth` mount exists |
| `demo-reset.ts` | Remounts everything, rehires everyone, restores the clean address |
| `check-deployment.ts` | Checks the pinned addresses and code hashes against the chain |
| `check-resolution.ts` | Acceptance check using **only stock viem** ENS actions |
| `verify.ts <name>` | Command-line verifier (the same package the app uses) |
| `fork.sh` | Starts an anvil fork of Sepolia |

The dashboard no longer runs these demo scripts on the server (see §7). They remain the terminal and runbook path.

## 6. `@enf/verifier` (`packages/verifier/`)

Input: any name `L.support.P`. The verifier normalises it (ENSIP-15), resolves it through the real UniversalResolver,
and runs these checks. Every check reads the chain, optionally pinned to one block.

| Check | Question | Fails when |
|---|---|---|
| C1 | Is the member token alive? | The label is not registered in the fleet |
| C2 | Is the doorway served by the canonical registry? | The doorway's registry is not the registry at `enf.canonical` (this includes "the canonical name is unmounted") |
| C3 | Two-sided consent: is the parent listed in `enf.parents`? | The parent mounted the fleet but the fleet never listed it (a counterfeit mount) |
| C4 | Is the doorway name alive? | The parent or `support` name has expired |
| C5 | Is the settlement counterparty clean? (optional) | The screening flags `addr(60)` |

The checks combine into one verdict:
- **green:** all checks pass.
- **red:** a counterfeit, because C2 or C3 failed.
- **orange:** an endorsed doorway whose settlement address is flagged by C5.
- **black:** not a live member.

It also checks the same agent under every other doorway ("sibling doorways", capped at 16).

C5 screening adapters (`src/screen/`):
- the Chainalysis **sanctions oracle** on mainnet (keyless, on by default)
- **Intercepta** (Web3 Antivirus), when `INTERCEPTA_API_KEY` is set
- a local deny list, `SCREEN_FLAGGED`

A screening failure is always reported as "unknown", never as clean.

**Tests:**
- `pure`, `screen` and `errors`: 65 tests passing as of 2026-09-27.
- `fork.test.ts`: needs an anvil fork, not run in this pass.

## 7. App server (`app/src/app/api/`, `app/src/lib/*.server.ts`)

| Route | Returns |
|---|---|
| `GET /api/block` | The current block number, polled every second by the editor |
| `GET /api/fleet[?block=n]` | A full scan at one block. It finds every mount of the fleet from `SubregistryUpdated` logs and every agent from `LabelRegistered` logs, verifies every agent × doorway, and returns the recent activity (`fleet-scan.server.ts`) |
| `GET /api/verify?name=&block=` | The verifier result for one name, pinned to the scan's block so every panel agrees |
| `GET /api/actions` | Whether kill switches are available, plus the allowed targets from the fleet file |
| `POST /api/actions {action, target}` | A **plan**: the unsigned transactions still needed, each with the address that must sign it, simulated from that signer first. It is same-origin only. |

### Kill switches hold no keys (changed 2026-09-26)

`actions.server.ts` reads the chain and returns unsigned transactions; the **browser wallet** signs them.
- **Signers** come from on-chain owners (`ETHRegistry.findOwner`) and from the vendor and operator in the fleet file,
  never from a private key.
- **Actions:** `unmount`, `fire`, `dirty`, `clean`, `counterfeit` and `reset`. Each mirrors the matching demo script.
  `dirty` first confirms that the demo address is on the sanctions oracle.
- **Already-done actions** return an empty plan.
- **Availability:** they are available on a live chain and on Vercel. Only `ENF_KILL_SWITCHES=off` disables them.

### RPC resilience (changed 2026-09-26)

`rpc.server.ts` builds one shared client with four behaviours:
- **Fallback endpoints (live chain):** reads try `RPC_URL`, then Tenderly's public Sepolia gateway, then `0xrpc.io/sep`.
  This matters because publicnode rate-limits `eth_getLogs` and rejects address-less log filters, which the mount scan
  needs. On a local anvil fork there is no fallback.
- **Retries for lagging nodes:** errors that mean a node hasn't seen the pinned block yet ("header not found" and
  similar) are retried for up to about 6 seconds.
- **Batching and a request cap:** contract reads are batched into Multicall3 calls, and at most 4 requests are in flight.
- **Readable errors:** `rpcErrorMessage()` adds the node's own reason, so errors no longer say only
  "RPC Request failed."

### Configuration (`deployment.server.ts`)

`serverEnv(key)` reads the shell environment first, then the repo-root `.env.local`. So a plain `next dev` picks up
settings written by the scripts.

| Variable | Used for |
|---|---|
| `RPC_URL` | Chain reads. A local URL means the anvil fork and `fleet.anvil.json`; anything else means Sepolia and `fleet.11155111.json` |
| `FLEET_FILE` | Overrides the fleet file path |
| `ENF_KILL_SWITCHES` | `off` hides the kill switches |
| `SETTLEMENT_ADDRESS` | The clean address for `clean` and `reset` (falls back to the fleet file) |
| `SANCTIONS_RPC_URL`, `SCREEN_SANCTIONS` | Mainnet RPC for the sanctions oracle, and an off switch for it |
| `INTERCEPTA_API_KEY` and `INTERCEPTA_*` | Optional Intercepta screening |
| `SCREEN_FLAGGED` | Local deny list |
| `PUBLIC_BASE_URL` | Written into `agent-endpoint[web]` by `04-records.ts` |
| `*_PK` | **Scripts only.** The app never reads private keys. |

## 8. Frontend, briefly

- **`/`:** the landing page. It shows a labelled replay of a playbook on a mini fleet map, three mechanism sections, and
  links that open each demo playbook in the editor. Old `/?name=` links redirect to `/editor`.
- **`/editor`:** the workflow editor, in three panels:
  - **Left:** a block palette with the playbook library, save and share.
  - **Centre:** a node canvas. Nodes move and are edited in place; wires connect them, and a Check node branches on
    *As expected* or *Otherwise*. A **Fleet map** toggle and a docked live mini map show the fleet.
  - **Right:** Verifier, Coverage and Activity tabs.
  - Both side panels collapse (`[` and `]`).
- **Running:** a run follows the wires from the trigger. Each transaction is signed in the wallet by the name's owner,
  and a check only reads the chain at or after the last transaction's block.
- **Saving:** playbooks are stored in browser storage (`enf.playbooks.v2`) and in share links (`?playbook=`). The share
  link is base64url JSON, validated on load, and older list-format links still open.

## 9. Known gaps

- **Chain state:** the demo world needs a reset before the demo (see §3).
- **Untested flow:** kill switches have not been exercised end to end with a real wallet since the move to browser
  signing. They were tested with a mock wallet that returns an already-mined transaction.
- **Editor:** it has no undo, and the trigger node can't be moved.
- **Unused styles:** `app/src/app/globals.css` still holds the old dashboard's `.controls` and two-column layout styles.
- **Tests not re-run here:** the Foundry and verifier fork tests need a fork RPC and were not run in this pass.

## 10. How to run

```bash
npm install
# live Sepolia (RPC_URL in .env.local, or rely on the built-in fallbacks)
cd app && npx next dev -p 3100          # http://localhost:3100 and /editor
# local fork
./scripts/fork.sh                       # in another terminal
RPC_URL=http://127.0.0.1:8545 npx tsx scripts/00-keys.ts && RPC_URL=http://127.0.0.1:8545 npx tsx scripts/setup-all.ts
# checks
cd packages/verifier && npx vitest run test/pure.test.ts test/screen.test.ts test/errors.test.ts
npx tsx scripts/check-resolution.ts
```
