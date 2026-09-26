// GET  /api/actions -> ActionsInfo (are the kill switches enabled here, and for which targets).
// POST /api/actions { action, target? } -> ActionResult. Fork only; see lib/actions.server.ts.

import { NextResponse } from "next/server";
import { actionsInfo, isActionName, runAction } from "@/lib/actions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await actionsInfo());
}

export async function POST(request: Request) {
  // Same-origin only: a page on another origin must not be able to fire transactions on the dev fork.
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
  const result = await runAction(action, target);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
