// scripts/01-deploy-fleet.ts
//
// Deploys (or finds) the fleet UserRegistry (all root roles -> vendor) and the
// shared PermissionedResolver (all roles -> operator; members get none), both
// as VerifiableFactory proxies, and records them in deployments/fleet.*.json.
// Idempotent.
//
//   npx tsx scripts/01-deploy-fleet.ts

import { actorAddress } from "./lib/env.js";
import { ensureFleetRegistry, ensureSharedResolver, readFleetFile, updateFleetFile } from "./lib/fleet.js";

async function main() {
  const f = await readFleetFile();
  const fleet = await ensureFleetRegistry(f.fleetRegistry);
  console.log(`fleet registry   ${fleet.address} (${fleet.status})`);
  const resolver = await ensureSharedResolver(f.sharedResolver);
  console.log(`shared resolver  ${resolver.address} (${resolver.status})`);
  const path = await updateFleetFile({
    fleetRegistry: fleet.address,
    sharedResolver: resolver.address,
    vendor: actorAddress("VENDOR"),
    operator: actorAddress("OPERATOR"),
    // Only known when this run deployed it; an existing fleet keeps the value already recorded.
    ...(fleet.deployBlock !== undefined ? { deployBlock: fleet.deployBlock } : {}),
  });
  console.log(`wrote ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
