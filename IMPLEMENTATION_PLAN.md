# ENF — Brainstorm & Implementation Plan

Priority order: **ENS (must win) → Intercepta (gated at hour 20) → Curvegrid (30 min)**.
Idea and rationale: [`idea.md`](idea.md).

> ⚠️ ENSv2 names below (`UserRegistry`, factory, `setSubregistry`, `linkToNode`, `linkToRecord`, default record `0x00`, `getState`) come from our fork work. The 09-15 Sepolia redeploy drifted the ABIs — **every signature must be re-pinned from the live deployment in Phase 0** before code depends on it. Never hardcode addresses in app code; load them from `deployments/sepolia.json`.

---

## Part A — Brainstorm

### A1. Actors and names

| Actor | Owns | Key | Role in demo |
|---|---|---|---|
| Vendor | `vendor.eth`, the fleet UserRegistry | `VENDOR_PK` | Registers / unregisters agents; declares mounts |
| Operator bot | Setter roles on the shared resolver | `OPERATOR_PK` | Only party that writes records |
| Merchant A | `shopa.eth` | `SHOPA_PK` | Mounts fleet at `support.shopa.eth` |
| Merchant B | `shopb.eth` | `SHOPB_PK` | Mounts, then unmounts ("fires the vendor") |
| Attacker | `scam.eth` | `SCAM_PK` | Counterfeit mount at `support.scam.eth` |
| Agents | `mia`, `kai`, `rin` (ERC-1155, soulbound) | per-agent keys | Members of the fleet |

All keys **freshly generated** (anvil defaults are delegated sweepers on Sepolia).

### A2. Topology (the non-negotiable fix)

```
support.<parent>.eth   subregistry = FleetRegistry     resolver = 0x0   ← parents NEVER get a resolver
FleetRegistry.mia      token (ERC-1155)                resolver = SharedResolver   ← set at register()
SharedResolver         default record 0x00 bundle      +  per-member overrides via linkToNode / linkToRecord
```

Consequences we must prove in tests:
- `mia.support.shopa.eth` → resolves (member, has resolver).
- `nobody.support.shopa.eth` → `ResolverNotFound` (true negative).
- `support.shopa.eth` itself → `ResolverNotFound` (parent is not a member).
- Member records come from the default bundle with **zero per-member writes**.

### A3. What lives in the default record (`0x00`) bundle

| Key | Value | Why |
|---|---|---|
| `addr(60)` | fleet settlement address | Intercepta screens this |
| `agent-context` (ENSIP-26) | fleet description URL/JSON | agent discovery |
| `agent-endpoint[mcp]` / `[web]` | fleet endpoint | agent discovery |
| `enf.canonical` | `support.vendor.eth` | canonical name claim |
| `enf.parents` | comma list of endorsed parent names (normalized) | **two-sided consent roster** |

Open design choice: store the roster (`enf.canonical`, `enf.parents`) as text records on the **canonical name's node** vs. in the default bundle. **Recommendation:** default bundle — every member then carries the roster through any doorway, and it's written once by the operator. Decide in Phase 0 after confirming default-record semantics for text keys.

### A4. Verifier algorithm (the product)

Input: any name `L.support.P` typed by the user.

```
1. n = normalize(input)                            // @adraffy/ens-normalize via viem
2. resolve via UniversalResolver (stock viem):
     addr, text(enf.canonical), text(enf.parents), ENSIP-26 keys
   → ResolverNotFound / no addr  ⇒  ⚫ NOT A MEMBER (true negative)
3. Walk registries down from root:
     parentRegistry(P) → subregistry("support") = R_doorway
     canonicalRegistry = subregistry of enf.canonical's parent chain = R_canonical
4. Checks
     C1 token exists in R_doorway for label L, not expired         (member alive)
     C2 R_doorway == R_canonical                                    (canonical registry match)
     C3 normalize(P-side parent name) ∈ enf.parents               (two-sided consent)
     C4 parent name not expired                                     (doorway alive)
     C5 [Intercepta, gated] screen(addr) == clean                   (party clean)
5. Verdict
     all pass → 🟢  "mounted by P ✓"
     resolves but C2 or C3 fails → 🔴  "counterfeit mount" + which check failed
     C5 fails → 🟠  "endorsed doorway, flagged counterparty"
```

Truth table for the pitch (why both sponsors matter):

| Case | ENS C2+C3 | Intercepta C5 | Verdict |
|---|---|---|---|
| Legit mount, clean vendor | ✅ | ✅ | 🟢 |
| Counterfeit mount (`scam.eth`) | ❌ | ✅ (same clean addr!) | 🔴 |
| Legit mount, dirty settlement | ✅ | ❌ | 🟠 |
| Non-member | — (ResolverNotFound) | — | ⚫ |

### A5. Kill switches

| Switch | Owner | Tx | Effect |
|---|---|---|---|
| Unmount | Merchant | `setSubregistry(support, 0)` on own registry | That doorway dies; others unaffected |
| Unregister | Vendor | unregister/burn `mia` in FleetRegistry | `mia` dies in **every** doorway, one block |
| Lapse | Time | parent name expires | That doorway dies |

### A6. Custom code we actually need

The primitive is ENSv2's own contracts. We write **as little Solidity as possible**:
- **No custom registry.** Deploy UserRegistry via the real factory.
- **Operator role config** script (grant setter roles to operator only; assert members have none).
- Optional tiny `MountLens.sol` (view-only) to batch the registry walk + roster read into one `eth_call` for the UI. Nice-to-have; viem multicall is the fallback.

### A7. Stack

- **Contracts/scripts:** Foundry (fork tests against Sepolia), TypeScript scripts with viem ≥ 2.35.
- **Frontend:** Next.js (App Router) + viem, single page. Deployed on Vercel.
- **Live updates:** `watchBlockNumber` → re-run verifier on every block for the current input + its sibling doorways.
- **Chain:** Sepolia (ENSv2 deployment). Anvil fork of Sepolia for rehearsal and CI.

---

## Part B — Implementation Plan

### Repo layout

```
contracts/            Foundry project
  test/Mount.t.sol    fork tests (the proofs listed in A2/A5 + soulbound + role revert)
  src/MountLens.sol   optional view helper
scripts/              viem TS scripts (setup + demo actions)
  00-keys.ts          generate fresh keys, write .env.local (gitignored)
  01-deploy-fleet.ts  factory → UserRegistry, shared resolver, operator roles
  02-mount.ts         setSubregistry for vendor/shopa/shopb/scam (resolver stays 0)
  03-register.ts      register mia/kai/rin with resolver = SharedResolver
  04-records.ts       operator writes default 0x00 bundle + roster
  demo-*.ts           unmount, unregister, reset
packages/verifier/    pure TS verifier (A4), used by UI + CLI + tests
app/                  Next.js single-screen UI
deployments/sepolia.json   addresses + pinned ABIs (generated, never hand-typed)
```

### Phase 0 — Re-pin ENSv2 on Sepolia (h 0–2)
- [ ] Pull current ENSv2 deployment addresses from docs.ens.domains/learn/deployments + ensdomains v2 contracts repo; write `deployments/sepolia.json`.
- [ ] Pin ABIs for: factory, UserRegistry, resolver (with `linkToNode`/`linkToRecord`/default record), UniversalResolver, `.eth` registrar.
- [ ] Write decoders for drifted bits: `getState` field order, 4-bit nybble role counts. Unit-test them against a known on-chain state.
- [ ] Generate fresh keys, fund from faucet, register `vendor.eth`, `shopa.eth`, `shopb.eth`, `scam.eth` on Sepolia.
- **Exit:** a script prints the owner + registry of each test name.

### Phase 1 — Fork tests = the claims (h 2–6)
Every sentence in `idea.md` §2 and §6 becomes a test:
- [ ] one `register()` → one token, resolves under 3 parents via real UniversalResolver
- [ ] non-member & parent → `ResolverNotFound`
- [ ] default bundle served to member with zero per-member writes
- [ ] merchant unmount kills only its doorway
- [ ] vendor unregister kills all doorways same block
- [ ] parent lapse kills only that doorway (`vm.warp`)
- [ ] soulbound: transfer reverts, including via approved operator
- [ ] members hold no setter roles on the shared resolver → a member's write reverts (demo the revert); separate test documents *why*: a scoped role would let one member rewrite everyone's value and the default bundle
- [ ] counterfeit mount resolves (proves we need the verifier)
- **Exit:** `forge test --fork-url $SEPOLIA_RPC` green.

### Phase 2 — Live setup scripts on Sepolia (h 6–9)
- [ ] Scripts 01–04 idempotent (re-runnable) and a `demo-reset.ts` that remounts shopb and re-registers mia so we can rehearse repeatedly.
- [ ] Verify with stock viem `getEnsAddress` / `getEnsText` from a clean script (no custom resolution code).

### Phase 3 — Verifier package (h 9–13)
- [ ] Implement A4 in `packages/verifier` using viem's UniversalResolver path for records + direct registry reads for the walk.
- [ ] Normalize every input (Rule 1); never string-match `.eth` (Rule 5); no hardcoded addresses (Rule 4).
- [ ] Return a structured result `{ verdict, checks: [{id, pass, detail}], doorways: [...] }`.
- [ ] Doorway discovery: read `enf.parents` → build sibling names → verify each (powers the "three consequences" panel).
- [ ] Vitest against the anvil fork for all four truth-table rows.
- [ ] CLI: `pnpm verify mia.support.scam.eth`.

### Phase 4 — Single-screen UI (h 13–18)
- [ ] One input, one big verdict card (🟢/🔴/🟠/⚫) with check list.
- [ ] Below it: doorway strip — every declared mount + the typed one, each flipping state live per block.
- [ ] Block number + tx hash ticker so the audience sees "next block".
- [ ] Large type, readable from 3 m. Dark background.
- [ ] Demo action buttons are **not** in the public UI; demo actions run from scripts/hotkeys on the presenter laptop (keys never in the browser).
- [ ] Deploy to Vercel; RPC URL via env var.

### Phase 5 — Rehearse & harden (h 18–20)
- [ ] Full demo run ×3 on Sepolia with `demo-reset.ts` between.
- [ ] Fallback: same demo on anvil fork, pre-recorded video.
- [ ] Judge-proofing: type random names (`bob.support.shopa.eth`, `support.shopa.eth`, `shopa.eth`) → all correct negatives.

### 🚦 Hour-20 gate
Proceed to Intercepta **only if** Phases 0–5 are done and the demo has run clean three times. Otherwise spend remaining time on polish + submission and skip Part C.

---

## Part C — Intercepta (h 20–31, gated)

Framing: *is the doorway endorsed* (ENS) × *is the party clean* (Intercepta). Screening applies to the **settlement address from the default record**, so it is part of the verifier, not a bolt-on.

- [ ] (h 20–21) Read Intercepta's docs/API at the event; confirm auth, rate limits, response shape, testnet support. **Unknown until then — do not design around assumptions.**
- [ ] (h 21–24) `packages/verifier/screen.ts` adapter: `screen(address, chainId) → { status: clean|flagged|unknown, reason }`. Server-side only (API key in Vercel env, never in the browser). Cache per address per block.
- [ ] (h 24–26) Add check C5 + 🟠 verdict to the verifier and UI.
- [ ] (h 26–29) Demo beat 5: operator points the default record `addr` to a flagged address → every doorway turns 🟠 in one write (shows the default bundle *and* screening). Then revert.
- [ ] (h 29–31) Tests for the full truth table incl. counterfeit-mount-with-clean-address (🔴 even though screening passes).
- Failure mode: if Intercepta API is down on stage → verdict shows `C5: unknown`, never silently green.

---

## Part D — Curvegrid (≈30 min, any time after the gate)

- [ ] README section: "ENF for AI agents" — agent fleets as namespaces; merchants hire/fire fleets with one tx; any agent client verifies an agent's doorway before transacting (ENSIP-26 discovery keys served from the default bundle).
- [ ] Confirm the exact Curvegrid AI-agent prize criteria at the event; if it requires their platform (MultiBaas), the cheapest honest slot is indexing `FleetRegistry` + subregistry-change events to power a "mount history" timeline. Only do this if it fits in ~2h after Part C.

---

## Submission checklist
- [ ] README: pitch, 4-beat demo GIF, architecture diagram (A2), truth table (A4), "Why it's new" with evidence.
- [ ] Contract addresses + Etherscan links (from `deployments/sepolia.json`).
- [ ] `forge test` + `pnpm test` instructions; fork tests are the proof of every claim.
- [ ] Explicit "Known limitations": counterfeit mounts can't be prevented at contract level — detection via two-sided consent is the design.
- [ ] Video backup of the live demo.

## Time budget

| Block | Hours |
|---|---|
| ENS core (Phases 0–5) | ~20 |
| Intercepta (gated) | 9–11 |
| Curvegrid | 0.5 (–2 stretch) |
| Buffer / submission | remainder |

---

## Part E — Executable task list (subagent-driven)

Parts B–D are the narrative. This part is the binding, task-by-task version used for execution. Each task ends with a commit.

### Global Constraints

- **Chain:** everything is built and tested against an **anvil fork of Sepolia**. Default fork RPC: `https://ethereum-sepolia-rpc.publicnode.com` (override with env `SEPOLIA_RPC_URL`). Live-Sepolia runs need funded keys and are performed by the human later; every script must take its RPC URL from env (`RPC_URL`, default `http://127.0.0.1:8545`) so the same script works on live Sepolia.
- **Use real ENSv2 contracts.** No custom registry, no custom resolver, no mocks of ENS contracts. Deploy the fleet UserRegistry via the real deployed factory.
- **No hardcoded ENS addresses** in app/verifier code. All addresses + ABIs live in `deployments/sepolia.json` (+ `deployments/abis/*.json`), produced by Task 2.
- **Topology (non-negotiable):** parent nodes (`support.<parent>.eth`) get `setSubregistry` only; their resolver stays `0x0`. The shared resolver is attached to members at `register()`. Members never hold setter roles on the shared resolver; only the operator key does.
- **ENS correctness rules:** normalize every name input with viem's `normalize` (ENSIP-15); never `toLowerCase()` a name; never gate on `.eth`; resolve records via the UniversalResolver path (viem `getEnsAddress` / `getEnsText`, viem ≥ 2.35).
- **Keys:** fresh keys only (never anvil default mnemonic accounts). Keys live in `.env.local` (gitignored). Never commit a private key. Never ship keys to the browser.
- **Tooling:** Node 24, **npm workspaces** (no pnpm), TypeScript (ESM), viem ≥ 2.35, vitest for TS tests, Foundry (`~/.foundry/bin/forge`, `anvil`, `cast`) for Solidity/fork tests, Next.js App Router for the UI.
- **Actors / labels:** vendor `vendor.eth`, merchants `shopa.eth`, `shopb.eth`, attacker `scam.eth`; mount label `support`; agents `mia`, `kai`, `rin`. Canonical name `support.vendor.eth`.
- **Roster record keys** (in the shared resolver's default `0x00` bundle unless Task 2 proves text keys can't live there): `enf.canonical` = `support.vendor.eth`; `enf.parents` = comma-separated normalized parent names, e.g. `support.vendor.eth,support.shopa.eth,support.shopb.eth`. Plus `addr(60)` = fleet settlement address, and ENSIP-26 `agent-context`, `agent-endpoint[web]`.
- **Verdicts:** `green` (all checks pass), `red` (resolves but C2 canonical-registry or C3 two-sided-consent fails), `orange` (C5 screening flagged), `black` (not a member: ResolverNotFound / no resolver / token missing or expired). Check ids `C1`..`C5` exactly as in Part A §A4.
- **Out of scope for autonomous execution:** funding keys, registering names on live Sepolia, deploying to Vercel, recording video.

### Task 1: Repo scaffold

Create the monorepo skeleton.
- Root `package.json` (private, `"type": "module"`, npm workspaces `packages/*`, `app`, `scripts`), root `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`).
- `contracts/` Foundry project (`forge init --no-git --no-commit` equivalent layout; `foundry.toml` with `fs_permissions` read for `../deployments`, rpc_endpoints `sepolia = "${SEPOLIA_RPC_URL}"`). Remove the Counter example.
- `.env.example` documenting `SEPOLIA_RPC_URL`, `RPC_URL`, `VENDOR_PK`, `OPERATOR_PK`, `SHOPA_PK`, `SHOPB_PK`, `SCAM_PK`, `MIA_PK`, `KAI_PK`, `RIN_PK`, `SETTLEMENT_ADDRESS`, `INTERCEPTA_API_KEY`.
- `scripts/fork.sh`: starts `anvil --fork-url ${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com} --chain-id 11155111 --port 8545`.
- Extend `.gitignore` for Foundry `out/`, `cache/`, `broadcast/`, Next `.next/`.
- **Acceptance:** `npm install` succeeds; `~/.foundry/bin/forge build` in `contracts/` succeeds (empty is fine).

### Task 2: ENSv2 discovery and ABI pinning (foundational)

The whole project depends on this task being **true**. Research, do not guess.
- Find the current ENSv2 deployment on Sepolia (docs.ens.domains/learn/deployments, github.com/ensdomains — the ENSv2 contracts repo and its deployments folder, ensjs v2 branches). Identify: root registry, `.eth` registry/registrar, the UserRegistry factory (and UserRegistry implementation), the resolver implementation that supports default record `0x00` and `linkToNode`/`linkToRecord` (and its factory), UniversalResolver (v2), and the role/permission model.
- For each: address, verified ABI (from explorer or repo artifacts), and **verify on-chain** that code exists at the address (`cast code`) and a representative view call works against Sepolia.
- Document exact signatures and semantics in `docs/ensv2-notes.md`: how to register a `.eth` name on a fork (or how to impersonate/prank an owner), how to deploy a UserRegistry via the factory, `setSubregistry`, `setResolver`, `register` on a UserRegistry (args incl. owner, resolver, expiry, roles), unregister/burn, how the default record `0x00` works for addr and text, `linkToNode`/`linkToRecord`, role bitmaps (the 4-bit nybble role-count packing), `getState` field order, expiry semantics, and soulbound/transfer-role mechanics. Cite source file + line/commit for each claim.
- Write `deployments/sepolia.json` (`{ chainId, contracts: { <name>: { address, abi: "abis/<name>.json" } } }`) and `deployments/abis/*.json`.
- Add `scripts/check-deployment.ts` that loads the JSON and does one view call per contract against `RPC_URL`, printing OK/FAIL.
- If any primitive in `idea.md` §2 (multi-mount, default record, linkToNode) does **not** exist in the deployed contracts, record exactly what exists instead under a `## Deviations` heading — do not paper over it.
- **Acceptance:** `node --experimental-strip-types scripts/check-deployment.ts` (or `npx tsx`) prints OK for every contract against the public Sepolia RPC.

### Task 3: Fork harness and world setup library

A reusable TS library that builds the demo world on an anvil fork.
- `scripts/lib/env.ts`: load `.env.local`, clients (viem public + wallet) from `RPC_URL`.
- `scripts/00-keys.ts`: generate fresh keys for all actors into `.env.local` (refuse to overwrite existing keys unless `--force`); on a local anvil (chainId 11155111 + `anvil_setBalance` supported) fund them with 100 ETH each.
- `scripts/lib/names.ts`: obtain `vendor.eth`, `shopa.eth`, `shopb.eth`, `scam.eth` for the right actor — on a fork via the real registrar flow or via `anvil_impersonateAccount` of the registrar controller/owner per `docs/ensv2-notes.md`; on live Sepolia via the real registrar flow (commit/reveal if required).
- **Acceptance:** with anvil fork running, `npx tsx scripts/00-keys.ts && npx tsx scripts/setup-names.ts` leaves each `.eth` name owned by the right fresh key, printed and verified by reading the registry.

### Task 4: Fleet setup scripts (deploy, mount, register, records)

Idempotent scripts per Part B repo layout, built on Task 3's lib:
- `01-deploy-fleet.ts`: deploy fleet UserRegistry via the real factory (owner = vendor), deploy/obtain the shared resolver (operator holds setter roles; members none), write resulting addresses to `deployments/fleet.<chainId>.json`.
- `02-mount.ts`: for each of vendor/shopa/shopb/scam create `support.<parent>.eth` with subregistry = fleet registry and **resolver = 0x0**.
- `03-register.ts`: register `mia`, `kai`, `rin` in the fleet registry, owner = agent key, resolver = shared resolver, no setter roles.
- `04-records.ts`: operator writes the default `0x00` bundle: addr(60)=`SETTLEMENT_ADDRESS` (default: operator-derived fresh address), `enf.canonical`, `enf.parents` (vendor, shopa, shopb — **not** scam), `agent-context`, `agent-endpoint[web]`.
- `demo-unmount.ts <parent>`, `demo-unregister.ts <label>`, `demo-counterfeit.ts` (idempotently ensures scam mount exists), `demo-reset.ts` (remount shopb, re-register mia).
- `setup-all.ts` runs names + 01–04 in order.
- **Acceptance:** after `setup-all`, a clean script using only stock viem `getEnsAddress`/`getEnsText` resolves `mia.support.shopa.eth`, `mia.support.shopb.eth`, `mia.support.vendor.eth`, `mia.support.scam.eth` to the settlement address, and `nobody.support.shopa.eth` and `support.shopa.eth` return null / ResolverNotFound.

### Task 5: Foundry fork tests (the claims)

`contracts/test/Mount.t.sol` forking Sepolia via `vm.createSelectFork("sepolia")`, using addresses from `deployments/sepolia.json` (`vm.readFile` + `vm.parseJson`). Each bullet of Part B Phase 1 is one test function:
`test_oneTokenThreeMounts`, `test_nonMemberAndParentHaveNoResolver`, `test_defaultBundleZeroMemberWrites`, `test_merchantUnmountKillsOnlyItsDoorway`, `test_vendorUnregisterKillsAllDoorways`, `test_parentLapseKillsOnlyThatDoorway`, `test_soulboundEvenViaApprovedOperator`, `test_memberCannotWriteSharedResolver`, `test_scopedMemberRoleWouldRewriteEveryone` (documents the hazard), `test_counterfeitMountResolves`.
Resolution assertions go through the real UniversalResolver.
- **Acceptance:** `cd contracts && SEPOLIA_RPC_URL=… ~/.foundry/bin/forge test` all green.

### Task 6: Verifier package

`packages/verifier` (ESM TS, vitest) implementing Part A §A4 exactly.
- `verify(client, name, opts?) → { input, normalized, verdict, checks: {id, pass, detail}[], resolved: { address?, canonical?, parents?[] }, doorways: DoorwayResult[] }`.
- Registry walk reads from ENSv2 registries using `deployments/*.json` (injected, not hardcoded). Records via UniversalResolver (viem).
- C1 member token alive; C2 doorway registry == canonical registry; C3 doorway parent ∈ `enf.parents`; C4 parent not expired; C5 via optional injected `screen(address)` (absent → C5 omitted, not failed).
- `doorways`: for each name in `enf.parents` plus the typed parent, verdict for `<label>.<parent>`.
- Vitest integration tests against the fork (skip with a clear message if `RPC_URL` unreachable) for: green (shopa), red (scam), black (nobody.support.shopa.eth, support.shopa.eth), black after unmount (shopb), black-everywhere after unregister. Unit tests for pure logic (verdict aggregation) with no network.
- `scripts/verify.ts <name>` CLI printing a table.
- **Acceptance:** `npm test -w packages/verifier` green with anvil fork + `setup-all` done.

### Task 7: Single-screen UI

`app/` Next.js App Router.
- Server-side route `app/api/verify/route.ts` calling the verifier (RPC from env; screening key server-only).
- Page: one input, big verdict card (green/red/orange/black) with C1–C5 list and failure reasons, doorway strip for every declared mount plus the typed doorway, block number ticker; re-verifies on every new block (poll `/api/verify` on block change via a lightweight `/api/block` or client-side `watchBlockNumber` against a public RPC env).
- Large type, dark theme, readable at 3 m. No demo action buttons, no keys in the client.
- **Acceptance:** `npm run build -w app` succeeds; with fork + setup, `npm run dev -w app` renders green for `mia.support.shopa.eth` and red for `mia.support.scam.eth` (verify with Playwright screenshot).

### Task 8: Intercepta screening adapter (gated — only after Tasks 1–7 complete)

- Research Intercepta's public docs/API. If a public API exists: implement `packages/verifier/src/screen/intercepta.ts` matching it, server-side only, key from `INTERCEPTA_API_KEY`, per-address cache. If no public API is findable: implement the `Screen` interface with an `intercepta` adapter stub that returns `{status:"unknown", reason:"INTERCEPTA_API_KEY not set / API not configured"}` plus a `static-list` adapter (flagged addresses from env `SCREEN_FLAGGED`) used for the demo, and document in `docs/intercepta.md` exactly what must be filled at the event.
- Wire C5 + orange verdict into verifier and UI; `unknown` shows as unknown, never green.
- `scripts/demo-dirty-settlement.ts` / `demo-clean-settlement.ts`: operator flips default `addr(60)` to a flagged/clean address.
- Tests for the full truth table (Part A §A4), incl. counterfeit mount with clean address → red.

### Task 9: README and Curvegrid section

- `README.md`: pitch, architecture diagram (A2), demo runbook (fork + live Sepolia steps, exact commands), truth table, "Why it's new", known limitations (counterfeit mounts detectable, not preventable), ENS correctness notes, and a "ENF for AI agents" section for Curvegrid (agents as namespaces, ENSIP-26 discovery via default bundle, hire/fire with one tx). Contract addresses table sourced from `deployments/`.
- **Acceptance:** every command in the runbook was executed at least once in this task and works as written.
