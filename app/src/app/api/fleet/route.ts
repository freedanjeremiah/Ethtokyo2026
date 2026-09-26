// GET /api/fleet[?fleet=<name>][&block=<n>] -> FleetScan JSON: every mount, agent, agent x doorway verdict and recent
// event, all read from chain at one block (see lib/fleet-scan.server.ts). No fleet means the demo fleet,
// support.vendor.eth. 404 for a fleet that is not on chain (lib/fleet-resolve.server.ts), 502 when the RPC is unreachable,
// 503 when the demo fleet has no fleet file yet (run scripts/setup-all.ts).

import { NextResponse } from "next/server";
import { FleetFileMissingError, getDeployment, getScanContracts, getScreening } from "@/lib/deployment.server";
import { FleetNotFoundError, resolveFleet } from "@/lib/fleet-resolve.server";
import { rpcClient, rpcErrorMessage } from "@/lib/rpc.server";
import { scanFleet } from "@/lib/fleet-scan.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const blockParam = url.searchParams.get("block");
  if (blockParam !== null && !/^\d+$/.test(blockParam)) return NextResponse.json({ error: "block must be a decimal number" }, { status: 400 });

  let screening;
  try {
    screening = getScreening();
  } catch (err) {
    return NextResponse.json({ error: `screening misconfigured: ${(err as Error).message}` }, { status: 500 });
  }
  const { labelStore, resolverAbi, ethRegistry } = getScanContracts();
  const client = rpcClient();
  try {
    let fleet;
    try {
      fleet = await resolveFleet(url.searchParams.get("fleet"));
    } catch (err) {
      if (err instanceof FleetNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof FleetFileMissingError) return NextResponse.json({ error: err.message }, { status: 503 });
      throw err;
    }
    const scan = await scanFleet(
      {
        client,
        deployment: getDeployment(),
        fleetRegistry: fleet.fleetRegistry,
        sharedResolverHint: fleet.sharedResolver ?? undefined,
        deployBlockHint: fleet.deployBlock ?? undefined,
        ethRegistry,
        labelStore,
        resolverAbi,
        screen: screening.screen,
      },
      `${screening.source}|${screening.description}`,
      blockParam === null ? undefined : BigInt(blockParam),
    );
    return NextResponse.json({ ...scan, vendor: fleet.vendor, demo: fleet.demo, canonicalRequested: fleet.canonical, screening: { source: screening.source, description: screening.description } });
  } catch (err) {
    const message = rpcErrorMessage(err);
    return NextResponse.json({ error: `RPC unavailable: ${message}` }, { status: 502 });
  }
}
