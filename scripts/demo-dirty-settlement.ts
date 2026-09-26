// scripts/demo-dirty-settlement.ts
//
// Screening demo (Task 8, Intercepta): the OPERATOR points the fleet's shared default
// addr(60) at a "dirty" address that the screen flags, with ONE multicall on the shared
// resolver. Because every member falls back to the default record, every endorsed doorway
// (mia/kai/rin under vendor, shopa, shopb) turns ORANGE at once; the counterfeit scam
// doorway stays RED (ENS precedence).
//
// The flagged address is a real OFAC-sanctioned address (SANCTIONED_DEMO_ADDRESS); the
// script confirms it against the Chainalysis sanctions oracle before sending, so the
// verifier's C5 check flags it from real data. Idempotent: no tx if already dirty.
//
//   npx tsx scripts/demo-dirty-settlement.ts
//   npx tsx scripts/demo-clean-settlement.ts   # undo

import { sanctionsOracleScreen } from "@fns/verifier/screen";
import { ensureDirtySettlementAddress, setDefaultSettlement } from "./lib/fleet.js";

async function main() {
  const dirty = ensureDirtySettlementAddress();
  const check = await sanctionsOracleScreen({ rpcUrl: process.env.SANCTIONS_RPC_URL || undefined })(dirty);
  if (check.status !== "flagged") throw new Error(`${dirty} is not confirmed sanctioned (${check.status}: ${check.reason}); refusing to run the demo`);
  console.log(`  ${dirty}: ${check.reason}`);
  const changed = await setDefaultSettlement(dirty);
  console.log(changed.length ? changed.map((c) => `  ${c}`).join("\n") : "default addr(60) already dirty (no tx sent)");
  console.log(`default addr(60) = ${dirty}  (flagged: OFAC sanctioned)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
