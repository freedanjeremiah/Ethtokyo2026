// scripts/fund-actors.ts [targetEthPerActor]
//
// Live-Sepolia helper: you fund only the VENDOR address, and this tops up every other actor that sends
// transactions (OPERATOR, SHOPA, SHOPB, SCAM) from it, to `targetEthPerActor` (default 0.015 ETH each).
// Members (MIA/KAI/RIN) never send transactions, so they get nothing. Idempotent: only the shortfall is sent.
// On an anvil fork, 00-keys.ts already funds everyone, so this is normally a no-op there.
//
//   RPC_URL=https://ethereum-sepolia-rpc.publicnode.com npx tsx scripts/fund-actors.ts

import { formatEther, parseEther } from "viem";
import { type ActorLabel, actorAccount, detectChainKind, publicClient, walletClientFor } from "./lib/env.js";

const PAYEES: ActorLabel[] = ["OPERATOR", "SHOPA", "SHOPB", "SCAM"];

async function main() {
  const target = parseEther(process.argv[2] ?? "0.015");
  const kind = await detectChainKind();
  const vendor = walletClientFor(actorAccount("VENDOR"));
  const from = vendor.account.address;
  const startBal = await publicClient.getBalance({ address: from });
  console.log(`chain: ${kind}; VENDOR ${from} has ${formatEther(startBal)} ETH; target ${formatEther(target)} ETH per actor`);

  const plan: { label: ActorLabel; to: `0x${string}`; value: bigint }[] = [];
  for (const label of PAYEES) {
    const to = actorAccount(label).address;
    const bal = await publicClient.getBalance({ address: to });
    const value = bal < target ? target - bal : 0n;
    console.log(`  ${label.padEnd(8)} ${to}  ${formatEther(bal)} ETH${value ? `  -> send ${formatEther(value)}` : "  (ok)"}`);
    if (value) plan.push({ label, to, value });
  }
  const needed = plan.reduce((s, p) => s + p.value, 0n);
  if (!needed) return console.log("every actor is funded (no tx sent)");
  // Keep enough on VENDOR for its own setup transactions.
  const reserve = parseEther("0.01");
  if (startBal < needed + reserve) {
    throw new Error(`VENDOR needs at least ${formatEther(needed + reserve)} ETH (has ${formatEther(startBal)}); fund ${from} and re-run`);
  }
  for (const p of plan) {
    const hash = await vendor.sendTransaction({ to: p.to, value: p.value });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`    sent ${formatEther(p.value)} ETH to ${p.label}: ${hash}`);
  }
  console.log(`VENDOR left with ${formatEther(await publicClient.getBalance({ address: from }))} ETH`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
