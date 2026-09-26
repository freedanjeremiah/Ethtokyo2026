// app/src/lib/actions.server.ts — dashboard kill switches, signed in the viewer's browser wallet.
//
// The server holds no private keys. For each action it reads the chain and returns a plan: the unsigned
// transactions still needed, each with the address that must sign it (the name's on-chain owner, or the vendor /
// operator recorded in the fleet file). The browser sends them through the connected wallet. The calls mirror the
// fork-tested scripts/demo-*.ts, and targets are checked against the fleet file, never passed through as free text.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Abi, type Address, type Hex, decodeFunctionResult, encodeFunctionData, getAddress, labelhash, parseAbi, zeroAddress } from "viem";
import { sanctionsOracleScreen } from "@enf/verifier/screen";
import type { ActionName, ActionPlan, ActionsInfo, TxStep } from "./fleet-types";
import { FleetFileMissingError, REPO_ROOT, getScanContracts, readFleetFile, serverEnv, type FleetFile } from "./deployment.server";
import { rpcClient } from "./rpc.server";

const ACTIONS: readonly ActionName[] = ["unmount", "fire", "dirty", "clean", "counterfeit", "reset"];
const MOUNT_LABEL = "support";
const REG_STATUS_REGISTERED = 2;
const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const MEMBER_ROLES = 0n;
const ENTRY_DURATION_SECONDS = 365n * 24n * 60n * 60n;
/** Same OFAC-sanctioned address as scripts/lib/fleet.ts SANCTIONED_DEMO_ADDRESS. */
const SANCTIONED_DEMO_ADDRESS = getAddress("0x098B716B8Aaf21512996dC57EB0615e2383E2f96");
const ZERO_NODE = `0x${"00".repeat(32)}` as Hex;
/** addr() is reached through the resolver's ENSIP-10 resolve(), so it is not in PermissionedResolverImpl's ABI. */
const ADDR_ABI = parseAbi(["function addr(bytes32 node, uint256 coinType) view returns (bytes)"]);

export function isActionName(x: unknown): x is ActionName {
  return typeof x === "string" && (ACTIONS as readonly string[]).includes(x);
}

let abis: { registry: Abi; resolver: Abi } | null = null;
function contractAbis() {
  abis ??= {
    registry: JSON.parse(readFileSync(resolve(REPO_ROOT, "deployments", "abis", "UserRegistryImpl.json"), "utf8")) as Abi,
    resolver: getScanContracts().resolverAbi,
  };
  return abis;
}

async function chainKind(): Promise<"anvil" | "live" | "unreachable"> {
  const client = rpcClient();
  try {
    await client.getBlockNumber();
  } catch {
    return "unreachable";
  }
  try {
    const v = (await client.request({ method: "web3_clientVersion" } as never)) as string;
    return typeof v === "string" && v.toLowerCase().includes("anvil") ? "anvil" : "live";
  } catch {
    return "live";
  }
}

export async function actionsInfo(): Promise<ActionsInfo> {
  const off = (reason: string): ActionsInfo => ({ enabled: false, reason, parents: [], agents: [], chain: null });
  if (serverEnv("ENF_KILL_SWITCHES") === "off") return off("Turned off by ENF_KILL_SWITCHES=off.");
  const kind = await chainKind();
  if (kind === "unreachable") return off("The chain RPC is unreachable, so kill switches are paused.");
  let fleet;
  try {
    fleet = readFleetFile();
  } catch (err) {
    if (err instanceof FleetFileMissingError) return off("No fleet file yet. Run scripts/setup-all.ts.");
    throw err;
  }
  return { enabled: true, parents: Object.keys(fleet.parentRegistries ?? {}), agents: Object.keys(fleet.members ?? {}), chain: kind };
}

// ---------------------------------------------------------------- planning (reads only)

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const labelId = (label: string) => BigInt(labelhash(label));

async function read<T>(address: Address, functionName: string, args: readonly unknown[], abi = contractAbis().registry): Promise<T> {
  return (await rpcClient().readContract({ address, abi, functionName, args } as never)) as T;
}

function step(what: string, signer: string, from: Address, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): TxStep {
  return { what, signer, from: getAddress(from), to: getAddress(to), data: encodeFunctionData({ abi, functionName, args } as never) };
}

async function parentRegistry(label: string): Promise<Address> {
  const reg = await read<Address>(getScanContracts().ethRegistry, "getSubregistry", [label]);
  if (reg === zeroAddress) throw new Error(`${label}.eth has no registry. Run scripts/setup-all.ts.`);
  return reg;
}

/** support.<parent>.eth pointing at `target` (0x0 = unmounted) with resolver 0x0, signed by <parent>.eth's owner. */
async function mountSteps(parent: string, target: Address): Promise<TxStep[]> {
  const reg = await parentRegistry(parent);
  const owner = await read<Address>(getScanContracts().ethRegistry, "findOwner", [parent]);
  const signer = `${parent}.eth owner`;
  const name = `${MOUNT_LABEL}.${parent}.eth`;
  const { registry } = contractAbis();
  const state = await read<{ status: number }>(reg, "getState", [labelId(MOUNT_LABEL)]);
  if (state.status !== REG_STATUS_REGISTERED) {
    if (target === zeroAddress) return [];
    const now = (await rpcClient().getBlock()).timestamp;
    return [step(`Register ${name}`, signer, owner, reg, registry, "register", [MOUNT_LABEL, owner, target, zeroAddress, ALL_ROLES, now + ENTRY_DURATION_SECONDS])];
  }
  const steps: TxStep[] = [];
  const sub = await read<Address>(reg, "getSubregistry", [MOUNT_LABEL]);
  if (!same(sub, target))
    steps.push(step(target === zeroAddress ? `Unmount ${name}` : `Mount ${name}`, signer, owner, reg, registry, "setSubregistry", [labelId(MOUNT_LABEL), target]));
  const resolver = await read<Address>(reg, "getResolver", [MOUNT_LABEL]);
  if (resolver !== zeroAddress) steps.push(step(`Clear ${name} resolver`, signer, owner, reg, registry, "setResolver", [labelId(MOUNT_LABEL), zeroAddress]));
  return steps;
}

/** <label> registered in the fleet to its agent address with the shared resolver, signed by the vendor. */
async function memberSteps(fleet: FleetFile, label: string): Promise<TxStep[]> {
  const reg = getAddress(fleet.fleetRegistry);
  const vendor = fleetField(fleet, "vendor");
  const agent = getAddress(fleet.members[label]!);
  const shared = getAddress(fleet.sharedResolver);
  const { registry } = contractAbis();
  const state = await read<{ status: number; latestOwner: Address }>(reg, "getState", [labelId(label)]);
  if (state.status === REG_STATUS_REGISTERED) {
    if (!same(state.latestOwner, agent)) throw new Error(`${label} is registered to ${state.latestOwner}, expected ${agent}. Refusing to touch it.`);
    const resolver = await read<Address>(reg, "getResolver", [label]);
    return same(resolver, shared) ? [] : [step(`Point ${label} at the shared resolver`, "vendor", vendor, reg, registry, "setResolver", [labelId(label), shared])];
  }
  const now = (await rpcClient().getBlock()).timestamp;
  return [step(`Register ${label}`, "vendor", vendor, reg, registry, "register", [label, agent, zeroAddress, shared, MEMBER_ROLES, now + ENTRY_DURATION_SECONDS])];
}

/** The fleet's default addr(60) set to `settlement`, signed by the operator (the only role holder on the shared resolver). */
async function settlementSteps(fleet: FleetFile, settlement: Address): Promise<TxStep[]> {
  const resolverAddr = getAddress(fleet.sharedResolver);
  const operator = fleetField(fleet, "operator");
  const { resolver } = contractAbis();
  const query = encodeFunctionData({ abi: ADDR_ABI, functionName: "addr", args: [ZERO_NODE, 60n] });
  const raw = await read<Hex>(resolverAddr, "resolve", ["0x00", query], resolver);
  const current = decodeFunctionResult({ abi: ADDR_ABI, functionName: "addr", data: raw });
  if (same(current, settlement)) return [];
  return [step(`Set the fleet's settlement address to ${settlement}`, "operator", operator, resolverAddr, resolver, "setAddress", ["0x00", 60n, settlement])];
}

function fleetField(fleet: FleetFile, key: "vendor" | "operator"): Address {
  const v = fleet[key];
  if (!v) throw new Error(`the fleet file has no ${key} address. Rerun scripts/setup-all.ts.`);
  return getAddress(v);
}

function cleanSettlement(fleet: FleetFile): Address {
  const addr = serverEnv("SETTLEMENT_ADDRESS") || fleet.settlementAddress;
  if (!addr) throw new Error("no clean settlement address (SETTLEMENT_ADDRESS or the fleet file's settlementAddress).");
  return getAddress(addr);
}

async function buildSteps(action: ActionName, target: string | undefined, fleet: FleetFile): Promise<TxStep[]> {
  const fleetRegistry = getAddress(fleet.fleetRegistry);
  switch (action) {
    case "unmount":
      return mountSteps(target!, zeroAddress);
    case "counterfeit":
      return mountSteps("scam", fleetRegistry);
    case "fire": {
      const status = await read<number>(fleetRegistry, "getStatus", [labelId(target!)]);
      if (status !== REG_STATUS_REGISTERED) return [];
      return [step(`Fire ${target}`, "vendor", fleetField(fleet, "vendor"), fleetRegistry, contractAbis().registry, "unregister", [labelId(target!)])];
    }
    case "dirty": {
      const check = await sanctionsOracleScreen({ rpcUrl: serverEnv("SANCTIONS_RPC_URL") })(SANCTIONED_DEMO_ADDRESS);
      if (check.status !== "flagged") throw new Error(`${SANCTIONED_DEMO_ADDRESS} is not confirmed sanctioned (${check.status}); refusing to run the demo.`);
      return settlementSteps(fleet, SANCTIONED_DEMO_ADDRESS);
    }
    case "clean":
      return settlementSteps(fleet, cleanSettlement(fleet));
    case "reset": {
      const steps: TxStep[] = [];
      for (const parent of Object.keys(fleet.parentRegistries ?? {})) steps.push(...(await mountSteps(parent, fleetRegistry)));
      for (const label of Object.keys(fleet.members ?? {})) steps.push(...(await memberSteps(fleet, label)));
      steps.push(...(await settlementSteps(fleet, cleanSettlement(fleet))));
      return steps;
    }
  }
}

/** The unsigned transactions `action` still needs, each simulated from its signer so a revert shows up here, not in the wallet. */
export async function planAction(action: ActionName, target: string | undefined): Promise<ActionPlan> {
  const info = await actionsInfo();
  if (!info.enabled) return { ok: false, error: info.reason ?? "disabled" };
  if (action === "unmount" || action === "fire") {
    const allowed = action === "unmount" ? info.parents : info.agents;
    if (!target || !allowed.includes(target)) return { ok: false, error: `unknown target "${target ?? ""}" (expected ${allowed.join(", ")})` };
  }
  try {
    const steps = await buildSteps(action, target, readFleetFile());
    // Each step is independent of the others (all are planned from the same state), so each can be checked alone.
    for (const s of steps) {
      try {
        await rpcClient().call({ account: s.from, to: s.to, data: s.data });
      } catch (err) {
        return { ok: false, error: `${s.what} would revert: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message.split("\n")[0]}` };
      }
    }
    return { ok: true, steps };
  } catch (err) {
    return { ok: false, error: (err as Error).message.split("\n")[0] ?? "planning failed" };
  }
}
