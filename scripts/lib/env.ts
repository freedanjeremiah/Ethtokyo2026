// scripts/lib/env.ts
//
// Shared environment loading, chain-kind detection, and viem clients for
// FNS's fork-harness scripts. Every script in scripts/ that talks to a
// chain should go through this module instead of reading process.env or
// building clients directly, so RPC_URL / .env.local / chain-kind detection
// stay in one place.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type PublicClient, createPublicClient, createWalletClient, defineChain, http } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENV_LOCAL_PATH = resolve(REPO_ROOT, ".env.local");

// Load .env.local (gitignored) once, on import. Never anvil default
// accounts; never commit real values. A missing file is fine — scripts
// that need a key fail loudly at the point of use (requireEnv below).
dotenv.config({ path: ENV_LOCAL_PATH });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name} (set it in .env.local)`);
  return v;
}

// Per global-constraints.md: RPC_URL default is the local anvil fork, never
// a public RPC, so the same scripts work unmodified against live Sepolia by
// overriding RPC_URL.
export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

// Everything here is chain id 11155111, whether RPC_URL points at real
// Sepolia or an anvil fork of it.
export const chain = defineChain({
  id: 11155111,
  name: "sepolia-or-fork",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// Retries with backoff: free public RPCs rate-limit bursts.
const transport = () => http(RPC_URL, { retryCount: 6, retryDelay: 500 });

export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: transport(),
}) as PublicClient;

export function walletClientFor(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain, transport: transport() });
}

export type ActorWalletClient = ReturnType<typeof walletClientFor>;

/** Actors whose keys live in .env.local as `${LABEL}_PK` (see .env.example). */
export const ACTOR_LABELS = ["VENDOR", "OPERATOR", "SHOPA", "SHOPB", "SCAM", "MIA", "KAI", "RIN"] as const;
export type ActorLabel = (typeof ACTOR_LABELS)[number];

export function pkEnvVar(label: ActorLabel): string {
  return `${label}_PK`;
}

/** Reads `${LABEL}_PK` from process.env (loaded from .env.local) and derives the account. */
export function actorAccount(label: ActorLabel): PrivateKeyAccount {
  const pk = requireEnv(pkEnvVar(label));
  return privateKeyToAccount(pk as `0x${string}`);
}

export function actorAddress(label: ActorLabel): Address {
  return actorAccount(label).address;
}

export type ChainKind = "anvil" | "live";

/**
 * Detects whether RPC_URL is a local anvil node or a real chain (live
 * Sepolia). All chain-type branching in the fork harness (evm_increaseTime
 * shortcuts vs. real waits, anvil_setBalance funding, etc.) goes through
 * this one function.
 */
export async function detectChainKind(client: PublicClient = publicClient): Promise<ChainKind> {
  try {
    const version = (await client.request({ method: "web3_clientVersion" } as never)) as string;
    if (typeof version === "string" && version.toLowerCase().includes("anvil")) return "anvil";
  } catch {
    // web3_clientVersion unsupported (or errored) — treat as a real chain.
  }
  return "live";
}

// --- .env.local read/write helpers (preserve comments/order; touch only named keys) ---

function readEnvFileLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n");
}

/**
 * Updates `KEY=value` lines in an env file in place, preserving comments and
 * unrelated lines, and appending any key in `updates` that has no existing
 * line. Keys not present in `updates` are left untouched.
 */
export function upsertEnvFile(path: string, updates: Record<string, string>): void {
  const lines = readEnvFileLines(path);
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = /^([A-Z0-9_]+)=/.exec(line);
    const key = m?.[1];
    if (key && Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      const value = updates[key] ?? "";
      return `${key}=${value}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  writeFileSync(path, `${out.join("\n").replace(/\n*$/, "")}\n`);
}

/** Reads the current value of KEY from an env file on disk (not from dotenv's cached process.env). */
export function readEnvFileValue(path: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}=(.*)$`);
  for (const line of readEnvFileLines(path)) {
    const m = pattern.exec(line);
    const value = m?.[1];
    if (value !== undefined) return value;
  }
  return undefined;
}
