# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
ETHGlobal Tokyo 2026 judges (ENS track) watching a live demo: the presenter drives the dashboard on a projector or shared screen during a short judging slot, judges watch from a few metres away while the presenter clicks the kill switches and types names. Secondary: judges opening the live link later without narration.

## Product Purpose
ENF (Ethereum Naming Fleet) shows one ENSv2 agent-fleet registry mounted under several `.eth` names at once. A merchant adopts a vendor's support fleet into its own namespace with one transaction and drops it with one; the vendor removes one agent from every merchant with one transaction. The dashboard makes that visible and verifiable live, from chain reads, for any typed name. Success: in the first few seconds a judge understands "one fleet, many doorways", then watches a single click change several doorways at once.

## Positioning
Namespace aliasing is documented by ENS and built by nobody else: one registry reachable under several parents, with two kill switches owned by opposite parties, and a verifier that tells endorsed doorways from counterfeit ones using only stock ENS reads.

## Operating Context
- Live demo on live Sepolia or an anvil fork of it; kill switches are signed in the presenter's browser wallet.
- Demo script: resolve a live agent (green) -> merchant unmounts (its doorway dies next block) -> vendor fires an agent (dies under every doorway) -> type the counterfeit `kai.support.scam.eth` (resolves, flagged red because the fleet never endorsed that parent) -> optional: settlement address pointed at a flagged address (endorsed doorways turn orange).
- Data refreshes every block; everything shown is read from chain at one pinned block.

## Capabilities and Constraints
- Verdicts: green (endorsed, clean), red (counterfeit mount: C2 canonical registry or C3 two-sided consent fails), orange (endorsed doorway, flagged settlement counterparty via C5 screening), black (not a member / dead).
- Checks C1 member token alive, C2 canonical registry match, C3 two-sided consent (parent listed in `enf.parents`), C4 doorway alive, C5 counterparty screening (optional).
- Mounts are discovered from `SubregistryUpdated` logs, not config; agents from `LabelRegistered` logs; timeline from registry and resolver events.
- Kill switches never use server-held keys: the server plans the transactions and the browser wallet signs them.
- Terminology: fleet, agent (mia, kai, rin), doorway (`support.<parent>.eth`), vendor, merchant, operator, settlement address, default record.

## Brand Commitments
Name: ENF (Ethereum Naming Fleet). Tagline in use: "hire with one tx, fire with one". No logo exists.
Standing preference (chosen 2026-09-26): the category standard, played straight. The dashboard should sit alongside the ENS Manager app (app.ens.domains); its craft level is the quality bar. No novelty metaphor.

## Evidence on Hand
Live chain data only (fork or Sepolia). Fork test evidence in `docs/runbook-evidence.md`. No customers, testimonials, or usage numbers exist; none may be invented.

## Product Principles
- The mechanism is the hero: one fleet, many doorways, one-transaction consequences.
- Every verdict is evidence-backed and reproducible from chain; never show a claim the chain did not return.
- Readable from across a room: few words, strong structure, detail on demand.
- Honest failure: RPC down, unknown screening, or disabled kill switches are stated plainly.
- Not a generic crypto dashboard; must look finished, not like debug output.
