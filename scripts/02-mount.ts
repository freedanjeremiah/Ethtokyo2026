// scripts/02-mount.ts
//
// For each parent (vendor, shopa, shopb, scam): ensures <parent>.eth has its
// own UserRegistry (resolver 0x0), registers `support` there with
// subregistry = fleet and resolver 0x0, then sets the canonical back-pointers
// (fleet -> vendor registry -> ETHRegistry). Idempotent.
//
//   npx tsx scripts/02-mount.ts

import {
  PARENTS,
  ensureCanonicalParents,
  ensureMount,
  ensureParentRegistry,
  loadFleet,
  mountName,
  updateFleetFile,
} from "./lib/fleet.js";

async function main() {
  const { fleetRegistry } = await loadFleet();
  const parentRegistries: Record<string, `0x${string}`> = {};
  for (const parent of PARENTS) {
    console.log(`${parent.label}.eth (${parent.actor}${parent.endorsed ? "" : ", counterfeit"})`);
    parentRegistries[parent.label] = await ensureParentRegistry(parent);
    const result = await ensureMount(parent, fleetRegistry);
    console.log(`  ${mountName(parent.label)} -> fleet: ${result}`);
  }
  console.log("canonical parents");
  await ensureCanonicalParents(fleetRegistry);
  const path = await updateFleetFile({ parentRegistries, canonicalName: mountName("vendor"), mountLabel: "support" });
  console.log(`wrote ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
