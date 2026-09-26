// app/src/lib/rpc.server.ts — one shared, polite RPC client for every API route.
//
// Free public RPCs (the only ones a judge's laptop can rely on) rate-limit bursts. So every route shares one
// client that (1) folds concurrent contract reads into single Multicall3 eth_calls, (2) caps in-flight requests
// through one queue, and (3) retries rate-limited requests with backoff. No JSON-RPC batching: some gateways
// answer a rate-limited batch with a non-array error that viem cannot parse.

import { type PublicClient, createPublicClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { getRpcUrl } from "./deployment.server";

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

let cached: { url: string; client: PublicClient } | null = null;

/** The shared client for the current RPC_URL (Sepolia chain id 11155111, also on an anvil fork of it). */
export function rpcClient(): PublicClient {
  const url = getRpcUrl();
  if (cached?.url === url) return cached.client;
  const base = http(url, { retryCount: 6, retryDelay: 400 })({ chain: sepolia });
  const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: { wait: 16 } },
    transport: custom({ request: (args) => limited(() => base.request(args)) }, { retryCount: 0 }),
  }) as PublicClient;
  cached = { url, client };
  return client;
}
