// scripts/00-keys.ts
//
// Generates fresh private keys for every MOUNT actor into .env.local
// (refusing to overwrite an existing key unless --force), and — when
// RPC_URL points at a local anvil fork — funds each actor with 100 ETH via
// anvil_setBalance so later scripts can pay gas and MockUSDC fees without a
// human funding step. On live Sepolia, funding is left to a human (see
// global-constraints.md: "funding keys ... performed by the human later").
//
//   npx tsx scripts/00-keys.ts [--force]

import { formatEther, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ACTOR_LABELS,
  ENV_LOCAL_PATH,
  detectChainKind,
  pkEnvVar,
  publicClient,
  readEnvFileValue,
  upsertEnvFile,
} from "./lib/env.js";

const FORCE = process.argv.includes("--force");
const FUND_AMOUNT = parseEther("100");

type Summary = { label: string; address: `0x${string}`; action: "generated" | "kept" };

async function main() {
  const updates: Record<string, string> = {};
  const summary: Summary[] = [];

  for (const label of ACTOR_LABELS) {
    const varName = pkEnvVar(label);
    const existing = readEnvFileValue(ENV_LOCAL_PATH, varName);
    if (existing && !FORCE) {
      const address = privateKeyToAccount(existing as `0x${string}`).address;
      summary.push({ label, address, action: "kept" });
      continue;
    }
    const pk = generatePrivateKey();
    const address = privateKeyToAccount(pk).address;
    updates[varName] = pk;
    summary.push({ label, address, action: "generated" });
  }

  if (Object.keys(updates).length > 0) {
    upsertEnvFile(ENV_LOCAL_PATH, updates);
  }

  console.log(`.env.local: ${ENV_LOCAL_PATH}`);
  for (const s of summary) {
    console.log(`  ${s.label.padEnd(8)} ${s.address}  (${s.action})`);
  }

  const chainKind = await detectChainKind();
  if (chainKind !== "anvil") {
    console.log(`\nRPC_URL (${process.env.RPC_URL ?? "http://127.0.0.1:8545"}) is not a local anvil node.`);
    console.log(`Skipping anvil_setBalance funding — fund these addresses with real Sepolia ETH yourself.`);
    return;
  }

  console.log(`\nanvil fork detected — funding each actor with ${formatEther(FUND_AMOUNT)} ETH`);
  for (const s of summary) {
    await publicClient.request({
      method: "anvil_setBalance",
      params: [s.address, `0x${FUND_AMOUNT.toString(16)}`],
    } as never);
    console.log(`  ${s.label.padEnd(8)} ${s.address}  balance -> ${formatEther(FUND_AMOUNT)} ETH`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
