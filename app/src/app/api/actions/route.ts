// GET  /api/actions -> ActionsInfo (are the kill switches enabled here, and for which targets).
// POST /api/actions { action, target? } -> ActionPlan: unsigned transactions for the browser wallet to sign.
// The server holds no keys and sends nothing; see lib/actions.server.ts.

import { NextResponse } from "next/server";
import { actionsInfo, isActionName, planAction } from "@/lib/actions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await actionsInfo());
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
  const { action, target } = (body ?? {}) as { action?: unknown; target?: unknown };
  if (!isActionName(action)) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  if (target !== undefined && typeof target !== "string") return NextResponse.json({ ok: false, error: "target must be a string" }, { status: 400 });
  const plan = await planAction(action, target);
  return NextResponse.json(plan, { status: plan.ok ? 200 : 409 });
}
