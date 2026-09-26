// scripts/demo-counterfeit.ts
//
// Idempotently ensures the counterfeit mount exists: scam.eth has its own
// registry and support.scam.eth -> fleet (resolver 0x0). Nothing on-chain
// prevents this; the verifier catches it (not canonical, not in enf.parents).
//
//   npx tsx scripts/demo-counterfeit.ts

import { ensureMount, ensureParentRegistry, loadFleet, mountName, parentByLabel } from "./lib/fleet.js";

async function main() {
  const { fleetRegistry } = await loadFleet();
  const scam = parentByLabel("scam");
  await ensureParentRegistry(scam);
  const result = await ensureMount(scam, fleetRegistry);
  console.log(`${mountName(scam.label)} -> fleet ${fleetRegistry}: ${result}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
