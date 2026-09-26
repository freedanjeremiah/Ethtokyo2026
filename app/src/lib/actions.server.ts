// app/src/lib/actions.server.ts — dashboard kill switches, signed in the viewer's browser wallet.
//
// The server holds no private keys. For each action it reads the chain and returns a plan: the unsigned
// transactions still needed, each with the address that must sign it (the name's on-chain owner, or the fleet's
// vendor / operator as resolved from chain by lib/fleet-resolve.server.ts). The browser sends them through the
// connected wallet. The calls mirror the fork-tested scripts/demo-*.ts. Targets are checked against the fleet's
// doorways and agents, and new labels (hire, add-doorway) must already be ENSIP-15 normalised, never passed through
// as free text. With no fleet the planner acts on the demo fleet, support.vendor.eth, exactly as before.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Abi, type Address, type Hex, decodeFunctionResult, encodeFunctionData, getAddress, labelhash, parseAbi, zeroAddress } from "viem";
import { sanctionsOracleScreen } from "@fns/verifier/screen";
import type { ActionName, ActionPlan, ActionRequest, ActionsInfo, ResolvedFleet, TxStep } from "./fleet-types";
import { FleetFileMissingError, REPO_ROOT, getScanContracts, serverEnv } from "./deployment.server";
import { DEMO_FLEET, MOUNT_LABEL, doorwayName, formatParents, normLabel, parentSalt, parseFleet, parseParentLabels } from "./fleet-ref";
import { FleetNotFoundError, agentsOf, contract, forgetFleet, predictProxy, readText, resolveFleet } from "./fleet-resolve.server";
import { rpcClient } from "./rpc.server";

const ACTIONS: readonly ActionName[] = ["unmount", "fire", "dirty", "clean", "counterfeit", "reset", "hire", "add-doorway"];
const REG_STATUS_REGISTERED = 2;
const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const MEMBER_ROLES = 0n;
const ENTRY_DURATION_SECONDS = 365n * 24n * 60n * 60n;
/** Same OFAC-sanctioned address as scripts/lib/fleet.ts SANCTIONED_DEMO_ADDRESS. */
const SANCTIONED_DEMO_ADDRESS = getAddress("0x098B716B8Aaf21512996dC57EB0615e2383E2f96");
const ZERO_NODE = `0x${"00".repeat(32)}` as Hex;
/** addr() is reached through the resolver's ENSIP-10 resolve(), so it is not in PermissionedResolverImpl's ABI. */
const ADDR_ABI = parseAbi(["function addr(bytes32 node, uint256 coinType) view returns (bytes)"]);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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

export async function actionsInfo(fleetRaw?: string): Promise<ActionsInfo> {
  const off = (reason: string): ActionsInfo => ({
    enabled: false,
    reason,
    parents: [],
    agents: [],
    chain: null,
    canonical: parseFleet(fleetRaw)?.canonical ?? DEMO_FLEET,
    vendor: null,
    demo: false,
  });
  // ENF_KILL_SWITCHES is the name from before the rename to FNS; still honoured.
  if ((serverEnv("FNS_KILL_SWITCHES") ?? serverEnv("ENF_KILL_SWITCHES")) === "off") return off("Turned off by FNS_KILL_SWITCHES=off.");
  const kind = await chainKind();
  if (kind === "unreachable") return off("The chain RPC is unreachable, so kill switches are paused.");
  let fleet: ResolvedFleet;
  try {
    fleet = await resolveFleet(fleetRaw);
  } catch (err) {
    if (err instanceof FleetNotFoundError) return off(err.message);
    if (err instanceof FleetFileMissingError) return off("No fleet file yet. Run scripts/setup-all.ts.");
    throw err;
  }
  const agents = [...(await agentsOf(fleet)).keys()];
  return { enabled: true, parents: fleet.doorways, agents, chain: kind, canonical: fleet.canonical, vendor: fleet.vendor, demo: fleet.demo };
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
  return mountStepsAt(reg, parent, owner, target);
}

/** mountSteps with <parent>.eth's registry and owner already known (the registry may be one this plan just pointed at). */
async function mountStepsAt(reg: Address, parent: string, owner: Address, target: Address): Promise<TxStep[]> {
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

function sharedResolverOf(fleet: ResolvedFleet): Address {
  if (!fleet.sharedResolver) throw new Error("the fleet has no shared resolver yet");
  return fleet.sharedResolver;
}

/** <label> registered in the fleet to `agent` with the shared resolver, signed by the vendor. */
async function memberSteps(fleet: ResolvedFleet, label: string, agent: Address): Promise<TxStep[]> {
  const reg = fleet.fleetRegistry;
  const vendor = fleet.vendor;
  const shared = sharedResolverOf(fleet);
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
async function settlementSteps(fleet: ResolvedFleet, settlement: Address): Promise<TxStep[]> {
  const resolverAddr = sharedResolverOf(fleet);
  const { resolver } = contractAbis();
  const query = encodeFunctionData({ abi: ADDR_ABI, functionName: "addr", args: [ZERO_NODE, 60n] });
  const raw = await read<Hex>(resolverAddr, "resolve", ["0x00", query], resolver);
  const current = decodeFunctionResult({ abi: ADDR_ABI, functionName: "addr", data: raw });
  if (same(current, settlement)) return [];
  return [
    step(`Set the fleet's settlement address to ${settlement}`, fleet.demo ? "operator" : "vendor", fleet.operator, resolverAddr, resolver, "setAddress", ["0x00", 60n, settlement]),
  ];
}

/** The fleet's enf.parents record set to exactly `labels`, signed by the operator. Empty when it already matches. */
async function parentsStep(fleet: ResolvedFleet, labels: string[]): Promise<TxStep[]> {
  const resolverAddr = sharedResolverOf(fleet);
  const current = parseParentLabels(await readText(resolverAddr, "enf.parents"));
  if (current.length === labels.length && current.every((l, i) => l === labels[i])) return [];
  return [
    step(
      "Endorse " + labels.map(doorwayName).join(", "),
      fleet.demo ? "operator" : "vendor",
      fleet.operator,
      resolverAddr,
      contractAbis().resolver,
      "setText",
      ["0x00", "enf.parents", formatParents(labels)],
    ),
  ];
}

/** Mount the fleet under support.<label>.eth, a name the vendor owns: deploy its registry, point the .eth name at it,
 * register support -> fleet, and (endorse) list it in enf.parents. Returns only the first round that is still needed;
 * the runner plans again after it lands. */
async function doorwaySteps(fleet: ResolvedFleet, label: string, endorse: boolean): Promise<TxStep[]> {
  const eth = contract("ETHRegistry");
  const owner = getAddress(await read<Address>(eth.address, "findOwner", [label], eth.abi));
  if (!same(owner, fleet.vendor)) throw new Error(`${label}.eth is owned by ${owner === zeroAddress ? "nobody" : owner}, not the vendor. Register it at /start first.`);
  const init = encodeFunctionData({ abi: contract("UserRegistryImpl").abi, functionName: "initialize", args: [[{ account: fleet.vendor, roleBitmap: ALL_ROLES }]] });
  const reg = await predictProxy(fleet.vendor, "UserRegistryImpl", parentSalt(label), init);
  if (!reg.deployed)
    return [
      step(`Deploy the registry for ${label}.eth`, "vendor", fleet.vendor, contract("VerifiableFactory").address, contract("VerifiableFactory").abi, "deployProxy", [
        contract("UserRegistryImpl").address,
        parentSalt(label),
        init,
      ]),
    ];
  const steps: TxStep[] = [];
  const current = await read<Address>(eth.address, "getSubregistry", [label], eth.abi);
  if (!same(current, reg.address)) steps.push(step(`Point ${label}.eth at its registry`, "vendor", fleet.vendor, eth.address, eth.abi, "setSubregistry", [labelId(label), reg.address]));
  const resolver = await read<Address>(eth.address, "getResolver", [label], eth.abi);
  if (resolver !== zeroAddress) steps.push(step(`Clear ${label}.eth resolver`, "vendor", fleet.vendor, eth.address, eth.abi, "setResolver", [labelId(label), zeroAddress]));
  steps.push(...(await mountStepsAt(reg.address, label, fleet.vendor, fleet.fleetRegistry)));
  if (endorse && !fleet.doorways.includes(label)) steps.push(...(await parentsStep(fleet, [...fleet.doorways, label])));
  return steps;
}

async function buildSteps(req: ActionRequest, fleet: ResolvedFleet): Promise<TxStep[]> {
  switch (req.action) {
    case "unmount":
      return mountSteps(req.target!, zeroAddress);
    case "counterfeit":
      return fleet.demo ? mountSteps("scam", fleet.fleetRegistry) : doorwaySteps(fleet, req.target!, false);
    case "add-doorway":
      return doorwaySteps(fleet, req.target!, true);
    case "hire":
      return memberSteps(fleet, req.target!, getAddress(req.address!));
    case "fire": {
      const status = await read<number>(fleet.fleetRegistry, "getStatus", [labelId(req.target!)]);
      if (status !== REG_STATUS_REGISTERED) return [];
      return [step(`Fire ${req.target}`, "vendor", fleet.vendor, fleet.fleetRegistry, contractAbis().registry, "unregister", [labelId(req.target!)])];
    }
    case "dirty": {
      const check = await sanctionsOracleScreen({ rpcUrl: serverEnv("SANCTIONS_RPC_URL") })(SANCTIONED_DEMO_ADDRESS);
      if (check.status !== "flagged") throw new Error(`${SANCTIONED_DEMO_ADDRESS} is not confirmed sanctioned (${check.status}); refusing to run the demo.`);
      return settlementSteps(fleet, SANCTIONED_DEMO_ADDRESS);
    }
    case "clean":
      return settlementSteps(fleet, fleet.cleanSettlement);
    case "reset": {
      const steps: TxStep[] = [];
      for (const parent of fleet.doorways) steps.push(...(await mountSteps(parent, fleet.fleetRegistry)));
      for (const [label, agent] of await agentsOf(fleet)) steps.push(...(await memberSteps(fleet, label, agent)));
      steps.push(...(await settlementSteps(fleet, fleet.cleanSettlement)));
      return steps;
    }
  }
}

/** Pre-flights each step from its signer; the first revert as "<what> would revert: …", or null when all pass.
 * Steps marked `simulate: false` depend on an earlier step of the same plan and are skipped. */
export async function simulateSteps(steps: TxStep[]): Promise<string | null> {
  for (const s of steps) {
    if (s.simulate === false) continue;
    try {
      await rpcClient().call({ account: s.from, to: s.to, data: s.data });
    } catch (err) {
      return `${s.what} would revert: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message.split("\n")[0]}`;
    }
  }
  return null;
}

/** Checks that need no chain read: new labels must already be normalised, the agent address well formed. */
function checkInput(req: ActionRequest): string | null {
  const t = req.target ?? "";
  const selfServe = parseFleet(req.fleet)?.canonical !== DEMO_FLEET;
  const newLabel = req.action === "hire" || req.action === "add-doorway" || (req.action === "counterfeit" && selfServe);
  if (newLabel && (!t || normLabel(t) !== t)) return `"${t}" is not a normalised label (lowercase letters, digits and hyphens).`;
  if (req.action === "hire" && !ADDRESS_RE.test(req.address ?? "")) return `"${req.address ?? ""}" is not an address.`;
  return null;
}

/** The unsigned transactions `req.action` still needs, each simulated from its signer so a revert shows up here, not in the wallet. */
export async function planAction(req: ActionRequest): Promise<ActionPlan> {
  const bad = checkInput(req);
  if (bad) return { ok: false, error: bad };
  const info = await actionsInfo(req.fleet);
  if (!info.enabled) return { ok: false, error: info.reason ?? "disabled" };
  try {
    let fleet: ResolvedFleet;
    try {
      fleet = await resolveFleet(req.fleet);
    } catch (err) {
      if (err instanceof FleetNotFoundError) return { ok: false, error: err.message };
      throw err;
    }
    const { action, target } = req;
    if (action === "unmount" || action === "fire") {
      const allowed = action === "unmount" ? fleet.doorways : info.agents;
      if (!target || !allowed.includes(target)) return { ok: false, error: `unknown target "${target ?? ""}" (expected ${allowed.join(", ")})` };
    }
    if (action === "add-doorway" && target === fleet.vendorLabel) return { ok: false, error: `${doorwayName(target)} is already the canonical doorway.` };
    const steps = await buildSteps(req, fleet);
    // Each step is planned from the same state, so each can be checked alone (except those marked simulate: false).
    const err = await simulateSteps(steps);
    if (steps.length) forgetFleet(fleet.canonical);
    return err ? { ok: false, error: err } : { ok: true, steps };
  } catch (err) {
    return { ok: false, error: (err as Error).message.split("\n")[0] ?? "planning failed" };
  }
}
