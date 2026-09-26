// GET  /api/onboard?owner=0x…&labels=a,b -> { names }: is each <label>.eth available, yours or taken.
// POST /api/onboard OnboardRequest -> OnboardPlan: the next batch of unsigned transactions for a new fleet.
// The server holds no keys and sends nothing; see lib/onboard.server.ts.

import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { nameStatuses, planOnboard } from "@/lib/onboard.server";
import type { OnboardRequest } from "@/lib/fleet-types";
import { rpcErrorMessage } from "@/lib/rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner") ?? "";
  const labels = (url.searchParams.get("labels") ?? "").split(",").filter(Boolean).slice(0, 6);
  if (!isAddress(owner)) return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  try {
    return NextResponse.json({ names: await nameStatuses(getAddress(owner), labels) });
  } catch (err) {
    return NextResponse.json({ error: `RPC unavailable: ${rpcErrorMessage(err)}` }, { status: 502 });
  }
}

function validRequest(b: unknown): b is OnboardRequest {
  const r = b as OnboardRequest;
  return (
    !!r && typeof r === "object" && typeof r.owner === "string" && isAddress(r.owner) && typeof r.vendor === "string" &&
    Array.isArray(r.doorways) && r.doorways.length <= 3 && r.doorways.every((d) => typeof d === "string") &&
    Array.isArray(r.agents) && r.agents.length <= 8 && r.agents.every((a) => a && typeof a.label === "string" && typeof a.address === "string" && isAddress(a.address)) &&
    !!r.secrets && typeof r.secrets === "object"
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ ok: false, error: "cross-origin request refused" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  if (!validRequest(body)) return NextResponse.json({ ok: false, error: "malformed onboarding request" }, { status: 400 });
  try {
    const plan = await planOnboard(body);
    return NextResponse.json(plan, { status: plan.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: rpcErrorMessage(err) }, { status: 502 });
  }
}
