// app/src/lib/deployment.server.ts — server-only helpers for the ENF verifier UI.
//
// Builds a VerifierDeployment from deployments/sepolia.json + deployments/abis/*.json
// (never a static import: those files are read with fs at request time so a missing
// fleet file, or repo files that move, fail loudly instead of breaking the build).
// Do NOT import this from a client component — it uses node:fs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi } from "viem";
import { REQUIRED_ABIS, type RequiredAbiName, type SepoliaJson, deploymentFromJson } from "@enf/verifier";
import type { VerifierDeployment } from "@enf/verifier";
import type { ScreenSelection } from "@enf/verifier/screen";
import { SCREEN_ENV_KEYS, screenFromEnvFile } from "@enf/verifier/screen/node";

// app/src/lib -> app/src -> app -> repo root
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Reads a single KEY=value from the repo-root .env.local. Next.js only auto-loads .env.local from
 * app/ (Next's own cwd), never the repo root where scripts/00-keys.ts and the demo scripts write
 * RPC_URL/keys — so without this, the app silently falls back to 127.0.0.1:8545 even when the
 * root .env.local points at live Sepolia. process.env still wins when the same var is exported.
 */
function readRootEnvValue(key: string): string | undefined {
  const path = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] === key) return m[2]!.replace(/^["']|["']$/g, "");
  }
  return undefined;
}

/** process.env.RPC_URL wins; else RPC_URL from the repo-root .env.local; else the local fork default. */
export function getRpcUrl(): string {
  return process.env.RPC_URL || readRootEnvValue("RPC_URL") || "http://127.0.0.1:8545";
}

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

// ---------------------------------------------------------------- C5 screening (Task 8)

let cachedScreening: { signature: string; selection: ScreenSelection } | null = null;

/**
 * Server-only screening selection, resolved by the same shared resolver scripts/verify.ts uses
 * (@enf/verifier/screen/node screenFromEnvFile) so the CLI and the app always agree on which
 * screening config is active. process.env wins for scalar keys; SCREEN_FLAGGED is the union of
 * process.env and the repo-root .env.local (where scripts/demo-dirty-settlement.ts writes it),
 * re-read on every call so the demo works without restarting the dev server. The Screen (and
 * Intercepta's per-address cache) is rebuilt only when the config changes. INTERCEPTA_API_KEY
 * never leaves the server.
 */
export function getScreening(): ScreenSelection {
  const envLocalPath = resolve(REPO_ROOT, ".env.local");
  const envLocalContents = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : "";
  const relevantEnv = Object.fromEntries(SCREEN_ENV_KEYS.map((k) => [k, process.env[k]]));
  const signature = JSON.stringify({ relevantEnv, envLocalContents });
  if (cachedScreening?.signature !== signature) {
    cachedScreening = { signature, selection: screenFromEnvFile(process.env, envLocalPath) };
  }
  return cachedScreening.selection;
}
