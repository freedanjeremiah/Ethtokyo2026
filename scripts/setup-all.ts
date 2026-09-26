// scripts/setup-all.ts
//
// Builds the whole demo world, in order: setup-names, 01-deploy-fleet,
// 02-mount, 03-register, 04-records. Every step is idempotent, so this is
// safe to re-run.
//
//   npx tsx scripts/00-keys.ts && npx tsx scripts/setup-all.ts

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STEPS = ["setup-names.ts", "01-deploy-fleet.ts", "02-mount.ts", "03-register.ts", "04-records.ts"];

for (const step of STEPS) {
  console.log(`\n=== ${step}`);
  const r = spawnSync("npx", ["tsx", resolve(HERE, step)], { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`\n${step} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}
console.log("\nsetup-all: done");
