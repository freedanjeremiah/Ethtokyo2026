// GET /api/fleets?owner=0x… -> { fleets: string[] }: canonical names of the fleets that wallet deployed (lib/fleet-resolve.server.ts).
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { fleetsOwnedBy } from "@/lib/fleet-resolve.server";
import { rpcErrorMessage } from "@/lib/rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get("owner") ?? "";
  if (!isAddress(owner)) return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  try {
    return NextResponse.json({ fleets: await fleetsOwnedBy(getAddress(owner)) });
  } catch (err) {
    return NextResponse.json({ error: `RPC unavailable: ${rpcErrorMessage(err)}` }, { status: 502 });
  }
}
