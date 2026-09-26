// scripts/demo-clean-settlement.ts
//
// Undo for demo-dirty-settlement: the OPERATOR restores the fleet's default addr(60) to the
// clean settlement address (SETTLEMENT_ADDRESS, derived from OPERATOR_PK — see 04-records.ts)
// with one multicall. Idempotent: no tx if already clean. SCREEN_FLAGGED is left as is.
//
//   npx tsx scripts/demo-clean-settlement.ts

import { ensureSettlementAddress, setDefaultSettlement } from "./lib/fleet.js";

async function main() {
  const clean = ensureSettlementAddress();
  const changed = await setDefaultSettlement(clean);
  console.log(changed.length ? changed.map((c) => `  ${c}`).join("\n") : "default addr(60) already clean (no tx sent)");
  console.log(`default addr(60) = ${clean}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
