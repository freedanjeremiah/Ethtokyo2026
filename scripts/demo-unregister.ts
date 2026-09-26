// scripts/demo-unregister.ts <label>
//
// Kill switch #2: the vendor burns one member with exactly ONE transaction,
// fleet.unregister(labelhash(label)), signed by the vendor key (root
// ROLE_UNREGISTER). The member stops resolving under every mount at once.
// No-op if the label is not currently registered.
//
//   npx tsx scripts/demo-unregister.ts mia

import { abiOf } from "./lib/deployment.js";
import { actorAccount, publicClient, walletClientFor } from "./lib/env.js";
import { labelId, loadFleet, memberByLabel, send } from "./lib/fleet.js";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: demo-unregister.ts <label>   (mia | kai | rin)");
  const member = memberByLabel(arg);
  const { fleetRegistry } = await loadFleet();
  const c = { address: fleetRegistry, abi: abiOf("UserRegistryImpl") };
  const status = (await publicClient.readContract({ ...c, functionName: "getStatus", args: [labelId(member.label)] })) as number;
  if (status !== 2) {
    console.log(`${member.label} is not registered (status ${status}); no tx sent`);
    return;
  }
  const vendor = walletClientFor(actorAccount("VENDOR"));
  await send(vendor, `VENDOR unregister(${member.label})`, { ...c, functionName: "unregister", args: [labelId(member.label)] });
  console.log(`unregistered ${member.label} from the fleet`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
