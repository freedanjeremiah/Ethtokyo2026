// app/src/lib/deployment.server.ts — server-only helpers for the MOUNT verifier UI.
//
// Builds a VerifierDeployment from deployments/sepolia.json + deployments/abis/*.json
// (never a static import: those files are read with fs at request time so a missing
// fleet file, or repo files that move, fail loudly instead of breaking the build).
// Do NOT import this from a client component — it uses node:fs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi } from "viem";
import { REQUIRED_ABIS, type RequiredAbiName, type SepoliaJson, deploymentFromJson } from "@mount/verifier";
import type { VerifierDeployment } from "@mount/verifier";

// app/src/lib -> app/src -> app -> repo root
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

let cachedDeployment: VerifierDeployment | null = null;

/** Builds (once, cached) the VerifierDeployment from the committed deployments/ JSON files. */
export function getDeployment(): VerifierDeployment {
  if (cachedDeployment) return cachedDeployment;
  const sepolia = readJson<SepoliaJson>(resolve(REPO_ROOT, "deployments", "sepolia.json"));
  const abis = Object.fromEntries(
    REQUIRED_ABIS.map((name) => [name, readJson<Abi>(resolve(REPO_ROOT, "deployments", "abis", `${name}.json`))]),
  ) as Record<RequiredAbiName, Abi>;
  cachedDeployment = deploymentFromJson(sepolia, abis);
  return cachedDeployment;
}

export class FleetFileMissingError extends Error {}

/** FLEET_FILE env, else fleet.anvil.json in dev / fleet.11155111.json in production (repo-relative). */
export function fleetFilePath(): string {
  const envFile = process.env.FLEET_FILE;
  if (envFile) return resolve(REPO_ROOT, envFile);
  const file = process.env.NODE_ENV === "production" ? "deployments/fleet.11155111.json" : "deployments/fleet.anvil.json";
  return resolve(REPO_ROOT, file);
}

export type FleetFile = {
  fleetRegistry: string;
  sharedResolver: string;
  canonicalName: string;
  mountLabel: string;
  members: Record<string, string>;
  parentRegistries: Record<string, string>;
  settlementAddress: string;
  chainKind: string;
};

/** Reads the fleet deployment file at request time (it's gitignored and may not exist at build time). */
export function readFleetFile(): FleetFile {
  const path = fleetFilePath();
  if (!existsSync(path)) {
    throw new FleetFileMissingError(
      `fleet deployment file not found at ${path} — start the fork and run scripts/setup-all.ts (see task-7 acceptance steps), or set FLEET_FILE`,
    );
  }
  return readJson<FleetFile>(path);
}
