// scripts/03-register.ts
//
// Registers mia, kai, rin in the fleet registry (vendor key): owner = agent
// key, resolver = shared resolver, roleBitmap = 0 (no setter roles, no
// ROLE_CAN_TRANSFER_ADMIN => soulbound). Idempotent.
//
//   npx tsx scripts/03-register.ts

import { actorAddress } from "./lib/env.js";
import { MEMBERS, ensureMember, loadFleet, updateFleetFile } from "./lib/fleet.js";

async function main() {
  const { fleetRegistry, sharedResolver } = await loadFleet();
  const members: Record<string, `0x${string}`> = {};
  for (const m of MEMBERS) {
    const result = await ensureMember(m, fleetRegistry, sharedResolver);
    members[m.label] = actorAddress(m.actor);
    console.log(`${m.label} -> ${members[m.label]}: ${result}`);
  }
  const path = await updateFleetFile({ members });
  console.log(`wrote ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
