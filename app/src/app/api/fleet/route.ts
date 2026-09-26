// GET /api/fleet[?block=<n>] -> FleetScan JSON: every mount, agent, agent x doorway verdict and recent event,
// all read from chain at one block (see lib/fleet-scan.server.ts). 502 when the RPC is unreachable,
// 503 when there is no fleet file yet (run scripts/setup-all.ts).

import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { FleetFileMissingError, getDeployment, getScanContracts, getScreening, readFleetFile } from "@/lib/deployment.server";
import { rpcClient, rpcErrorMessage } from "@/lib/rpc.server";
import { scanFleet } from "@/lib/fleet-scan.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let fleet;
  try {
    fleet = readFleetFile();
  } catch (err) {
    if (err instanceof FleetFileMissingError) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }
  const blockParam = new URL(request.url).searchParams.get("block");
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
    const scan = await scanFleet(
      {
        client,
        deployment: getDeployment(),
        fleetRegistry: getAddress(fleet.fleetRegistry),
        sharedResolverHint: fleet.sharedResolver ? getAddress(fleet.sharedResolver) : undefined,
        deployBlockHint: typeof fleet.deployBlock === "number" ? BigInt(fleet.deployBlock) : undefined,
        ethRegistry,
        labelStore,
        resolverAbi,
        screen: screening.screen,
      },
      `${screening.source}|${screening.description}`,
      blockParam === null ? undefined : BigInt(blockParam),
    );
    return NextResponse.json({ ...scan, screening: { source: screening.source, description: screening.description } });
  } catch (err) {
    const message = rpcErrorMessage(err);
    return NextResponse.json({ error: `RPC unavailable: ${message}` }, { status: 502 });
  }
}
