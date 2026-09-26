// scripts/setup-names.ts
//
// Gives each FNS actor their `.eth` name via the real ETHRegistrar
// commit/reveal flow (scripts/lib/names.ts), then verifies ownership by
// reading it back from ETHRegistry. Idempotent: safe to re-run once names
// are already owned by the right actor.
//
//   npx tsx scripts/00-keys.ts && npx tsx scripts/setup-names.ts

import type { Address } from "viem";
import { type ActorLabel, actorAccount, actorAddress, publicClient, walletClientFor } from "./lib/env.js";
import { contractOf } from "./lib/deployment.js";
import { ensureEthNameOwnedBy } from "./lib/names.js";

const NAMES: { label: string; actor: ActorLabel }[] = [
  { label: "vendor", actor: "VENDOR" },
  { label: "shopa", actor: "SHOPA" },
  { label: "shopb", actor: "SHOPB" },
  { label: "scam", actor: "SCAM" },
];

async function main() {
  for (const { label, actor } of NAMES) {
    const account = actorAccount(actor);
    const wallet = walletClientFor(account);
    console.log(`${label}.eth -> ${actor} (${account.address})`);
    const result = await ensureEthNameOwnedBy(label, wallet);
    console.log(`  ${result.status}`);
  }

  console.log("\nVerifying against the registry:");
  const registry = contractOf("ETHRegistry");
  let failures = 0;
  for (const { label, actor } of NAMES) {
    const expected = actorAddress(actor);
    const owner = (await publicClient.readContract({
      ...registry,
      functionName: "findOwner",
      args: [label],
    })) as Address;
    const ok = owner.toLowerCase() === expected.toLowerCase();
    if (!ok) failures++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label}.eth owner=${owner} expected=${expected} (${actor})`);
  }

  if (failures > 0) {
    console.error(`\n${failures} name(s) not owned by the intended actor`);
    process.exit(1);
  }
  console.log("\nall names correctly owned");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
