# MOUNT — hire a fleet with one transaction, fire it with one

**Primary track:** ENS · Best Use of ENSv2 — $6,000 (3 / 2 / 1)
**Secondary (gated):** Intercepta — address screening on the fleet's settlement address
**Tertiary:** Curvegrid — AI-agent prize ($1k), README-level

---

## 1. Pitch

One ENSv2 **UserRegistry** mounted at **several points in the namespace at once**.

- A **merchant** adopts an existing agent fleet into its own namespace with **one transaction it controls** (`setSubregistry`), and drops it with **one** (`setSubregistry(…, 0)`).
- The **vendor** removes one agent from **every** merchant with **one transaction** (unregister in the shared registry).
- Two kill switches, opposite owners, both verifiable by **any stock ENS client** (viem + UniversalResolver).

```
                vendor.eth            shopa.eth            shopb.eth          scam.eth
                    │                     │                    │                  │
          support.vendor.eth     support.shopa.eth    support.shopb.eth   support.scam.eth
          (canonical mount)        (merchant A)         (merchant B)      (counterfeit!)
                    └──────────────┬──────┴────────────────────┴──────────────────┘
                                   ▼
                     ONE UserRegistry  ("support fleet")
                        mia · kai · rin   ← one ERC-1155 token each
                                   │
                   shared resolver on members only (default record 0x00 bundle)
```

`mia.support.shopa.eth`, `mia.support.shopb.eth`, `mia.support.vendor.eth` are **the same token**.

## 2. Already verified on a fork (not assumed)

- One UserRegistry deployed via the **real factory**, mounted under three `.eth` names owned by three different accounts.
- One `register()` → **one** ERC-1155 token reachable under all three names, resolving through the **real UniversalResolver** with stock viem.
- Soulbound holds even via an approved operator.
- A parent lapse kills that doorway and leaves the others alive.

## 3. Why it is new

- Namespace aliasing is **documented by ENS and built by nobody**: of ~25 non-ENS repos calling `setSubregistry`, every one is single-mount.
- `linkToNode` / `linkToRecord` outside ensjs: **zero hits**.
- Default-record (`0x00`) usage outside ENS: **zero**.
- ENSv1 cannot express any of it (one node = one owner = one resolver).
- The previous winner of this prize shares only the skeleton — no aliasing, no default record, no linking.

## 4. Demo script (one screen, one input, three consequences)

| # | Action | What the audience sees |
|---|--------|------------------------|
| 1 | Type `mia.support.shopa.eth` | 🟢 owner, canonical registry, "mounted by shopa.eth ✓" |
| 2 | Merchant B unmounts (1 tx) | `mia.support.shopb.eth` dead next block; shopa stays 🟢 — *"fired the vendor"* |
| 3 | Vendor unregisters `mia` (1 tx) | every remaining doorway dies in one block — *"fired one agent everywhere"* |
| 4 | Type `mia.support.scam.eth` | **It resolves.** Verifier flags 🔴: C3 two-sided consent fails — `support.scam.eth` is not in the roster's `mount.parents`. (C2 canonical-registry passes by construction here; it guards against a copied/forked registry, not this attack.) ENS's own documented aliasing attack, caught live. |

## 5. Pros

- Best money per hour: $6k, three payouts, ~20h, real slack.
- Primitive is verified and unbuilt.
- One sponsor, one chain, no adapters, no external API, no phone.
- Hits the "agents as namespaces" bonus without touching the saturated agent-policy-in-text-records pattern.

## 6. Cons and loopholes (and the fix for each)

| # | Problem | Severity | Fix |
|---|---------|----------|-----|
| 1 | **Resolution ≠ membership.** If parents share the members' resolver, *everything* resolves — non-members, even the parent itself. A judge typing a random name falsifies us on stage. | **Fatal as originally designed. Non-negotiable.** | Topology: parents call `setSubregistry` **only**, parent resolver stays `0`. The shared resolver is attached to **members at registration**. Non-members → `ResolverNotFound` (true negative); members still get the default bundle with zero writes. |
| 2 | **Counterfeit mount is unfixable at contract level** — anyone can mount our registry under their name; canonicity is self-declared. | Structural | Own it as the centrepiece: **two-sided consent**. A mount counts only if the parent is *also* listed in the roster's own record. |
| 3 | Setter roles on a shared resolver: a member scoped to one key could rewrite **everyone's** value and the default bundle (verified). | High | Never grant setter roles to members. Operator bot only. Demo the revert. |
| 4 | Member expiry doesn't stop resolution through a shared parent resolver. | Medium | Covered by fix #1 (no parent resolver). |
| 5 | "Three browser tabs updating" is dull at three metres. | UX | One screen, one input, three consequences. |
| 6 | 09-15 redeploy drifted the registrar ABI, changed `getState`'s field order, packs role counts as 4-bit nybbles, removed convenience getters. | Ops | Pin ABIs from the live deployment, write our own decoders. **Fresh keys** — anvil default keys are delegated sweepers on Sepolia. |

## 7. Second sponsor, honestly — Intercepta

As normally posed, Intercepta is a **bolt-on** and eats the slack (9–11h).
The one framing that isn't: put the fleet's **settlement address in the default record**. The verifier then asks two orthogonal questions:

1. **Is this doorway endorsed?** (ENS: two-sided mount consent)
2. **Is the party behind it clean?** (Intercepta: screening of the settlement address)

A counterfeit mount resolves to the *same clean address*, so screening alone passes it. A legitimate vendor with a dirty settlement address passes ENS alone. **Only both together work.**

**Gate it at hour 20.** If the ENS core isn't demo-ready at hour 20, Intercepta is cut.

## 8. Third sponsor — Curvegrid

AI-agent $1k: a README paragraph, ~30 minutes, no SDK slot. Optional stretch in the plan if time remains.

---

See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the build.
