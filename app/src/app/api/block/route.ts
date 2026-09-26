// GET /api/block -> { blockNumber } | { error }. Polled by the client to detect new blocks.

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { RPC_URL } from "@/lib/deployment.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = createPublicClient({ transport: http(RPC_URL) });
    const blockNumber = await client.getBlockNumber();
    return NextResponse.json({ blockNumber: blockNumber.toString() });
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return NextResponse.json({ error: `RPC unavailable: ${message}` }, { status: 502 });
  }
}
