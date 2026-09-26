// GET /api/verify?name=<ens name> -> VerifyResult JSON.
//
// 400 for a missing/blank ?name=. 502 when the RPC transport itself fails (verify()
// rejects on transport errors per packages/verifier — those never become a verdict).
// A syntactically-bad ENS name is NOT a 400: verify() returns a normal 200 "black"
// result for it ("invalid name: ...").

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { verify, type VerifyResult } from "@mount/verifier";
import { FleetFileMissingError, RPC_URL, getDeployment, readFleetFile } from "@/lib/deployment.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "missing or empty ?name=" }, { status: 400 });
  }

  let fleet;
  try {
    fleet = readFleetFile();
  } catch (err) {
    if (err instanceof FleetFileMissingError) return NextResponse.json({ error: err.message }, { status: 500 });
    throw err;
  }

  const deployment = getDeployment();
  const client = createPublicClient({ transport: http(RPC_URL) });

  let result: VerifyResult;
  try {
    result = await verify(client, name, { deployment });
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return NextResponse.json({ error: `RPC unavailable: ${message}` }, { status: 502 });
  }

  // Doorways come from the typed name's own mount.parents record. If that record
  // couldn't be read at all (e.g. the typed name is fully unregistered), fall back to
  // also showing the fleet's known canonical doorway so the strip isn't just the typed
  // name alone (packages/verifier task-6-report, Concern #2).
  if (result.label && result.resolved.parents === undefined && fleet.canonicalName) {
    const canonicalDoorway = `${result.label}.${fleet.canonicalName}`;
    if (canonicalDoorway !== result.normalized && !result.doorways.some((d) => d.normalized === canonicalDoorway)) {
      try {
        const extra = await verify(client, canonicalDoorway, { deployment, doorways: false });
        result = { ...result, doorways: [...result.doorways, { ...extra, isInput: false }] };
      } catch {
        // Best-effort fallback only; the main result already stands on its own.
      }
    }
  }

  return NextResponse.json(result);
}
