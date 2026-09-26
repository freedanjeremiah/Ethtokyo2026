// app/src/lib/onboard.server.ts — plans a new vendor's fleet, signed entirely by the vendor's wallet. Server only.
//
// Phases, each one batch in the wallet; the browser asks again after each lands and gets the earliest phase still needed:
//   commit  deploy every proxy (a registry per name, the fleet registry, the shared resolver with its default record
//           seeded in initialize) and commit every name that still needs registering
//   wait    the registrar's MIN_COMMITMENT_AGE has not passed for some commitment
//   build   mint + approve MockUSDC, register the names (subregistry = their registry, so they arrive mounted), point
//           already-owned names at their registry, register `support` -> fleet in each registry, the canonical
//           back-pointers, and every agent
//   done    nothing left
// Every read is idempotent, so a reload, a rejected batch or a closed tab resumes from chain state.

import { type Address, type Hex, encodeFunctionData, getAddress, labelhash, zeroAddress, zeroHash } from "viem";
import { MOUNT_LABEL, classifyName, doorwayName, fleetSalt, formatParents, normLabel, parentSalt } from "./fleet-ref";
import type { NameStatus, OnboardPlan, OnboardRequest, TxStep } from "./fleet-types";
import { contract, predictProxy, readText } from "./fleet-resolve.server";
import { simulateSteps } from "./actions.server";
import { rpcClient } from "./rpc.server";

const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const MEMBER_ROLES = 0n;
const YEAR = 365n * 24n * 60n * 60n;
const labelId = (label: string) => BigInt(labelhash(label));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function read<T>(c: { address: Address; abi: readonly unknown[] }, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return (await rpcClient().readContract({ ...c, functionName, args } as never)) as T;
}

function tx(what: string, from: Address, c: { address: Address; abi: readonly unknown[] }, functionName: string, args: readonly unknown[], simulate = true): TxStep {
  const s: TxStep = { what, signer: "you", from: getAddress(from), to: getAddress(c.address), data: encodeFunctionData({ abi: c.abi, functionName, args } as never) };
  if (!simulate) s.simulate = false;
  return s;
}

export async function nameStatuses(owner: Address, labels: string[]): Promise<NameStatus[]> {
  const eth = contract("ETHRegistry");
  return Promise.all(
    labels.map(async (raw) => {
      const label = normLabel(raw);
      if (!label || label !== raw) return { label: raw, status: "invalid" as const };
      const current = await read<Address>(eth, "findOwner", [label]);
      return { label, status: classifyName(owner, current) };
    }),
  );
}

export async function planOnboard(req: OnboardRequest): Promise<OnboardPlan> {
  const owner = getAddress(req.owner);
  const labels = [req.vendor, ...req.doorways];
  if (new Set(labels).size !== labels.length) return { ok: false, error: "Each name can be used once." };
  const agentLabels = req.agents.map((a) => a.label);
  if (agentLabels.some((l) => normLabel(l) !== l) || new Set(agentLabels).size !== agentLabels.length) return { ok: false, error: "Agent names must be unique lowercase labels." };
  const names = await nameStatuses(owner, labels);
  const bad = names.find((n) => n.status === "taken" || n.status === "invalid");
  if (bad) return { ok: false, error: bad.status === "taken" ? `${bad.label}.eth is taken. Pick another name.` : `"${bad.label}" is not a valid name.`, names };

  const canonical = doorwayName(req.vendor);
  const registrar = contract("ETHRegistrar");
  const eth = contract("ETHRegistry");
  const usdc = contract("MockUSDC");
  const factory = contract("VerifiableFactory");
  const regAbi = contract("UserRegistryImpl").abi;
  const resolverAbi = contract("PermissionedResolverImpl").abi;
  const client = rpcClient();
  const now = (await client.getBlock()).timestamp;

  // ---- proxies (addresses are CREATE2-predictable, so later phases can point at them before they exist)
  const regInit = encodeFunctionData({ abi: regAbi, functionName: "initialize", args: [[{ account: owner, roleBitmap: ALL_ROLES }]] });
  // The fleet's text records: seeded in initialize, and re-set in the build phase if the doorways changed since.
  const texts: [key: string, value: string][] = [
    ["enf.canonical", canonical],
    ["enf.parents", formatParents(labels)],
    ["agent-context", `FNS fleet ${canonical}: agents answer under ${labels.map(doorwayName).join(", ")}.`],
  ];
  const seed = [
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: ["0x00", 60n, owner] }),
    ...texts.map(([key, value]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x00", key, value] })),
  ] as Hex[];
  const resolverInit = encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [[{ account: owner, roleBitmap: ALL_ROLES }], seed] });
  const deploys: TxStep[] = [];
  const parentRegs = new Map<string, Address>();
  for (const label of labels) {
    const p = await predictProxy(owner, "UserRegistryImpl", parentSalt(label), regInit);
    parentRegs.set(label, p.address);
    if (!p.deployed) deploys.push(tx(`Deploy the registry for ${label}.eth`, owner, factory, "deployProxy", [contract("UserRegistryImpl").address, parentSalt(label), regInit]));
  }
  const fleet = await predictProxy(owner, "UserRegistryImpl", fleetSalt("fleet", canonical), regInit);
  if (!fleet.deployed) deploys.push(tx("Deploy the fleet registry", owner, factory, "deployProxy", [contract("UserRegistryImpl").address, fleetSalt("fleet", canonical), regInit]));
  const shared = await predictProxy(owner, "PermissionedResolverImpl", fleetSalt("resolver", canonical), resolverInit);
  if (!shared.deployed) deploys.push(tx("Deploy the shared resolver with the fleet's records", owner, factory, "deployProxy", [contract("PermissionedResolverImpl").address, fleetSalt("resolver", canonical), resolverInit]));

  // ---- commitments
  const minAge = await read<bigint>(registrar, "MIN_COMMITMENT_AGE");
  const maxAge = await read<bigint>(registrar, "MAX_COMMITMENT_AGE");
  const toRegister = names.filter((n) => n.status === "available").map((n) => n.label);
  const commits: TxStep[] = [];
  let waitUntil = 0n;
  const commitments = new Map<string, Hex>();
  for (const label of toRegister) {
    const secret = req.secrets[label];
    if (!secret || !/^0x[0-9a-fA-F]{64}$/.test(secret)) return { ok: false, error: `Missing the commit secret for ${label}. Reload the page and start again.` };
    const c = await read<Hex>(registrar, "makeCommitment", [label, owner, secret, parentRegs.get(label)!, zeroAddress, YEAR, zeroHash]);
    commitments.set(label, c);
    const at = await read<bigint>(registrar, "commitmentAt", [c]);
    if (at === 0n || now - at > maxAge) commits.push(tx(`Commit to ${label}.eth`, owner, registrar, "commit", [c]));
    else if (at + minAge + 1n > waitUntil) waitUntil = at + minAge + 1n;
  }
  if (deploys.length || commits.length) return finish({ phase: "commit", steps: [...deploys, ...commits] });
  if (waitUntil > now) return { ok: true, phase: "wait", steps: [], canonical, names, waitSeconds: Number(waitUntil - now) };

  // ---- build
  const steps: TxStep[] = [];
  if (toRegister.length) {
    let total = 0n;
    for (const label of toRegister) {
      const [base, premium] = await read<[bigint, bigint]>(registrar, "getRegisterPrice", [label, YEAR, usdc.address]);
      total += base + premium;
    }
    steps.push(tx("Mint test USDC for the registration fee", owner, usdc, "mint", [owner, total]));
    steps.push(tx("Approve the registrar to take the fee", owner, usdc, "approve", [registrar.address, total]));
    for (const label of toRegister)
      steps.push(tx(`Register ${label}.eth`, owner, registrar, "register", [label, owner, req.secrets[label]!, parentRegs.get(label)!, zeroAddress, YEAR, usdc.address, zeroHash], false));
  }
  for (const n of names.filter((x) => x.status === "yours")) {
    const reg = parentRegs.get(n.label)!;
    if (!same(await read<Address>(eth, "getSubregistry", [n.label]), reg)) steps.push(tx(`Point ${n.label}.eth at its registry`, owner, eth, "setSubregistry", [labelId(n.label), reg]));
    if ((await read<Address>(eth, "getResolver", [n.label])) !== zeroAddress) steps.push(tx(`Clear ${n.label}.eth resolver`, owner, eth, "setResolver", [labelId(n.label), zeroAddress]));
  }
  for (const label of labels) {
    const reg = { address: parentRegs.get(label)!, abi: regAbi };
    const state = await read<{ status: number }>(reg, "getState", [labelId(MOUNT_LABEL)]);
    if (state.status !== 2) steps.push(tx(`Mount the fleet at ${doorwayName(label)}`, owner, reg, "register", [MOUNT_LABEL, owner, fleet.address, zeroAddress, ALL_ROLES, now + YEAR]));
    else if (!same(await read<Address>(reg, "getSubregistry", [MOUNT_LABEL]), fleet.address)) steps.push(tx(`Mount the fleet at ${doorwayName(label)}`, owner, reg, "setSubregistry", [labelId(MOUNT_LABEL), fleet.address]));
  }
  const vendorReg = { address: parentRegs.get(req.vendor)!, abi: regAbi };
  const fleetReg = { address: fleet.address, abi: regAbi };
  const [p1, l1] = await read<[Address, string]>(vendorReg, "getParent");
  if (!same(p1, eth.address) || l1 !== req.vendor) steps.push(tx(`Link ${req.vendor}.eth's registry to its name`, owner, vendorReg, "setParent", [eth.address, req.vendor]));
  const [p2, l2] = await read<[Address, string]>(fleetReg, "getParent");
  if (!same(p2, vendorReg.address) || l2 !== MOUNT_LABEL) steps.push(tx(`Link the fleet to ${canonical}`, owner, fleetReg, "setParent", [vendorReg.address, MOUNT_LABEL]));
  const resolverC = { address: shared.address, abi: resolverAbi };
  for (const [key, value] of texts)
    if ((await readText(shared.address, key)) !== value) steps.push(tx(`Set the fleet's ${key} record`, owner, resolverC, "setText", ["0x00", key, value]));
  for (const a of req.agents) {
    const st = await read<{ status: number; latestOwner: Address }>(fleetReg, "getState", [labelId(a.label)]);
    if (st.status === 2) {
      if (!same(st.latestOwner, a.address)) return { ok: false, error: `${a.label} is already an agent with another address. Pick another agent name.`, names };
      continue;
    }
    steps.push(tx(`Hire ${a.label}`, owner, fleetReg, "register", [a.label, getAddress(a.address), zeroAddress, shared.address, MEMBER_ROLES, now + YEAR]));
  }
  if (steps.length) return finish({ phase: "build", steps });
  return { ok: true, phase: "done", steps: [], canonical, names };

  async function finish(p: { phase: "commit" | "build"; steps: TxStep[] }): Promise<OnboardPlan> {
    const err = await simulateSteps(p.steps);
    if (err) return { ok: false, error: err, names };
    return { ok: true, phase: p.phase, steps: p.steps, canonical, names };
  }
}
