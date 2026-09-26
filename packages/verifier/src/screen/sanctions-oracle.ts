// packages/verifier/src/screen/sanctions-oracle.ts — OFAC sanctions screen via the Chainalysis oracle. SERVER-SIDE.
//
// Chainalysis publishes the OFAC SDN crypto addresses on chain, free and keyless:
//   Ethereum mainnet 0x40C57923924B5c5c5455c48D93317139ADDaC8fb  isSanctioned(address) view returns (bool)
//   (https://go.chainalysis.com/chainalysis-oracle-docs.html)
// The oracle lives on mainnet, not Sepolia, so it is read through a mainnet RPC regardless of which chain the fleet
// is on. Every failure is { status: "unknown" } (never "clean", never a throw); only definite answers are cached.

import { type Address, createPublicClient, getAddress, http, parseAbi } from "viem";
import type { Screen, ScreenResult } from "../types";

export const CHAINALYSIS_SANCTIONS_ORACLE: Address = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";
export const SANCTIONS_DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";

const ORACLE_ABI = parseAbi(["function isSanctioned(address addr) view returns (bool)"]);

export type SanctionsOracleConfig = {
  /** Mainnet RPC used to read the oracle. Default https://ethereum-rpc.publicnode.com */
  rpcUrl?: string;
  /** Default: the Chainalysis mainnet oracle. */
  oracle?: Address;
  /** Per-request timeout. Default 4000 ms. */
  timeoutMs?: number;
  /** Per-address cache TTL for clean/flagged answers. Default 5 minutes (the list changes rarely). */
  cacheTtlMs?: number;
  /** Injected for tests. Default: a readContract against the oracle. */
  isSanctioned?: (address: Address) => Promise<boolean>;
  /** Injected for tests. Default Date.now. */
  now?: () => number;
};

export function sanctionsOracleScreen(cfg: SanctionsOracleConfig = {}): Screen {
  const oracle = cfg.oracle ?? CHAINALYSIS_SANCTIONS_ORACLE;
  const ttl = cfg.cacheTtlMs ?? 5 * 60_000;
  const now = cfg.now ?? Date.now;
  let lookup = cfg.isSanctioned;
  if (!lookup) {
    const client = createPublicClient({ transport: http(cfg.rpcUrl ?? SANCTIONS_DEFAULT_RPC_URL, { timeout: cfg.timeoutMs ?? 4000, retryCount: 1 }) });
    lookup = (address) => client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "isSanctioned", args: [address] });
  }
  const cache = new Map<string, { at: number; r: ScreenResult }>();

  return async (address) => {
    const a = getAddress(address);
    const hit = cache.get(a);
    if (hit && now() - hit.at < ttl) return hit.r;
    let r: ScreenResult;
    try {
      r = (await lookup!(a))
        ? { status: "flagged", reason: "on the OFAC sanctions list (Chainalysis oracle, Ethereum mainnet)" }
        : { status: "clean", reason: "not on the OFAC sanctions list (Chainalysis oracle)" };
    } catch (err) {
      return { status: "unknown", reason: `sanctions oracle unreachable: ${(err as Error).message.split("\n")[0]}` };
    }
    cache.set(a, { at: now(), r });
    return r;
  };
}
