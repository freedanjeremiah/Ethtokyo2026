// app/src/lib/deployment.server.ts — server-only helpers for the FNS verifier UI.
//
// Builds a VerifierDeployment from deployments/sepolia.json + deployments/abis/*.json
// (never a static import: those files are read with fs at request time so a missing
// fleet file, or repo files that move, fail loudly instead of breaking the build).
// Do NOT import this from a client component — it uses node:fs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Address } from "viem";
import { REQUIRED_ABIS, type RequiredAbiName, type SepoliaJson, deploymentFromJson } from "@fns/verifier";
import type { VerifierDeployment } from "@fns/verifier";
import type { ScreenSelection } from "@fns/verifier/screen";
import { SCREEN_ENV_KEYS, screenFromEnvFile } from "@fns/verifier/screen/node";

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

/** A server setting: process.env wins; else the repo-root .env.local (so a plain `next dev` picks it up). */
export function serverEnv(key: string): string | undefined {
  return process.env[key] || readRootEnvValue(key) || undefined;
}

/** process.env.RPC_URL wins; else RPC_URL from the repo-root .env.local; else the local fork default. */
export function getRpcUrl(): string {
  return serverEnv("RPC_URL") || "http://127.0.0.1:8545";
}

/** A local node (127.0.0.1 / localhost), i.e. the anvil fork. */
export function isLocalRpc(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
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

type ScanContracts = { labelStore: { address: Address; abi: Abi }; resolverAbi: Abi; ethRegistry: Address };
let cachedExtras: ScanContracts | null = null;

/** LabelStore (tokenId -> label string), ETHRegistry and the PermissionedResolver ABI, for the dashboard's fleet scan. */
export function getScanContracts(): ScanContracts {
  if (cachedExtras) return cachedExtras;
  const sepolia = readJson<{ contracts: Record<string, { address: Address }> }>(resolve(REPO_ROOT, "deployments", "sepolia.json"));
  const labelStore = sepolia.contracts.LabelStore;
  const ethRegistry = sepolia.contracts.ETHRegistry;
  if (!labelStore || !ethRegistry) throw new Error("deployments/sepolia.json has no LabelStore / ETHRegistry");
  cachedExtras = {
    labelStore: { address: labelStore.address, abi: readJson<Abi>(resolve(REPO_ROOT, "deployments", "abis", "LabelStore.json")) },
    resolverAbi: readJson<Abi>(resolve(REPO_ROOT, "deployments", "abis", "PermissionedResolverImpl.json")),
    ethRegistry: ethRegistry.address,
  };
  return cachedExtras;
}

export { REPO_ROOT };

export class FleetFileMissingError extends Error {}

/**
 * FLEET_FILE env, else picked from the RPC the app talks to: a local node (127.0.0.1 / localhost) is the anvil
 * fork -> fleet.anvil.json; anything else is live Sepolia -> fleet.11155111.json (both repo-relative).
 */
export function fleetFilePath(): string {
  const envFile = process.env.FLEET_FILE;
  if (envFile) return resolve(REPO_ROOT, envFile);
  return resolve(REPO_ROOT, isLocalRpc(getRpcUrl()) ?"deployments/fleet.anvil.json" : "deployments/fleet.11155111.json");
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
  /** Fleet registry owner and shared-resolver operator: the addresses that sign the kill switches. */
  vendor?: string;
  operator?: string;
  /** Block the fleet registry was deployed in, written by scripts/01-deploy-fleet.ts. */
  deployBlock?: number;
};

/** Reads the fleet deployment file at request time (it's gitignored and may not exist at build time). */
export function readFleetFile(): FleetFile {
  const path = fleetFilePath();
  if (!existsSync(path)) {
    throw new FleetFileMissingError(
      `fleet deployment file not found at ${path}. Start the fork and run scripts/setup-all.ts (see task-7 acceptance steps), or set FLEET_FILE`,
    );
  }
  return readJson<FleetFile>(path);
}

// ---------------------------------------------------------------- C5 screening (Task 8)

let cachedScreening: { signature: string; selection: ScreenSelection } | null = null;

/**
 * Server-only screening selection, resolved by the same shared resolver scripts/verify.ts uses
 * (@fns/verifier/screen/node screenFromEnvFile) so the CLI and the app always agree on which
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
