// scripts/lib/deployment.ts
//
// Loads contract addresses and ABIs from deployments/sepolia.json +
// deployments/abis/*.json — the ONLY source of ENS addresses for scripts and
// app code (see global-constraints.md: no hardcoded ENS addresses).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi, Address } from "viem";
import { REPO_ROOT } from "./env.js";

type ContractEntry = { address: Address; abi: string; codeHash: `0x${string}` };
type Deployment = { chainId: number; contracts: Record<string, ContractEntry> };

const DEPLOYMENTS_DIR = resolve(REPO_ROOT, "deployments");
const deployment: Deployment = JSON.parse(readFileSync(resolve(DEPLOYMENTS_DIR, "sepolia.json"), "utf8"));

export const DEPLOYMENT_CHAIN_ID = deployment.chainId;

function entry(name: string): ContractEntry {
  const e = deployment.contracts[name];
  if (!e) throw new Error(`deployments/sepolia.json has no contract "${name}"`);
  return e;
}

const abiCache = new Map<string, Abi>();

export function abiOf(name: string): Abi {
  const cached = abiCache.get(name);
  if (cached) return cached;
  const abi = JSON.parse(readFileSync(resolve(DEPLOYMENTS_DIR, entry(name).abi), "utf8")) as Abi;
  abiCache.set(name, abi);
  return abi;
}

export function addressOf(name: string): Address {
  return entry(name).address;
}

/** `{ address, abi }` pair, spreadable straight into viem's readContract/writeContract. */
export function contractOf(name: string): { address: Address; abi: Abi } {
  return { address: addressOf(name), abi: abiOf(name) };
}
