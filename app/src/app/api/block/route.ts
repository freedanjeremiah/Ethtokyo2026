// GET /api/block -> { blockNumber } | { error }. Polled by the client to detect new blocks.

import { NextResponse } from "next/server";
import { rpcClient, rpcErrorMessage } from "@/lib/rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const blockNumber = await rpcClient().getBlockNumber({ cacheTime: 2_000 });
    return NextResponse.json({ blockNumber: blockNumber.toString() });
  } catch (err) {
    const message = rpcErrorMessage(err);
    return NextResponse.json({ error: `RPC unavailable: ${message}` }, { status: 502 });
  }
}
