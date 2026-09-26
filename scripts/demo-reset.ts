// scripts/demo-reset.ts
//
// Restores the post-setup world after the demo kill switches: remounts every
// parent's `support` (incl. shopb after demo-unmount) and re-registers every
// member (incl. mia after demo-unregister — she gets a fresh tokenId). Only
// sends transactions for what is actually missing.
//
//   npx tsx scripts/demo-reset.ts

import { MEMBERS, PARENTS, ensureMember, ensureMount, loadFleet, mountName } from "./lib/fleet.js";

async function main() {
  const { fleetRegistry, sharedResolver } = await loadFleet();
  for (const parent of PARENTS) {
    console.log(`${mountName(parent.label)}: ${await ensureMount(parent, fleetRegistry)}`);
  }
  for (const m of MEMBERS) {
    console.log(`${m.label}: ${await ensureMember(m, fleetRegistry, sharedResolver)}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
