// scripts/demo-dirty-settlement.ts
//
// Screening demo (Task 8, Intercepta): the OPERATOR points the fleet's shared default
// addr(60) at a "dirty" address that the screen flags, with ONE multicall on the shared
// resolver. Because every member falls back to the default record, every endorsed doorway
// (mia/kai/rin under vendor, shopa, shopb) turns ORANGE at once; the counterfeit scam
// doorway stays RED (ENS precedence).
//
// The dirty address is derived from OPERATOR_PK (tag "enf.dirty-settlement.v1") and
// written to .env.local as DIRTY_SETTLEMENT_ADDRESS and into SCREEN_FLAGGED (the
// static-list screen used on the fork). Idempotent: no tx if already dirty.
//
//   npx tsx scripts/demo-dirty-settlement.ts
//   npx tsx scripts/demo-clean-settlement.ts   # undo

import { ensureDirtySettlementAddress, setDefaultSettlement } from "./lib/fleet.js";

async function main() {
  const dirty = ensureDirtySettlementAddress();
  const changed = await setDefaultSettlement(dirty);
  console.log(changed.length ? changed.map((c) => `  ${c}`).join("\n") : "default addr(60) already dirty (no tx sent)");
  console.log(`default addr(60) = ${dirty}  (flagged: listed in SCREEN_FLAGGED)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
