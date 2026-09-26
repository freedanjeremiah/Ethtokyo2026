// scripts/check-resolution.ts [--unmounted <parent>]... [--unregistered <label>]...
//
// Acceptance check that uses ONLY stock viem ENS actions (getEnsAddress /
// getEnsText) with viem's built-in Sepolia chain — i.e. viem's default
// UniversalResolver, exactly what any wallet/app would use. No project libs.
// Expectations: every member resolves under every mount to SETTLEMENT_ADDRESS,
// except under parents given with --unmounted and for labels given with
// --unregistered, which must be null. Non-members and the mount node itself
// must be null. Exits 1 on any mismatch.
//
//   npx tsx scripts/check-resolution.ts
//   npx tsx scripts/check-resolution.ts --unmounted shopb
//   npx tsx scripts/check-resolution.ts --unmounted shopb --unregistered mia

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPublicClient, getAddress, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const SETTLEMENT = process.env.SETTLEMENT_ADDRESS;
if (!SETTLEMENT) throw new Error("SETTLEMENT_ADDRESS not set (run 04-records.ts)");

const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

function listArg(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    const next = process.argv[i + 1];
    if (a === flag && next) out.push(normalize(next));
  });
  return out;
}

const unmounted = listArg("--unmounted");
const unregistered = listArg("--unregistered");
const PARENTS = ["shopa", "shopb", "vendor", "scam"];
const MEMBERS = ["mia", "kai", "rin"];

let failures = 0;
function report(name: string, got: string | null, want: string | null) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(28)} ${String(got).padEnd(44)} ${ok ? "" : `(want ${want})`}`);
}

async function main() {
  console.log(`RPC ${RPC_URL}; UR = viem sepolia default ${sepolia.contracts.ensUniversalResolver.address}`);
  console.log(`expect settlement ${SETTLEMENT}; unmounted=[${unmounted}] unregistered=[${unregistered}]\n`);
  const want = getAddress(SETTLEMENT!);
  for (const m of MEMBERS) {
    for (const p of PARENTS) {
      const name = normalize(`${m}.support.${p}.eth`);
      const got = await client.getEnsAddress({ name });
      report(name, got, unmounted.includes(p) || unregistered.includes(m) ? null : want);
    }
  }
  for (const name of ["nobody.support.shopa.eth", "support.shopa.eth"].map((n) => normalize(n))) {
    report(name, await client.getEnsAddress({ name }), null);
  }
  if (!unregistered.includes("mia") && !unmounted.includes("shopa")) {
    const name = normalize("mia.support.shopa.eth");
    console.log();
    for (const key of ["enf.canonical", "enf.parents", "agent-context", "agent-endpoint[web]"]) {
      console.log(`     text(${name}, ${key}) = ${await client.getEnsText({ name, key })}`);
    }
    report(`${name} enf.canonical`, await client.getEnsText({ name, key: "enf.canonical" }), "support.vendor.eth");
    const parents = await client.getEnsText({ name, key: "enf.parents" });
    report(`${name} enf.parents`, parents, "support.vendor.eth,support.shopa.eth,support.shopb.eth");
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nall resolution checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
