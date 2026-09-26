// app/src/lib/fleet-resolve.server.ts — everything about a fleet, read from chain. Server only.
//
// The chain is the database: given support.<vendor>.eth we find the vendor (the .eth owner), its registry, the fleet
// registry mounted at `support`, the shared resolver (the vendor's ProxyDeployed log with the resolver salt) and the
// endorsed doorways (enf.parents). The demo fleet keeps using deployments/fleet.11155111.json as its hints because it
// was deployed with the older fixed salts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Abi, type Address, type Hex, decodeFunctionResult, encodeFunctionData, getAddress, parseAbi, parseAbiItem, zeroAddress } from "viem";
import { DEMO_FLEET, MOUNT_LABEL, fleetSalt, parseFleet, parseParentLabels } from "./fleet-ref";
import type { ResolvedFleet } from "./fleet-types";
import { REPO_ROOT, readFleetFile, serverEnv } from "./deployment.server";
import { rpcClient } from "./rpc.server";

export class FleetNotFoundError extends Error {}

type ContractName = "ETHRegistry" | "ETHRegistrar" | "MockUSDC" | "VerifiableFactory" | "UserRegistryImpl" | "PermissionedResolverImpl";
const contracts = new Map<ContractName, { address: Address; abi: Abi }>();

export function contract(name: ContractName): { address: Address; abi: Abi } {
  let c = contracts.get(name);
  if (!c) {
    const sepolia = JSON.parse(readFileSync(resolve(REPO_ROOT, "deployments", "sepolia.json"), "utf8")) as { contracts: Record<string, { address: Address }> };
    const entry = sepolia.contracts[name];
    if (!entry) throw new Error(`deployments/sepolia.json has no ${name}`);
    c = { address: getAddress(entry.address), abi: JSON.parse(readFileSync(resolve(REPO_ROOT, "deployments", "abis", `${name}.json`), "utf8")) as Abi };
    contracts.set(name, c);
  }
  return c;
}

async function read<T>(c: { address: Address; abi: Abi }, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return (await rpcClient().readContract({ ...c, functionName, args } as never)) as T;
}
const registryAt = (address: Address) => ({ address, abi: contract("UserRegistryImpl").abi });

const PROXY_DEPLOYED = parseAbiItem("event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)");
/** How far back to look for a wallet's proxy deploys (about 70 days of Sepolia blocks). */
const LOOKBACK = 500_000n;

const proxyCache = new Map<string, { at: number; logs: { proxy: Address; salt: bigint; impl: Address; block: bigint }[] }>();

async function proxiesOf(sender: Address) {
  const key = sender.toLowerCase();
  const hit = proxyCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.logs;
  const client = rpcClient();
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: contract("VerifiableFactory").address,
    event: PROXY_DEPLOYED,
    args: { sender },
    fromBlock: latest > LOOKBACK ? latest - LOOKBACK : 0n,
    toBlock: latest,
  });
  const out = logs.map((l) => ({ proxy: getAddress(l.args.proxyAddress!), salt: l.args.salt!, impl: getAddress(l.args.implementation!), block: l.blockNumber! }));
  proxyCache.set(key, { at: Date.now(), logs: out });
  return out;
}

/** The proxy `sender` deployed with `salt`, from the factory's ProxyDeployed log. */
export async function findProxy(sender: Address, salt: bigint): Promise<{ address: Address; block: bigint } | null> {
  const hit = (await proxiesOf(sender)).find((p) => p.salt === salt);
  return hit ? { address: hit.proxy, block: hit.block } : null;
}

/** Where deployProxy(impl, salt, initData) from `sender` lands: simulated when not deployed yet, else found in the logs. */
export async function predictProxy(sender: Address, impl: "UserRegistryImpl" | "PermissionedResolverImpl", salt: bigint, initData: Hex): Promise<{ address: Address; deployed: boolean }> {
  try {
    const sim = await rpcClient().simulateContract({
      ...contract("VerifiableFactory"),
      functionName: "deployProxy",
      args: [contract(impl).address, salt, initData],
      account: sender,
    } as never);
    return { address: getAddress(sim.result as Address), deployed: false };
  } catch {
    proxyCache.delete(sender.toLowerCase());
    const found = await findProxy(sender, salt);
    if (!found) throw new Error(`could not predict or find the ${impl} proxy for ${sender}`);
    return { address: found.address, deployed: true };
  }
}

const TEXT_ABI = parseAbi(["function text(bytes32 node, string key) view returns (string)"]);
const ZERO_NODE = `0x${"00".repeat(32)}` as Hex;

/** A text record of the shared resolver's default record (DNS name 0x00); null when unset or unreadable. */
export async function readText(resolver: Address, key: string): Promise<string | null> {
  try {
    const query = encodeFunctionData({ abi: TEXT_ABI, functionName: "text", args: [ZERO_NODE, key] });
    const raw = await read<Hex>({ address: resolver, abi: contract("PermissionedResolverImpl").abi }, "resolve", ["0x00", query]);
    const v = decodeFunctionResult({ abi: TEXT_ABI, functionName: "text", data: raw });
    return v || null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; value: ResolvedFleet }>();

function demoFleet(): ResolvedFleet {
  const f = readFleetFile();
  if (!f.vendor || !f.operator) throw new FleetNotFoundError("the demo fleet file has no vendor/operator. Run scripts/setup-all.ts.");
  // The fleet file records the address this fleet was set up with; a stale .env.local (e.g. fork keys) must not
  // make clean/reset point the live fleet somewhere else.
  const clean = f.settlementAddress || serverEnv("SETTLEMENT_ADDRESS");
  if (!clean) throw new FleetNotFoundError("no clean settlement address for the demo fleet.");
  return {
    canonical: DEMO_FLEET,
    vendorLabel: "vendor",
    demo: true,
    vendor: getAddress(f.vendor),
    operator: getAddress(f.operator),
    vendorRegistry: getAddress(f.parentRegistries.vendor!),
    fleetRegistry: getAddress(f.fleetRegistry),
    sharedResolver: f.sharedResolver ? getAddress(f.sharedResolver) : null,
    deployBlock: typeof f.deployBlock === "number" ? BigInt(f.deployBlock) : null,
    doorways: Object.keys(f.parentRegistries ?? {}),
    cleanSettlement: getAddress(clean),
  };
}

/** The fleet named by `raw` (any spelling parseFleet accepts). Throws FleetNotFoundError with a readable reason. */
export async function resolveFleet(raw: string | null | undefined): Promise<ResolvedFleet> {
  const ref = parseFleet(raw);
  if (!ref) throw new FleetNotFoundError(`"${raw}" is not a fleet name. Use support.<name>.eth.`);
  if (ref.canonical === DEMO_FLEET) return demoFleet();
  const hit = cache.get(ref.canonical);
  if (hit && Date.now() - hit.at < 10_000) return hit.value;

  const eth = contract("ETHRegistry");
  const vendor = getAddress(await read<Address>(eth, "findOwner", [ref.vendorLabel]));
  if (vendor === zeroAddress) throw new FleetNotFoundError(`${ref.vendorLabel}.eth is not registered.`);
  const vendorRegistry = getAddress(await read<Address>(eth, "getSubregistry", [ref.vendorLabel]));
  if (vendorRegistry === zeroAddress) throw new FleetNotFoundError(`${ref.vendorLabel}.eth has no registry yet. Finish setting it up at /start.`);
  const fleetLog = await findProxy(vendor, fleetSalt("fleet", ref.canonical));
  let fleetRegistry = getAddress(await read<Address>(registryAt(vendorRegistry), "getSubregistry", [MOUNT_LABEL]));
  if (fleetRegistry === zeroAddress) {
    if (!fleetLog) throw new FleetNotFoundError(`${ref.canonical} has no fleet mounted.`);
    fleetRegistry = fleetLog.address;
  }
  const resolverLog = await findProxy(vendor, fleetSalt("resolver", ref.canonical));
  const sharedResolver = resolverLog?.address ?? null;
  const doorways = sharedResolver ? parseParentLabels(await readText(sharedResolver, "enf.parents")) : [];
  const value: ResolvedFleet = {
    canonical: ref.canonical,
    vendorLabel: ref.vendorLabel,
    demo: false,
    vendor,
    operator: vendor,
    vendorRegistry,
    fleetRegistry,
    sharedResolver,
    deployBlock: fleetLog?.block ?? null,
    doorways: doorways.length ? doorways : [ref.vendorLabel],
    cleanSettlement: vendor,
  };
  cache.set(ref.canonical, { at: Date.now(), value });
  return value;
}

/** Drops cached reads for a fleet after the planner knows the chain changed. */
export function forgetFleet(canonical: string) {
  cache.delete(canonical);
}

const LABEL_REGISTERED = parseAbiItem(
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
);

/** Every agent label ever registered in the fleet, with the owner of its latest registration. */
export async function agentsOf(fleet: ResolvedFleet): Promise<Map<string, Address>> {
  if (fleet.demo) {
    const f = readFleetFile();
    return new Map(Object.entries(f.members ?? {}).map(([k, v]) => [k, getAddress(v)]));
  }
  const client = rpcClient();
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: fleet.fleetRegistry,
    event: LABEL_REGISTERED,
    fromBlock: fleet.deployBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n),
    toBlock: latest,
  });
  const out = new Map<string, Address>();
  for (const l of logs) if (l.args.label && l.args.owner) out.set(l.args.label, getAddress(l.args.owner));
  return out;
}

/** Canonical names of the fleets `owner` deployed: its UserRegistry proxies whose back-pointers read (vendorReg, "support") -> (ETHRegistry, label). */
export async function fleetsOwnedBy(owner: Address): Promise<string[]> {
  const eth = contract("ETHRegistry").address;
  const impl = contract("UserRegistryImpl").address;
  const out: string[] = [];
  for (const p of (await proxiesOf(owner)).filter((x) => x.impl === impl)) {
    try {
      const [parent, label] = await read<[Address, string]>(registryAt(p.proxy), "getParent");
      if (label !== MOUNT_LABEL || parent === zeroAddress) continue;
      const [grand, vendorLabel] = await read<[Address, string]>(registryAt(parent), "getParent");
      if (grand.toLowerCase() !== eth.toLowerCase()) continue;
      const canonical = `${MOUNT_LABEL}.${vendorLabel}.eth`;
      if (p.salt === fleetSalt("fleet", canonical)) out.push(canonical);
    } catch {
      // Not a fleet registry (or not wired yet): skip it.
    }
  }
  return [...new Set(out)];
}
