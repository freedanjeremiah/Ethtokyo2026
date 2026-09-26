# ENF — Ethereum Naming Fleet

**Hire a fleet with one transaction, fire it with one.**

**Primary track:** ENS · Best Use of ENSv2
**Secondary (gated):** Intercepta — address screening on the fleet's settlement address
**Tertiary:** Curvegrid — AI-agent prize

One ENSv2 `UserRegistry` ("the fleet") mounted at several points in the namespace at once, so
one on-chain agent identity (`mia`, `kai`, `rin`) resolves under `support.vendor.eth`,
`support.shopa.eth` and `support.shopb.eth` as **the same ERC-1155 token**. A merchant adopts the
fleet with one transaction it controls, and drops it with one. The vendor removes one agent from
every merchant with one transaction. A verifier built on stock viem + the real UniversalResolver
tells green/red/orange/black apart, live, for any typed name.

See [`idea.md`](idea.md) for the original pitch and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
for the build log.

---

## 1. Architecture

```
                vendor.eth            shopa.eth            shopb.eth          scam.eth
                    |                     |                    |                  |
          support.vendor.eth     support.shopa.eth    support.shopb.eth   support.scam.eth
          (canonical mount)        (merchant A)         (merchant B)      (counterfeit mount!)
              [own UserRegistry,     [own UserRegistry,   [own UserRegistry,  [own UserRegistry,
               setSubregistry only]   setSubregistry only]  setSubregistry only] setSubregistry only]
                    \______________________|____________________|__________________/
                                           |
                                           v
                             ONE fleet UserRegistry
                          mia . kai . rin  <- one ERC-1155 token each
                                           |
                       shared PermissionedResolver, attached to MEMBERS ONLY
                       (never to the parent "support" node - see topology below)
                                           |
                     default record (DNS name 0x00), read by every member
                     without its own record:
                       addr(60)             = fleet settlement address
                       enf.canonical      = support.vendor.eth
                       enf.parents        = support.vendor.eth,support.shopa.eth,support.shopb.eth
                       agent-context        = inline fleet description (ENSIP-26 text)
                       agent-endpoint[web]  = the ENF dashboard URL (PUBLIC_BASE_URL)
```

`mia.support.shopa.eth`, `mia.support.shopb.eth` and `mia.support.vendor.eth` are the same
token in the same registry — not three separate identities kept in sync, one identity aliased
into three parts of the namespace by ENSv2's registry-linking primitives (`setSubregistry`,
`setParent`, a shared resolver's default record).

**Topology (non-negotiable, and the fix for the fatal loophole in the original pitch):** a parent
node (`support.<parent>.eth`) gets `setSubregistry` **only** — its own resolver stays `0x0`. The
shared resolver is attached to **members at `register()`**, never to the parent. This is why a
random non-member (`bob.support.shopa.eth`) or the bare parent node (`support.shopa.eth`) returns
`ResolverNotFound` (a true black/non-member) instead of resolving through an inherited wildcard
resolver, which would have falsified the whole demo the moment a judge typed a made-up name.

### Components

| Path | What it is |
|---|---|
| `deployments/sepolia.json` + `deployments/abis/*.json` | Pinned ENSv2 contract addresses/ABIs on Sepolia (Task 2). All app/verifier/script code reads addresses from here — nothing is hardcoded. |
| `scripts/` | Setup and demo scripts (TypeScript, `tsx`, viem). Actor keys and RPC config in `.env.local`. |
| `packages/verifier/` | `@enf/verifier` — the pure verdict algorithm (`src/verify.ts`, `src/pure.ts`), a deployment loader (`src/node.ts`), and the C5 screening adapters (`src/screen/`). Consumed by both `scripts/verify.ts` and the app. |
| `app/` | Next.js app. `/` is the landing page (`app/src/app/page.tsx`). `/editor` is the playbook editor (`app/src/app/editor/page.tsx`, `app/src/components/WorkflowCanvas.tsx`): build the demo as a node workflow on a canvas (check a name, unmount, fire, sanctioned/clean settlement, counterfeit mount, reset), wire nodes together, branch a check on "As expected" / "Otherwise", run it with each transaction signed in the browser wallet, save them in the browser or share them as a link, beside the live topology graph, agent × doorway verdict grid, on-chain timeline and the single-name verifier. Old `/?name=` links redirect to `/editor`. Server routes: `/api/verify`, `/api/block`, `/api/fleet` (discovers every mount of the fleet from `SubregistryUpdated` logs and verifies every agent × doorway at one block — `app/src/lib/fleet-scan.server.ts`), `/api/actions` (plans the kill-switch transactions for the browser wallet to sign; the server holds no keys; `ENF_KILL_SWITCHES=off` disables). |
| `contracts/` | Foundry fork tests (`contracts/test/Mount.t.sol`) exercising the real deployed ENSv2 contracts — no mocks. |
| `docs/ensv2-notes.md` | Pinned ENSv2 deployment research: addresses, `getState` field order, role bit layout, resolution semantics — all VERIFIED-ONCHAIN or VERIFIED-SOURCE against the live deployment. |
| `docs/intercepta.md` | Intercepta (Web3 Antivirus) API research and the C5 screening design. |

---

## 2. The verifier algorithm

Input: any name `L.support.P` typed by a user (e.g. `mia.support.shopa.eth`).

```
1. n = normalize(input)                                        // ENSIP-15, viem's normalize — never toLowerCase, never gated on ".eth"
2. resolve via the real UniversalResolver (stock viem path):
     addr(60), text(enf.canonical), text(enf.parents), agent-context, agent-endpoint[web]
   -> UR.findResolver has no resolver at the leaf  =>  BLACK, not a member (true negative)
3. walk registries down from the RootRegistry:
     parentRegistry(P).getSubregistry("support") = R_doorway
     R_canonical = UniversalHelper.findExactRegistry(enf.canonical)
4. checks
     C1  member token alive in R_doorway for label L, not expired
     C2  R_doorway == R_canonical                                  (canonical registry match)
     C3  normalize(P's own name) is in enf.parents                (two-sided consent)
     C4  the parent name (P and support.P) is not expired           (doorway alive)
     C5  screen(addr(60)): OFAC sanctions oracle (+ Intercepta if keyed) (party clean) — omitted if screening is off
5. verdict
     C1 or C4 fail                 -> BLACK  not a member
     resolves, but C2 or C3 fails  -> RED    counterfeit mount
     C5 flags                      -> ORANGE endorsed doorway, flagged counterparty
     everything passes             -> GREEN  mounted by P (canonical enf.canonical)
```

Verdict precedence is **black > red > orange > green**; C5 "unknown" (screening outage) never
silently reads as green — the ENS-only verdict is kept but the UI marks screening as
unavailable rather than showing a clean bill of health.

### Truth table (why both sponsors matter)

| Case | ENS (C1–C4) | Intercepta (C5) | Verdict |
|---|---|---|---|
| Legit mount, clean settlement | pass | clean | **GREEN** |
| Counterfeit mount (`support.scam.eth`) | **C3 fails** (C2 passes by construction) | clean (same address!) | **RED** |
| Legit mount, dirty settlement | pass | flagged | **ORANGE** |
| Non-member (`bob.support.shopa.eth`) | — (`ResolverNotFound`) | — | **BLACK** |

**Correction vs. the original pitch (`idea.md`):** the counterfeit mount of the *real* fleet
registry under `support.scam.eth` is caught by **C3, two-sided consent** —
`support.scam.eth` is not in the fleet's own `enf.parents` record. **C2 (canonical registry)
passes by construction** for this attack, because `scam.eth`'s "support" subregistry really is
the same fleet registry as the legitimate mounts; C2 exists to catch a *copied or forked*
registry pretending to be canonical, not this one. The pitch's demo row ("canonical registry
mismatch") was inaccurate for this scenario and has been corrected in `idea.md` §4 and here.

---

## 3. What "hire/fire with one transaction" means, precisely

- **Merchant one-time setup** (not part of the "one tx" claim): the merchant needs its own
  ENSv2 `UserRegistry` under its `.eth` name and a registered `support` label in it, so there is
  somewhere for the fleet to be mounted. This is done once, via `scripts/02-mount.ts`
  (`deployProxy` a `UserRegistry`, `ETHRegistry.setSubregistry`, `register("support", ...)`).
- **Hire (mount)**: the merchant calls `setSubregistry(labelhash("support"), FLEET)` on its own
  registry. **One transaction, signed by the merchant.**
- **Fire (unmount)**: the merchant calls `setSubregistry(labelhash("support"), 0x0)`. **One
  transaction, signed by the merchant.** `scripts/demo-unmount.ts <parent>`.
- **Vendor fires one agent everywhere**: the vendor calls `fleetRegistry.unregister(labelhash(label))`
  once. Every doorway for that agent, under every merchant, dies in the same block. **One
  transaction, signed by the vendor.** `scripts/demo-unregister.ts <label>`.

There is **no dedicated UserRegistry factory** — both the fleet's `UserRegistry` and the shared
`PermissionedResolver` are deployed as proxies through ENSv2's generic
`VerifiableFactory.deployProxy(implementation, salt, initData)` (`deployments/sepolia.json` →
`VerifiableFactory`). This matches ENS's own deployment tooling; ENF did not need to write or
deploy any Solidity of its own.

---

## 4. Contract addresses (Sepolia, pinned in `deployments/sepolia.json`)

Source of truth: `docs/ensv2-notes.md` §1 (bytecode-verified against the live chain,
2026-09-26). These are the real, deployed ENSv2 contracts — ENF uses no mocks and no custom
registry/resolver code.

| Name | Address | Role in ENF |
|---|---|---|
| RootRegistry | [`0x9703DBD26dAB89504490994138cF2c575251a9cE`](https://sepolia.etherscan.io/address/0x9703DBD26dAB89504490994138cF2c575251a9cE) | Root of the v2 tree |
| ETHRegistry | [`0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E`](https://sepolia.etherscan.io/address/0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E) | `.eth` registry — `vendor`/`shopa`/`shopb`/`scam` live here |
| ETHRegistrar | [`0xAbe76F6C8DFcEd81AA5A2bB8034202A7136b94ca`](https://sepolia.etherscan.io/address/0xAbe76F6C8DFcEd81AA5A2bB8034202A7136b94ca) | Commit/reveal `.eth` registrar |
| UserRegistryImpl | [`0xA80338aAA8D23831cEa25E858D1774534aBb0263`](https://sepolia.etherscan.io/address/0xA80338aAA8D23831cEa25E858D1774534aBb0263) | Implementation behind the fleet's + each parent's `UserRegistry` proxy |
| PermissionedResolverImpl | [`0x14F09Fd05d4585759e54844DC9B00147131Cf243`](https://sepolia.etherscan.io/address/0x14F09Fd05d4585759e54844DC9B00147131Cf243) | Implementation behind the shared resolver proxy |
| VerifiableFactory | [`0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C`](https://sepolia.etherscan.io/address/0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C) | Deploys both proxies above (`deployProxy`) — no dedicated ENF/UserRegistry factory exists |
| UniversalResolverV2 | [`0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3`](https://sepolia.etherscan.io/address/0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3) | v2 UniversalResolver implementation |
| ManagedUniversalResolverProxy | [`0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1`](https://sepolia.etherscan.io/address/0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1) | Proxy pointing at UniversalResolverV2; itself pointed at by the Upgradable proxy below |
| UpgradableUniversalResolverProxy | [`0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`](https://sepolia.etherscan.io/address/0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe) | viem's built-in Sepolia UR address — the stock resolution path the verifier and any wallet use |
| UniversalHelper | [`0x33f571aa8A160a21b877cF6E0Fb8806692b97DF5`](https://sepolia.etherscan.io/address/0x33f571aa8A160a21b877cF6E0Fb8806692b97DF5) | `findCanonicalName` / `findExactRegistry` / `findCanonicalRegistry` — the verifier's C2 signal |
| LabelStore | [`0x375C082021E677a40eA2AE094D050602dba90992`](https://sepolia.etherscan.io/address/0x375C082021E677a40eA2AE094D050602dba90992) | Global labelhash → label store |
| StandardRentPriceOracle | [`0x9B0b9C65BDAf9794Ff7697E4dCFb1f50581072BB`](https://sepolia.etherscan.io/address/0x9B0b9C65BDAf9794Ff7697E4dCFb1f50581072BB) | `.eth` registrar pricing |
| MockUSDC | [`0x16f95D91DBa7dA3Aca778Ec053dF0FF6C6A8aA8e`](https://sepolia.etherscan.io/address/0x16f95D91DBa7dA3Aca778Ec053dF0FF6C6A8aA8e) | Payment token accepted by ETHRegistrar (6 dp, permissionless `mint`) |

ENF's own fleet registry, shared resolver, and per-parent (`vendor`/`shopa`/`shopb`/`scam`)
`UserRegistry` addresses are **not** fixed — they are deployed fresh by `scripts/01-deploy-fleet.ts`
and `scripts/02-mount.ts` each time the world is set up, and recorded in
`deployments/fleet.anvil.json` (fork; gitignored) or `deployments/fleet.11155111.json` (live
Sepolia; produced only after a live run — not yet performed, see §7).

---

## 5. Why this is new

- Namespace aliasing (one registry mounted at multiple `setSubregistry` points) is documented by
  ENS and, as far as this project found, built by nobody: of ~25 non-ENS repos calling
  `setSubregistry`, every one was single-mount.
- `linkToNode` / `linkToRecord`: verified available/present in `ensjs`'s own source during
  research for this project — ENF does not call either (the shared resolver's default (`0x00`)
  record does the aliasing work ENF needs); listed here only because they were part of the
  registry-linking primitives investigated, not because ENF uses them.
- Default-record (`0x00`) usage outside the ENS contracts themselves: zero hits found.
- ENSv1 cannot express any of this — one node has exactly one owner and one resolver, so there is
  no way to alias one identity into three names without three separate registrations to keep in
  sync by hand.

---

## 6. Known limitations

- **Counterfeit mounts are detectable, not preventable.** Nothing on-chain stops `scam.eth` from
  deploying its own `UserRegistry`, registering `support`, and pointing it at the *same* fleet
  registry — mounting is a permissionless action any `.eth` owner can take on their own name.
  ENF's answer is two-sided consent (C3): the mount only counts if the fleet's own
  `enf.parents` record also lists that parent. A verifier that skips C3 (or a wallet that only
  checks "does this resolve") is fooled. This is the centerpiece of the demo, not a bug found
  late.
- **The default-record bundle is shared by every member without an override.** A member-scoped
  resolver setter role would let that member rewrite the bundle for *everyone* (verified in
  `contracts/test/Mount.t.sol:test_scopedMemberRoleWouldRewriteEveryone`) — ENF never grants
  setter roles to members, only to the operator key.
- **C5 screening covers only the settlement address.** By default it asks the Chainalysis
  sanctions oracle on Ethereum mainnet (real OFAC data, keyless); the orange demo points the
  settlement record at a real OFAC-listed address, so the flag comes from that oracle, not from a
  list ENF wrote. **Intercepta is used only when an API key is configured.** No API
  key has been exercised end-to-end against a real "flagged" mainnet-style verdict (see §8); the
  flag threshold is ENF's own choice, not Intercepta's; and Intercepta's documented chain list
  is mainnets only, so its verdict for a fresh Sepolia address is unknown behaviour, not
  necessarily "clean."
- **`agent-endpoint[web]` points at the dashboard, not at an agent that answers.** `agent-context`
  is an inline description (ENSIP-26 allows plain text); there is no MCP or A2A agent server behind
  the fleet, so no `agent-endpoint[mcp]` / `[a2a]` record is published.
- **`ensureParentRegistry` sets the merchant's own `<parent>.eth` resolver to `0x0`.** Per the
  topology in §1, this is deliberate — an inherited wildcard resolver on `<parent>.eth` is exactly
  what would let a non-member (`bob.support.shopa.eth`) or the bare `support.shopa.eth` node
  resolve, defeating the black/non-member verdict. The tradeoff: the merchant's own `<parent>.eth`
  (e.g. `shopa.eth` itself, not `support.shopa.eth`) loses whatever site/address resolution it had
  before adopting ENF, unless the merchant sets its own resolver back on that name separately. A
  wildcard resolver on `<parent>.eth` would fix that, but would also make arbitrary non-members
  resolve in stock ENS clients — ENF's verifier still returns black for them (it checks the
  resolver at the leaf, not inherited), but any client that only checks "does this resolve" would
  be fooled, same failure mode as the counterfeit-mount case above.
- **The fleet is deployed on live Sepolia** (§7.6). The Foundry and vitest suites still run against an
  anvil fork, because they fire kill switches and time-travel, which a public chain does not allow.

---

## 7. Runbook

All commands below were executed, in order, from a clean fork state, during this task. Full
command-by-command output is in [`docs/runbook-evidence.md`](docs/runbook-evidence.md).

### 7.1 Setup

```bash
npm install

# 1. Start an anvil fork of Sepolia. Default RPC is publicnode; override with
#    SEPOLIA_RPC_URL if it 429s (a Tenderly gateway worked for this run).
SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co bash scripts/fork.sh &

# 2. Generate + fund fresh actor keys into .env.local (never anvil's default mnemonic).
npx tsx scripts/00-keys.ts

# 3. Build the whole demo world (idempotent): register vendor/shopa/shopb/scam.eth,
#    deploy the fleet registry + shared resolver, mount support.* under every parent,
#    register mia/kai/rin, write the default-record roster bundle.
npx tsx scripts/setup-all.ts
```

### 7.2 Acceptance checks

```bash
# Stock-viem-only resolution check (no project libraries) — every member resolves
# under every mount to the settlement address; non-members and parent nodes are null.
npx tsx scripts/check-resolution.ts

# Foundry fork tests against the real deployed contracts (10 tests). The tests already pin the
# fork with vm.createSelectFork("sepolia", FORK_BLOCK) (foundry.toml's [rpc_endpoints] "sepolia"
# reads SEPOLIA_RPC_URL) — don't also pass --fork-url, or a fresh shell with SEPOLIA_RPC_URL set
# only on this line expands it to `--fork-url ""` (export first if you want to pass --fork-url).
cd contracts && SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co forge test -vv && cd ..

# Verifier unit + fork tests (80 tests: pure, errors, screen, and live-fork tests
# that exercise the demo scripts themselves).
npm test -w packages/verifier
```

Result of this run: `check-resolution.ts` — all resolution checks passed; `forge test` —
10 passed, 0 failed; `npm test -w packages/verifier` — **4 files, 80 tests passed** (pure 18,
errors 6, screen 32, fork 24).

### 7.3 Verifier CLI

```bash
npx tsx scripts/verify.ts mia.support.shopa.eth        # GREEN
npx tsx scripts/verify.ts mia.support.scam.eth          # RED — C3 two-sided consent fails
npx tsx scripts/verify.ts bob.support.shopa.eth         # BLACK — not a member
npx tsx scripts/verify.ts mia.support.shopa.eth --json  # machine-readable VerifyResult
```

### 7.4 App

```bash
npm run dev -w app
# then: curl "http://localhost:3000/api/verify?name=mia.support.shopa.eth"
# or open http://localhost:3000
```

### 7.5 Demo script (fork), each beat run and confirmed live in this task

| # | Command | What the screen shows |
|---|---|---|
| 1 | type `mia.support.shopa.eth` | GREEN — "mounted by support.shopa.eth (canonical support.vendor.eth)". [`docs/screenshots/green.png`](docs/screenshots/green.png) |
| 2 | `npx tsx scripts/demo-unmount.ts shopb` (merchant B's own `setSubregistry`, one tx) | `mia.support.shopb.eth` -> BLACK next block ("not a member: ... ResolverNotFound"); `mia.support.shopa.eth` stays GREEN — "fired the vendor." [`docs/screenshots/unmount-flip.png`](docs/screenshots/unmount-flip.png) |
| 3 | `npx tsx scripts/demo-unregister.ts mia` (vendor's `unregister`, one tx) | every remaining `mia.*` doorway -> BLACK in the same block (`kai.*` unaffected) — "fired one agent everywhere." |
| 4 | type `kai.support.scam.eth` (the counterfeit mount) | **It resolves.** RED — "counterfeit mount: C3 failed" (`support.scam.eth` not in `enf.parents`; C2 passes by construction). ENS's own documented aliasing attack, caught live. [`docs/screenshots/red-counterfeit.png`](docs/screenshots/red-counterfeit.png) |
| 5 (Intercepta) | `npx tsx scripts/demo-dirty-settlement.ts` (operator's one multicall) | every endorsed doorway (vendor/shopa/shopb) -> ORANGE "endorsed doorway, flagged counterparty"; the counterfeit `scam` doorway stays RED (same address, ENS precedence). [`docs/screenshots/orange.png`](docs/screenshots/orange.png), [`docs/screenshots/red-dirty.png`](docs/screenshots/red-dirty.png) |
| — | `npx tsx scripts/demo-clean-settlement.ts` then `npx tsx scripts/demo-reset.ts` | restores the clean settlement address and remounts/re-registers everything touched by beats 2–3 |

All five beats above were executed against the live fork during this task, via
`curl /api/verify` with the dev server running; verdicts matched exactly what is written above.
The fork and dev server were stopped afterward.

**Before presenting:** use a paid/fast fork RPC (a free public RPC like publicnode rate-limits
under load — see §9) and pre-warm it by running `npx tsx scripts/verify.ts mia.support.shopa.eth`
once before the demo starts. viem maps some upstream RPC errors under rate-limiting (including
`-32603`) to the same shape as an on-chain revert, which the verifier's membership-read path can
read as "no resolver" — i.e. a **possible false BLACK verdict** live on stage, not just a clean
502. Warming the RPC up first (and having a fast, non-rate-limited endpoint under load) avoids
finding this out mid-demo.

### 7.6 Live Sepolia (deployed 2026-09-26)

The fleet runs on **live Sepolia** (ENSv2), built by the same scripts as the fork. Every value below was
read back from chain; `deployments/fleet.11155111.json` is the record the app uses.

| What | Address / name |
|---|---|
| `vendor.eth` / `shopa.eth` / `shopb.eth` / `scam.eth` | owned by VENDOR / SHOPA / SHOPB / SCAM (registered via the real ETHRegistrar commit/reveal) |
| Fleet `UserRegistry` | [`0xb40c4F85B9a7E4B57669C979c16132898a13BedD`](https://sepolia.etherscan.io/address/0xb40c4F85B9a7E4B57669C979c16132898a13BedD) (deployed in block 11786237) |
| Shared `PermissionedResolver` | [`0x8b51e6668b8703fFeE6f0f554cdfeA28457688a4`](https://sepolia.etherscan.io/address/0x8b51e6668b8703fFeE6f0f554cdfeA28457688a4) |
| Parent registries | vendor `0xB7B4…6284`, shopa `0x1C4c…1460`, shopb `0xb74E…d282`, scam `0xE9d5…a198` |
| Agents | `mia`, `kai`, `rin` (one ERC-1155 token each in the fleet registry) |
| Settlement (`addr(60)` of the default record) | `0xe2841c6Eb0FD27DdB7d5B0738396bC260d31Fe33` |

Checked on live Sepolia with plain viem (its built-in Sepolia Universal Resolver, none of ENF's code):
all 12 `<agent>.support.<parent>.eth` names resolve to the settlement address, `kai.support.scam.eth`
included (it resolves; the verifier flags it RED because `support.scam.eth` is not in `enf.parents`),
while `bob.support.shopa.eth` and `support.shopa.eth` return `null`.

`agent-endpoint[web]` is **not** set on live Sepolia yet: the scripts only publish it when
`PUBLIC_BASE_URL` points at a reachable deployment of the dashboard. `agent-context` is set.

**Reproduce from scratch** (fresh keys; the four names must still be free):

```bash
npx tsx scripts/00-keys.ts                                   # prints the actor addresses
# fund VENDOR with ~0.05 Sepolia ETH, then:
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
npx tsx scripts/fund-actors.ts 0.008                         # VENDOR tops up OPERATOR/SHOPA/SHOPB/SCAM
npx tsx scripts/setup-all.ts                                 # ~6 min: each .eth name waits out the 60 s commitment
npx tsx scripts/check-resolution.ts
```

**Dashboard on live Sepolia:**

```bash
cd app
npx next dev -p 3100
```

- Reads use `RPC_URL` (shell, else the repo-root `.env.local`) and fall through to backup public Sepolia RPCs
  (Tenderly's gateway, 0xrpc.io) when it fails. The mount scan needs an address-less `eth_getLogs`, which
  publicnode's free tier rejects, so publicnode alone cannot serve the dashboard.
- Kill switches are signed in **your browser wallet** (e.g. MetaMask on Sepolia). The server holds no private keys: it
  reads the chain, returns the unsigned transactions with the address that must sign each, and simulates them.
  Import the demo accounts you want to act as into the wallet (a shop's owner to unmount its doorway, the vendor
  to fire an agent, the operator for the settlement address); the dashboard asks you to switch accounts when a
  step needs a different signer. `ENF_KILL_SWITCHES=off` hides them.
- A block is ~12 s on Sepolia and a full scan takes ~10 s, so a kill switch shows up on the dashboard
  within about 30 s of the click.

## 8. ENF for AI agents (Curvegrid)

ENF's structure maps directly onto "agents as namespaces":

- **An agent is a name, not a database row.** `mia`, `kai`, `rin` each exist as one ERC-1155
  token in the fleet's `UserRegistry`. Any name resolving to that token — under any merchant
  that has mounted the fleet — is the same on-chain identity, discoverable by any ENS client,
  with no custom API to integrate against.
- **Discovery keys are served from the default record bundle**, using the ENSIP-26 text keys
  `agent-context` (an inline fleet description) and `agent-endpoint[web]` (the dashboard URL,
  set from `PUBLIC_BASE_URL`; see §6). Because these live in the shared resolver's default (`0x00`) record, every
  member gets them with **zero per-member writes**: the operator sets the bundle once, and it
  applies to every doorway of every agent.
- **Hire or fire a whole fleet with one transaction.** A merchant onboarding an agent fleet is
  one `setSubregistry` call (§3); dropping it is the same call with the zero address. A vendor
  pulling one agent from every merchant it serves is one `unregister` call. No per-merchant,
  per-agent bookkeeping.
- **Verify an agent's doorway before transacting with it**, using only the real UniversalResolver
  and this repo's verifier — no custom trust API, no off-chain registry: `npx tsx scripts/verify.ts
  <agent>.support.<merchant>.eth` or `GET /api/verify?name=...` returns green/red/orange/black plus
  the machine-readable reasons (`packages/verifier` `VerifyResult`), so another agent or an
  autonomous buyer can gate a payment on the verdict.

**Honest scope note:** this is architecture, not an integration — there is no Curvegrid SDK call
anywhere in this repo, and no live Curvegrid runtime was used to drive an agent through ENF.
The claim here is that ENF's namespace-aliasing primitive is a good substrate for
Curvegrid-style agent fleets, verifiable with stock tooling; wiring an actual Curvegrid agent up
to call `scripts/verify.ts` or `/api/verify` before transacting is the natural next step, not
something this submission has built.

---

## 9. ENS correctness notes

- Every name is normalized with viem's `normalize` (ENSIP-15) before use — never `toLowerCase()`,
  never gated on `.eth`.
- Records are read via the real UniversalResolver path (`getEnsAddress` / `getEnsText`, viem
  ≥ 2.35), not by talking to a resolver contract directly.
- Stock viem returns `null` for a non-member's `getEnsAddress`/`getEnsText` (it does not throw),
  so the verifier's black-verdict membership check calls the UniversalResolver's resolver lookup
  directly and requires the resolver to be set **at the leaf**, not inherited from a wildcard
  parent resolver — see `docs/ensv2-notes.md` §5 and the topology note in §1 above.
- The public Sepolia RPC (`ethereum-sepolia-rpc.publicnode.com`) rate-limits (`429`) under the
  load of a full fork setup + test run. Override it with `SEPOLIA_RPC_URL` (and `RPC_URL` for the
  fork's own port) — a Tenderly gateway RPC was used for every run in this task.

---

## 10. Intercepta (C5 screening)

Full detail in [`docs/intercepta.md`](docs/intercepta.md). Summary:

- Intercepta's public API is the **Web3 Antivirus ("W3A") API**
  (https://docs.web3antivirus.io/reference/api-overview): `GET
  /api/public/v2/extension/account/{address}/quick-scan`, header `X-API-KEY`, response
  `{ toxicScore, traits: [{ risk, name, ... }] }`.
- ENF flags an address when `toxicScore >= 50` or any trait's `risk >= 50`. **This threshold
  (50) is ENF's own choice** — Intercepta's docs do not define a clean/flagged cutoff.
- No real "flagged" 200 response has been observed against a live key (none was available during
  the build); the adapter's shape comes from the documented OpenAPI schema and was verified
  against mocked responses plus one live 403 (bad-key) response.
- C5 always also asks the **Chainalysis sanctions oracle** on Ethereum mainnet
  (`0x40C5…aC8fb`, `isSanctioned(address)`, keyless; `SCREEN_SANCTIONS=off` disables it). Results
  combine as: any flagged => flagged, else any unreachable => unknown, else clean.
- The orange demo (`demo-dirty-settlement.ts`) points the settlement record at a real OFAC-listed
  address (Lazarus Group, Ronin exploit) and refuses to run unless the oracle confirms it.
  `SCREEN_FLAGGED` remains only as an optional local deny-list override.

---

## 11. Tooling / requirements

Node 24, npm workspaces (no pnpm/yarn), TypeScript (ESM), viem ≥ 2.35, vitest, Foundry
(`forge`/`anvil`/`cast`), Next.js App Router. Fresh keys only — never anvil's default mnemonic
accounts (they are delegated sweepers on public Sepolia forks).
