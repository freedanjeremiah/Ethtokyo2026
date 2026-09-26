// scripts/04-records.ts
//
// Operator writes the roster bundle into the shared resolver's DEFAULT record
// (DNS name 0x00), which every member without its own record falls back to:
//   addr(60)             = SETTLEMENT_ADDRESS (or a fresh address stored in .env.local)
//   enf.canonical      = support.vendor.eth
//   enf.parents        = support.vendor.eth,support.shopa.eth,support.shopb.eth (not scam)
//   agent-context        = https://enf.example/fleet        (placeholder URL)
//   agent-endpoint[web]  = https://enf.example/fleet/chat   (placeholder URL)
// Zero per-member record writes. Only differing entries are written. Idempotent.
//
//   npx tsx scripts/04-records.ts

import { ensureDefaultRecords, ensureSettlementAddress, loadFleet, rosterRecords, updateFleetFile } from "./lib/fleet.js";

async function main() {
  const { sharedResolver } = await loadFleet();
  const settlement = ensureSettlementAddress();
  const want = rosterRecords(settlement);
  const changed = await ensureDefaultRecords(sharedResolver, want);
  if (changed.length === 0) console.log("default record already up to date");
  for (const c of changed) console.log(`  ${c}`);
  console.log(`default record: addr(60)=${settlement}`);
  for (const [k, v] of Object.entries(want.texts)) console.log(`  ${k} = ${v}`);
  const path = await updateFleetFile({ settlementAddress: settlement });
  console.log(`wrote ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
