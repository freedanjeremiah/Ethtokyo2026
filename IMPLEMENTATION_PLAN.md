# MOUNT — Brainstorm & Implementation Plan

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
| `mount.canonical` | `support.vendor.eth` | canonical name claim |
| `mount.parents` | comma list of endorsed parent names (normalized) | **two-sided consent roster** |

Open design choice: store the roster (`mount.canonical`, `mount.parents`) as text records on the **canonical name's node** vs. in the default bundle. **Recommendation:** default bundle — every member then carries the roster through any doorway, and it's written once by the operator. Decide in Phase 0 after confirming default-record semantics for text keys.

### A4. Verifier algorithm (the product)

Input: any name `L.support.P` typed by the user.

```
1. n = normalize(input)                            // @adraffy/ens-normalize via viem
2. resolve via UniversalResolver (stock viem):
     addr, text(mount.canonical), text(mount.parents), ENSIP-26 keys
   → ResolverNotFound / no addr  ⇒  ⚫ NOT A MEMBER (true negative)
3. Walk registries down from root:
     parentRegistry(P) → subregistry("support") = R_doorway
     canonicalRegistry = subregistry of mount.canonical's parent chain = R_canonical
4. Checks
     C1 token exists in R_doorway for label L, not expired         (member alive)
     C2 R_doorway == R_canonical                                    (canonical registry match)
     C3 normalize(P-side parent name) ∈ mount.parents               (two-sided consent)
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
- [ ] Doorway discovery: read `mount.parents` → build sibling names → verify each (powers the "three consequences" panel).
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

- [ ] README section: "MOUNT for AI agents" — agent fleets as namespaces; merchants hire/fire fleets with one tx; any agent client verifies an agent's doorway before transacting (ENSIP-26 discovery keys served from the default bundle).
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
