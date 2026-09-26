// app/src/lib/rpc.server.ts — one shared, polite RPC client for every API route.
//
// Free public RPCs (the only ones a judge's laptop can rely on) rate-limit bursts. So every route shares one
// client that (1) folds concurrent contract reads into single Multicall3 eth_calls, (2) caps in-flight requests
// through one queue, and (3) on live Sepolia falls through to backup public RPCs when the configured one fails.
// A single free RPC is not enough: publicnode rate-limits eth_getLogs and rejects address-less log filters
// outright (the mount scan needs one), so one bad endpoint used to take the whole dashboard down. No JSON-RPC
// batching: some gateways answer a rate-limited batch with a non-array error that viem cannot parse.

import { type PublicClient, createPublicClient, custom, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import { getRpcUrl, isLocalRpc } from "./deployment.server";

/** Tried in order after RPC_URL. Both serve address-less eth_getLogs over the fleet's block range. */
const SEPOLIA_BACKUP_RPCS = ["https://sepolia.gateway.tenderly.co", "https://0xrpc.io/sep"];

const MAX_IN_FLIGHT = 4;

let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** A node behind the head (another provider, or another node behind one provider's load balancer) does not know
 * the block a read is pinned to yet. It catches up within a block or two, so these are retried, not reported. */
const BLOCK_NOT_SEEN = /header not found|unknown block|block not found|cannot query unfinalized|after last accepted block/i;

async function catchUp<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { message?: string; details?: string };
      if (attempt >= 4 || !BLOCK_NOT_SEEN.test(`${e.message ?? ""} ${e.details ?? ""}`)) throw err;
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
}

let cached: { url: string; client: PublicClient } | null = null;

/** The shared client for the current RPC_URL (Sepolia chain id 11155111, also on an anvil fork of it). */
export function rpcClient(): PublicClient {
  const url = getRpcUrl();
  if (cached?.url === url) return cached.client;
  // An anvil fork has no backup; on a live chain each endpoint gets one quick retry before the next one takes over.
  const base = isLocalRpc(url)
    ? http(url, { retryCount: 6, retryDelay: 400 })({ chain: sepolia })
    : fallback(
        [...new Set([url, ...SEPOLIA_BACKUP_RPCS])].map((u) => http(u, { retryCount: 1, retryDelay: 300, timeout: 20_000 })),
        { retryCount: 2, retryDelay: 500 },
      )({ chain: sepolia });
  const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: { wait: 16 } },
    transport: custom({ request: (args) => catchUp(() => limited(() => base.request(args))) }, { retryCount: 0 }),
  }) as PublicClient;
  cached = { url, client };
  return client;
}

/** One-line reason for a failed RPC call. viem's first line is often just "RPC Request failed."; the node's own
 * reason (rate limit, block range too wide, ...) is in `details`. */
export function rpcErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const first = err.message.split("\n")[0]!;
  const details = (err as { details?: unknown }).details;
  return typeof details === "string" && details && !first.includes(details) ? `${first} ${details}` : first;
}
