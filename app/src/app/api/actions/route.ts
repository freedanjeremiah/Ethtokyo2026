// GET  /api/actions[?fleet=<name>] -> ActionsInfo (are the kill switches enabled here, and for which targets).
// POST /api/actions { fleet?, action, target?, address? } -> ActionPlan: unsigned transactions for the browser wallet to sign.
// No fleet means the demo fleet, support.vendor.eth.
// The server holds no keys and sends nothing; see lib/actions.server.ts.

import { NextResponse } from "next/server";
import { actionsInfo, isActionName, planAction } from "@/lib/actions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(await actionsInfo(new URL(request.url).searchParams.get("fleet") ?? undefined));
}

export async function POST(request: Request) {
  // Same-origin only: plans are for this dashboard.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ ok: false, error: "cross-origin request refused" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const { fleet, action, target, address } = (body ?? {}) as { fleet?: unknown; action?: unknown; target?: unknown; address?: unknown };
  if (!isActionName(action)) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  if (fleet !== undefined && typeof fleet !== "string") return NextResponse.json({ ok: false, error: "fleet must be a string" }, { status: 400 });
  if (target !== undefined && typeof target !== "string") return NextResponse.json({ ok: false, error: "target must be a string" }, { status: 400 });
  if (address !== undefined && typeof address !== "string") return NextResponse.json({ ok: false, error: "address must be a string" }, { status: 400 });
  const plan = await planAction({ fleet, action, target, address });
  return NextResponse.json(plan, { status: plan.ok ? 200 : 409 });
}
