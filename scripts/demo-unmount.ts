// scripts/demo-unmount.ts <parent>
//
// Kill switch #1: the merchant cuts its doorway with exactly ONE transaction,
// <parent>Registry.setSubregistry(labelhash("support"), 0x0), signed by the
// merchant's own key. Every member instantly stops resolving under
// support.<parent>.eth; other mounts are unaffected. No-op if already unmounted.
//
//   npx tsx scripts/demo-unmount.ts shopb

import { zeroAddress, type Address } from "viem";
import { abiOf } from "./lib/deployment.js";
import { actorAccount, publicClient, walletClientFor } from "./lib/env.js";
import { MOUNT_LABEL, getParentRegistry, labelId, mountName, parentByLabel, send } from "./lib/fleet.js";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: demo-unmount.ts <parent>   (vendor | shopa | shopb | scam)");
  const parent = parentByLabel(arg);
  const reg = await getParentRegistry(parent.label);
  if (reg === zeroAddress) throw new Error(`${parent.label}.eth has no registry — run setup-all.ts`);
  const c = { address: reg, abi: abiOf("UserRegistryImpl") };
  const sub = (await publicClient.readContract({ ...c, functionName: "getSubregistry", args: [MOUNT_LABEL] })) as Address;
  if (sub === zeroAddress) {
    console.log(`${mountName(parent.label)} is already unmounted (no tx sent)`);
    return;
  }
  const wallet = walletClientFor(actorAccount(parent.actor));
  await send(wallet, `${parent.actor} setSubregistry(${mountName(parent.label)}, 0x0)`, {
    ...c,
    functionName: "setSubregistry",
    args: [labelId(MOUNT_LABEL), zeroAddress],
  });
  console.log(`unmounted ${mountName(parent.label)} (was -> ${sub})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
