// packages/verifier/src/node.ts — Node-only loader (uses fs). Import as "@fns/verifier/node".

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Abi } from "viem";
import { REQUIRED_ABIS, type RequiredAbiName, type SepoliaJson, deploymentFromJson } from "./deployment";
import type { VerifierDeployment } from "./types";

/** Loads deployments/sepolia.json at `path` plus the ABI files it references (paths relative to its directory). */
export function loadDeployment(path: string): VerifierDeployment {
  const json = JSON.parse(readFileSync(path, "utf8")) as SepoliaJson;
  const dir = dirname(path);
  const abis = {} as Record<RequiredAbiName, Abi>;
  for (const name of REQUIRED_ABIS) {
    const entry = json.contracts[name];
    if (!entry) throw new Error(`${path} has no contract "${name}"`);
    abis[name] = JSON.parse(readFileSync(resolve(dir, entry.abi), "utf8")) as Abi;
  }
  return deploymentFromJson(json, abis);
}
