// scripts/verify.ts <name> [--json]
//
// Runs the MOUNT verifier (@mount/verifier) against RPC_URL and prints the
// verdict, per-check reasons and the state of every sibling doorway.
//
//   npx tsx scripts/verify.ts mia.support.shopa.eth
//   npx tsx scripts/verify.ts mia.support.scam.eth --json
//
// C5 screening comes from screenFromEnvFile (@mount/verifier/screen/node — the same resolver the
// app's /api/verify uses), reading INTERCEPTA_API_KEY and/or SCREEN_FLAGGED from env / .env.local;
// with neither set, C5 is omitted.

import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { type VerifyCore, verify } from "@mount/verifier";
import { loadDeployment } from "@mount/verifier/node";
import { screenFromEnvFile } from "@mount/verifier/screen/node";
import { ENV_LOCAL_PATH, REPO_ROOT, RPC_URL } from "./lib/env.js";

const ICON: Record<string, string> = { green: "GREEN ", red: "RED   ", orange: "ORANGE", black: "BLACK " };

function printChecks(r: VerifyCore, indent = "  ") {
  console.log(`${indent}membership  ${r.membership.member ? "yes" : "no "}  ${r.membership.detail}`);
  for (const c of r.checks) console.log(`${indent}${c.id} ${c.title.padEnd(24)} ${c.pass ? "PASS" : "FAIL"}  ${c.detail}`);
}

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error("usage: verify.ts <name> [--json]   e.g. mia.support.shopa.eth");
  const deployment = loadDeployment(resolve(REPO_ROOT, "deployments", "sepolia.json"));
  const client = createPublicClient({ transport: http(RPC_URL) });
  const t0 = performance.now();
  // Shared with the app's /api/verify (@mount/verifier/screen/node) so the CLI and the app
  // always agree: process.env wins for scalar keys, SCREEN_FLAGGED is the union of both.
  const screening = screenFromEnvFile(process.env, ENV_LOCAL_PATH);
  const r = await verify(client, name, { deployment, screen: screening.screen });
  const ms = Math.round(performance.now() - t0);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ...r, screening: { source: screening.source, description: screening.description } }, null, 2));
    return;
  }
  console.log(`${r.input}  ->  ${r.normalized ?? "(invalid)"}   [block ${r.blockNumber ?? "-"}, ${ms} ms, RPC ${RPC_URL}]\n`);
  console.log(`screening: ${screening.description}`);
  const c5 = r.checks.find((c) => c.id === "C5");
  const unavailable = c5?.screen === "unknown" ? "   [screening unavailable]" : "";
  console.log(`VERDICT  ${ICON[r.verdict]}  ${r.summary}${unavailable}`);
  for (const reason of r.reasons) console.log(`  - ${reason}`);
  console.log("\nchecks");
  printChecks(r);
  console.log("\nresolved");
  console.log(`  addr(60)             ${r.resolved.address ?? "-"}`);
  console.log(`  mount.canonical      ${r.resolved.canonical ?? "-"}`);
  console.log(`  mount.parents        ${r.resolved.parents?.join(", ") ?? "-"}`);
  console.log(`  agent-context        ${r.resolved.agentContext ?? "-"}`);
  console.log(`  agent-endpoint[web]  ${r.resolved.agentEndpointWeb ?? "-"}`);
  console.log(`  R_doorway            ${r.registries.doorway ?? "-"}`);
  console.log(`  R_canonical          ${r.registries.canonical ?? "-"}`);
  console.log(`  canonicalName(R_d)   ${r.registries.canonicalNameOfDoorway ?? "-"}`);
  console.log(`\ndoorways (${r.doorways.length})`);
  for (const d of r.doorways) {
    const dc5 = d.checks.find((c) => c.id === "C5");
    const note = dc5?.screen === "unknown" ? "  [screening unavailable]" : "";
    console.log(`  ${ICON[d.verdict]}  ${(d.normalized ?? d.input).padEnd(28)} ${d.isInput ? "(typed) " : ""}${d.summary}${note}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
