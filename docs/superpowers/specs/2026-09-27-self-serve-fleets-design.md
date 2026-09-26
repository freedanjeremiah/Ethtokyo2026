# Self-serve fleets — design

Date: 2026-09-27. Branch: `feat/mount`. Status: awaiting review.

## Goal

For the ETHTokyo demo, any visitor with a Sepolia wallet can create **their own** FNS fleet in a few minutes and then operate it in the playbook editor, signing everything from their own wallet. The existing mia/kai/rin fleet (`support.vendor.eth`) stays as a "try the demo" fleet, unchanged.

Success: a judge with one fresh MetaMask account and some Sepolia ETH goes from `/start` to a live fleet (vendor name, 1–2 doorways, 1+ agents), opens it in `/editor`, and runs unmount / fire / counterfeit / screening playbooks that return the expected verdicts.

## Decisions

| Topic | Decision |
|---|---|
| Audience | ETHTokyo demo on Sepolia, not production |
| Names | Registered inside onboarding through the real ETHRegistrar commit/reveal (MockUSDC is free to mint). Names the wallet already owns are reused. |
| Doorways | The vendor registers extra `.eth` names from the same wallet and mounts the fleet under them. Invites for other wallets are a later spec. |
| State | **The chain is the database.** A fleet is identified by its canonical name (`support.<vendor>.eth`); no server store. |
| Roles | Vendor and operator are one wallet for self-serve fleets. |
| Onboarding UI | A dedicated `/start` wizard; ongoing operations stay in `/editor`. |
| Agent addresses | Generated in the browser by default (members hold no roles, so the key never signs); pasting one is allowed. |
| Signing | Server holds no keys. Try EIP-5792 `wallet_sendCalls` batching first, fall back to one confirmation per transaction. |

Out of scope: merchant invites from other wallets, mainnet, a fleet directory, deleting fleets, per-member records.

## 1. `/start` onboarding wizard

A connected wallet walks four screens. Every step reads chain state first and plans only what is missing (the scripts' idempotent `ensure*` pattern), so a rejected transaction, reload or closed tab resumes where it stopped.

1. **Names.** Inputs for the vendor label (`alice`) and 1–2 doorway labels (`alice-shop`, …). Each is ENSIP-15 normalised and checked live with `ETHRegistry.findOwner`: *available*, *yours* (reused), or *taken* (blocked). Low Sepolia ETH is flagged here with a faucet link.
2. **Register names.** One `commit` per new name, sent together, then **one shared countdown** of `MIN_COMMITMENT_AGE` + 5 s. Then per name: MockUSDC `mint`, `approve`, `register` (owner = connected wallet). Commit secrets are generated in the browser and kept in localStorage keyed by wallet + label, so a reload during the wait does not lose them. A commitment older than `MAX_COMMITMENT_AGE` is re-committed.
3. **Build the fleet** (all vendor-signed):
   - vendor parent registry: `deployProxy(UserRegistryImpl)` + `ETHRegistry.setSubregistry(alice)` (resolver stays `0x0`)
   - fleet registry: `deployProxy(UserRegistryImpl)`, vendor holds all roles
   - shared resolver: `deployProxy(PermissionedResolverImpl)` with the default record **seeded in the initializer's `calls`**: `addr(60)` = settlement address, `enf.canonical` = `support.alice.eth`, `enf.parents` = the canonical name and every doorway, `agent-context`
   - `register("support", subregistry = fleet, resolver = 0x0)` in the vendor parent registry
   - `setParent` back-pointers: vendor registry → (ETHRegistry, `alice`), fleet → (vendor registry, `support`)
   - per doorway: parent registry deploy + `setSubregistry` + `register("support" → fleet)`
   - Proxy salts derive from the canonical name (`keccak256("fns.fleet-registry.v1" ‖ canonical)`, etc.), so one wallet can own several fleets and addresses are predictable.
   - Settlement address: the vendor's own address by default (editable).
4. **Hire agents.** Label + address (Generate button or paste). One `register(label, agent, resolver = shared, roles = 0)` each.

It ends with **Open in editor** → `/editor?fleet=support.alice.eth`, and the fleet is added to this browser's "my fleets" list.

## 2. Server

**`lib/fleet-resolve.server.ts`: `resolveFleet(canonical)`** derives everything from chain, cached per fleet per block epoch:
- vendor = `ETHRegistry.findOwner(<vendor label>)`
- vendor parent registry = its subregistry; fleet registry = that registry's `getSubregistry("support")`
- shared resolver = the CREATE2 address from (vendor, resolver salt), confirmed with `VerifiableFactory.verifyContract`
- deploy block = the factory's `ProxyDeployed` log for the fleet registry
- doorways = `enf.parents`; agents = `LabelRegistered` logs (the existing scan)

`support.vendor.eth` (the demo fleet, old fixed salts) keeps `deployments/fleet.11155111.json` as its hint. The file becomes a demo-only fallback.

**Routes.** `/api/fleet`, `/api/verify` and `/api/actions` take `fleet=<canonical name>`, defaulting to `support.vendor.eth` so existing links still work.

**Actions planner** (`actions.server.ts`), same contract as today (unsigned transactions still needed, each simulated from its signer, already-done → empty plan):
- signers come from chain (vendor = name owner; the resolver operator is the vendor for self-serve fleets, and the fleet file's operator for the demo fleet)
- new actions: `hire {label, address}`, `add-doorway {name}` (a name the wallet already owns), `counterfeit {name}` (mount under an owned name **without** endorsing it), `onboard` (the step-3 plan) and `names` (the step-2 transactions for given labels + commitments)
- `reset` rebuilds the target state from `enf.parents` + registered agents rather than from the fleet file

**Guardrails.** No keys on the server. Planning stays same-origin. Labels go through ENSIP-15 normalisation and `^[a-z0-9-]{1,63}$`. The planner refuses any name owned by someone other than the signer.

## 3. Wallet batching (`lib/wallet.ts`)

`sendBatch(txs)`: when `wallet_getCapabilities` reports atomic batching for Sepolia, send one `wallet_sendCalls` and poll `wallet_getCallsStatus`; otherwise, or if the wallet refuses, loop `sendStep` + `waitForReceipt`. A batch never mixes signers. The runner and the wizard both use it.

## 4. Editor

- **Fleet context** from `?fleet=`; no parameter means the demo fleet. The top bar gets a **fleet switcher**: my fleets (localStorage + fleets whose vendor is the connected wallet), the demo fleet, **+ New fleet** → `/start`.
- **Owner vs visitor.** If the connected wallet is not the vendor, chain nodes show a lock and "Viewing: only the owner can run chain steps"; check nodes still run. The demo fleet keeps its multi-account switching.
- **New blocks:** *Hire an agent* (label + address/Generate), *Add a doorway* (owned, unmounted names). *Mount the counterfeit doorway* picks from owned, unendorsed names (`scam.eth` for the demo fleet). Other blocks are unchanged; their dropdowns already come from the live scan.
- **Presets:** `presets(fleet)` builds the same stories from the fleet's first doorway and first agent. The demo fleet gets today's presets exactly.
- **Saving/sharing:** storage key `fns.playbooks.v2:<fleet>`; the old unscoped list migrates to the demo fleet. Share links carry `?fleet=…&playbook=…`.
- **Empty states:** no agents → "Hire your first agent" on the canvas. An unknown or unmounted `fleet=` → a clear error with a link to `/start`.
- **Landing page:** primary button **Start your fleet** → `/start`; the current demo links become **Try the demo fleet**.

## 5. Errors

| Case | Handling |
|---|---|
| Wallet rejects / tx fails | Existing `walletError()`; the run or wizard stops; resuming re-plans from chain |
| Batching unsupported or refused | Fall back to one confirmation per transaction, same plan |
| Commitment too new / expired | Wait / re-commit |
| Name taken mid-flow | "Taken, pick another"; never touch names owned by others |
| Low balance | Checked before step 2, faucet link |
| RPC trouble | Existing fallback endpoints and retries; `resolveFleet` cache |

## 6. Testing

- **Unit (vitest):** salt/address derivation, `resolveFleet` against mocked reads, `presets(fleet)`, playbook storage and share links with a fleet.
- **Anvil fork:** `scripts/e2e-selfserve.ts` runs the full plan (names → fleet → doorways → agents) from a fresh key through the same planner, then asserts verdicts through `@fns/verifier`: green on an endorsed doorway, black after unmount/fire, red on the counterfeit mount, orange after a dirty settlement address.
- **Manual:** one real MetaMask run on Sepolia (batching and fallback).
- **Regression:** demo fleet presets, verdicts and old share links behave as today.
