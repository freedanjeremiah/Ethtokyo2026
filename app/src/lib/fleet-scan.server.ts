// app/src/lib/fleet-scan.server.ts — builds the dashboard's view of one fleet, entirely from chain reads.
//
//   doorways  every SubregistryUpdated(subregistry = FLEET) log, from any contract => every place the fleet
//             was ever mounted (including mounts the fleet never consented to). Each mount's name is recovered
//             by walking SubregistryUpdated(subregistry = R) logs upward + LabelStore.getLabel(tokenId) —
//             never from a self-declared canonical name (a counterfeit could setParent() to claim vendor's).
//   agents    every LabelRegistered log on FLEET; active = REGISTERED and not expired.
//   cells     verify(agent.doorway) for every pair, all pinned to ONE block.
//   events    hires/fires on FLEET, mount/unmount on each doorway registry, default-record writes on the
//             shared resolver.
//
// The only configured input is the fleet registry address (the subject of the dashboard); everything else
// is discovered.

import {
  type Abi,
  type Address,
  type Client,
  type Hex,
  encodeFunctionData,
  decodeFunctionResult,
  getAddress,
  labelhash,
  parseAbiItem,
  zeroAddress,
  zeroHash,
} from "viem";
import { getBlock, getLogs, readContract } from "viem/actions";
import { type Screen, type VerifierDeployment, parseParents, safeNormalize, verify } from "@fns/verifier";
import type { FleetAgent, FleetCell, FleetDoorway, FleetEvent, FleetScan } from "./fleet-types";

const SUBREGISTRY_UPDATED = parseAbiItem(
  "event SubregistryUpdated(uint256 indexed tokenId, address indexed subregistry, address indexed sender)",
);
const LABEL_REGISTERED = parseAbiItem(
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
);
const LABEL_UNREGISTERED = parseAbiItem("event LabelUnregistered(uint256 indexed tokenId, address indexed sender)");
const ADDRESS_UPDATED = parseAbiItem("event AddressUpdated(uint256 indexed recordId, uint256 coinType, bytes addressBytes)");
const TEXT_UPDATED = parseAbiItem("event TextUpdated(uint256 indexed recordId, string indexed keyHash, string key, string value)");

const RECORD_ABI = [
  parseAbiItem("function addr(bytes32 node) view returns (address)"),
  parseAbiItem("function text(bytes32 node, string key) view returns (string)"),
] as const;
const RESOLVE_ABI = [parseAbiItem("function resolve(bytes name, bytes data) view returns (bytes)")] as const;

const REGISTERED = 2;
/** tokenId / resource / labelhash share the upper 224 bits; the low 32 bits are a version. */
const VERSION_MASK = ~0xffffffffn;
const MAX_EVENTS = 24;

export type ScanInput = {
  client: Client;
  deployment: VerifierDeployment;
  fleetRegistry: Address;
  /** Fallback when no active agent exposes the shared resolver. */
  sharedResolverHint?: Address;
  /** Fleet deploy block from the fleet file; used on live chains instead of searching (public RPCs lack archive state). */
  deployBlockHint?: bigint;
  ethRegistry: Address;
  labelStore: { address: Address; abi: Abi };
  resolverAbi: Abi;
  screen?: Screen;
};

type Ctx = ScanInput & { epoch: Epoch; block: bigint; now: bigint; fromBlock: bigint; labels: Map<string, Promise<string | null>> };

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function readAt<T>(ctx: Ctx, address: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<T> {
  return (await readContract(ctx.client, { address, abi, functionName, args, blockNumber: ctx.block } as never)) as T;
}

/** LabelStore.getLabel(tokenId) (cached); null if the store does not know it. */
function labelOf(ctx: Ctx, tokenId: bigint): Promise<string | null> {
  const key = (tokenId & VERSION_MASK).toString();
  let p = ctx.labels.get(key);
  if (!p) {
    p = readAt<string>(ctx, ctx.labelStore.address, ctx.labelStore.abi, "getLabel", [tokenId]).then(
      (l) => (l ? l : null),
      () => null,
    );
    ctx.labels.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- scan window

/**
 * Which chain we are reading: "anvil:<fork block>" on a local fork, "live" otherwise. Every cache below is keyed
 * by it, because a restarted fork reuses the same fleet addresses and block numbers but not the same history.
 * Re-checked every few seconds so a fork restart is noticed without restarting the server.
 */
type Epoch = { key: string; forkBlock: bigint | null };
let epochCache: { at: number; epoch: Epoch } | null = null;
const EPOCH_TTL_MS = 3000;

async function chainEpoch(client: Client): Promise<Epoch> {
  if (epochCache && Date.now() - epochCache.at < EPOCH_TTL_MS) return epochCache.epoch;
  let epoch: Epoch = { key: "live", forkBlock: null };
  try {
    const info = (await client.request({ method: "anvil_nodeInfo" } as never)) as { forkConfig?: { forkBlockNumber?: number } };
    const fb = info?.forkConfig?.forkBlockNumber;
    if (typeof fb === "number") epoch = { key: `anvil:${fb}`, forkBlock: BigInt(fb) };
  } catch {
    // not anvil
  }
  epochCache = { at: Date.now(), epoch };
  return epoch;
}

const fromBlockCache = new Map<string, bigint>();

/**
 * First block worth scanning. On an anvil fork of a fleet deployed after the fork point: the block after it.
 * On a live chain, or a fork of a fleet that already existed upstream: the block the fleet registry got code, by
 * binary search (needs an archive-capable RPC; falls back to the last ~50k blocks).
 */
async function scanStart(client: Client, epoch: Epoch, fleet: Address, latest: bigint, hint?: bigint): Promise<bigint> {
  // On a fork, a fleet deployed after the fork point starts there (a recorded deploy block may belong to an older
  // fork). One that already existed upstream is scanned like the live chain; anvil serves its older logs.
  const cacheKey = `${epoch.key}:${fleet.toLowerCase()}`;
  const cached = fromBlockCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (epoch.forkBlock !== null) {
    const code = await client.request({ method: "eth_getCode", params: [fleet, `0x${epoch.forkBlock.toString(16)}`] } as never).catch(() => "0x");
    if (typeof code !== "string" || code === "0x") {
      fromBlockCache.set(cacheKey, epoch.forkBlock + 1n);
      return epoch.forkBlock + 1n;
    }
    if (hint !== undefined && hint <= epoch.forkBlock) return hint;
  } else if (hint !== undefined && hint <= latest) return hint;
  let start: bigint;
  try {
    let lo = latest > 3_000_000n ? latest - 3_000_000n : 0n;
    let hi = latest;
    const hasCode = async (b: bigint) => {
      const code = await client.request({ method: "eth_getCode", params: [fleet, `0x${b.toString(16)}`] } as never);
      return typeof code === "string" && code !== "0x";
    };
    if (!(await hasCode(hi))) throw new Error("fleet has no code");
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (await hasCode(mid)) hi = mid;
      else lo = mid + 1n;
    }
    start = lo;
  } catch {
    start = latest > 50_000n ? latest - 50_000n : 0n;
  }
  fromBlockCache.set(cacheKey, start);
  return start;
}

// ---------------------------------------------------------------- names from logs

const nameCache = new Map<string, string | null>();

/**
 * Recovers a registry's name from who actually points at it (SubregistryUpdated logs), recursively up to the
 * RootRegistry / ETHRegistry. Never trusts getParent()/findCanonicalName, which the registry itself controls.
 */
async function registryName(ctx: Ctx, registry: Address, depth = 0): Promise<string | null> {
  if (same(registry, ctx.deployment.rootRegistry.address)) return "";
  if (same(registry, ctx.ethRegistry)) return "eth";
  if (depth > 6) return null;
  const key = `${ctx.epoch.key}:${ctx.block}:${registry.toLowerCase()}`;
  if (nameCache.has(key)) return nameCache.get(key)!;
  const logs = await getLogs(ctx.client, {
    event: SUBREGISTRY_UPDATED,
    args: { subregistry: registry },
    fromBlock: ctx.fromBlock,
    toBlock: ctx.block,
  });
  let name: string | null = null;
  // Newest pointer that is still live wins.
  for (const log of [...logs].reverse()) {
    const label = await labelOf(ctx, log.args.tokenId!);
    if (!label) continue;
    const current = await readAt<Address>(ctx, log.address, ctx.deployment.registryAbi, "getSubregistry", [label]).catch(() => null);
    if (!same(current, registry)) continue;
    const parent = await registryName(ctx, getAddress(log.address), depth + 1);
    if (parent === null) continue;
    // Labels come raw from chain; normalize before any comparison (ENSIP-15).
    name = normalizedOr(parent ? `${label}.${parent}` : label);
    break;
  }
  nameCache.set(key, name);
  if (nameCache.size > 500) nameCache.delete(nameCache.keys().next().value!);
  return name;
}

// ---------------------------------------------------------------- default record

function normalizedOr(name: string): string {
  const n = safeNormalize(name);
  return n.ok ? n.name : name;
}

async function readDefaultRecord(ctx: Ctx, resolver: Address) {
  const call = async <T,>(functionName: "addr" | "text", args: readonly unknown[]): Promise<T | null> => {
    try {
      const data = encodeFunctionData({ abi: RECORD_ABI, functionName, args } as never);
      const raw = await readAt<Hex>(ctx, resolver, RESOLVE_ABI as unknown as Abi, "resolve", ["0x00", data]);
      return decodeFunctionResult({ abi: RECORD_ABI, functionName, data: raw } as never) as T;
    } catch {
      return null;
    }
  };
  const [address, canonical, parents] = await Promise.all([
    call<Address>("addr", [zeroHash]),
    call<string>("text", [zeroHash, "enf.canonical"]),
    call<string>("text", [zeroHash, "enf.parents"]),
  ]);
  return {
    address: address && address !== zeroAddress ? getAddress(address) : null,
    canonical: canonical ? normalizedOr(canonical) : null,
    parents: parents ? parseParents(parents).parents : [],
  };
}

// ---------------------------------------------------------------- scan

async function scan(input: ScanInput, epoch: Epoch, block: bigint): Promise<FleetScan> {
  const header = await getBlock(input.client, { blockNumber: block });
  const fromBlock = await scanStart(input.client, epoch, input.fleetRegistry, block, input.deployBlockHint);
  const ctx: Ctx = { ...input, epoch, block, now: header.timestamp, fromBlock, labels: new Map() };
  const fleet = input.fleetRegistry;
  const range = { fromBlock, toBlock: block };

  const [mountLogs, hireLogs, fireLogs] = await Promise.all([
    getLogs(ctx.client, { event: SUBREGISTRY_UPDATED, args: { subregistry: fleet }, ...range }),
    getLogs(ctx.client, { address: fleet, event: LABEL_REGISTERED, ...range }),
    getLogs(ctx.client, { address: fleet, event: LABEL_UNREGISTERED, ...range }),
  ]);

  // ---- agents
  const agentLabels = [...new Set(hireLogs.map((l) => l.args.label!).filter(Boolean))];
  for (const l of hireLogs) void ctx.labels.set(((l.args.tokenId ?? 0n) & VERSION_MASK).toString(), Promise.resolve(l.args.label ?? null));
  const agents: FleetAgent[] = await Promise.all(
    agentLabels.map(async (label) => {
      const st = await readAt<{ status: number; expiry: bigint }>(ctx, fleet, ctx.deployment.registryAbi, "getState", [BigInt(labelhash(label))]).catch(
        () => null,
      );
      return { label, active: !!st && st.status === REGISTERED && st.expiry > ctx.now };
    }),
  );

  // ---- shared resolver + default record
  let sharedResolver: Address | null = null;
  for (const a of agents.filter((x) => x.active)) {
    const r = await readAt<Address>(ctx, fleet, ctx.deployment.registryAbi, "getResolver", [a.label]).catch(() => zeroAddress);
    if (r !== zeroAddress) {
      sharedResolver = getAddress(r);
      break;
    }
  }
  sharedResolver ??= input.sharedResolverHint ?? null;
  const record = sharedResolver ? await readDefaultRecord(ctx, sharedResolver) : { address: null, canonical: null, parents: [] as string[] };

  // ---- doorways (latest mount log per registry+label)
  const byKey = new Map<string, { registry: Address; tokenId: bigint }>();
  for (const l of mountLogs) byKey.set(`${l.address.toLowerCase()}:${(l.args.tokenId! & VERSION_MASK).toString()}`, { registry: getAddress(l.address), tokenId: l.args.tokenId! });
  const discovered: FleetDoorway[] = await Promise.all(
    [...byKey.values()].map(async ({ registry, tokenId }) => {
      const label = (await labelOf(ctx, tokenId)) ?? `#${(tokenId >> 32n).toString(16).slice(0, 8)}`;
      const [sub, parentName] = await Promise.all([
        readAt<Address>(ctx, registry, ctx.deployment.registryAbi, "getSubregistry", [label]).catch(() => zeroAddress),
        registryName(ctx, registry),
      ]);
      // Built from raw on-chain labels: normalize (ENSIP-15) before comparing with enf.parents / enf.canonical.
      const name = parentName === null ? null : normalizedOr(parentName ? `${label}.${parentName}` : label);
      return {
        name,
        registry,
        label,
        mounted: same(sub, fleet),
        declared: !!name && record.parents.includes(name),
        canonical: !!name && name === record.canonical,
        discovered: true,
      };
    }),
  );
  const seen = new Set(discovered.map((d) => d.name).filter(Boolean) as string[]);
  const declaredOnly: FleetDoorway[] = record.parents
    .filter((p) => !seen.has(p))
    .map((p) => ({ name: p, registry: zeroAddress, label: p.split(".")[0]!, mounted: false, declared: true, canonical: p === record.canonical, discovered: false }));
  const rank = (d: FleetDoorway) => (d.canonical ? 0 : d.declared ? 1 : 2);
  const doorways = [...discovered, ...declaredOnly].sort(
    (a, b) => rank(a) - rank(b) || (a.declared ? record.parents.indexOf(a.name!) - record.parents.indexOf(b.name!) : (a.name ?? "").localeCompare(b.name ?? "")),
  );

  // ---- cells: every agent x every named doorway, one pinned block
  const named = doorways.filter((d) => d.name) as (FleetDoorway & { name: string })[];
  const cells: FleetCell[] = await Promise.all(
    agents.flatMap((a) =>
      named.map(async (d) => {
        const name = `${a.label}.${d.name}`;
        const r = await verify(ctx.client, name, { deployment: ctx.deployment, screen: ctx.screen, doorways: false, blockNumber: block });
        return { agent: a.label, doorway: d.name, name, verdict: r.verdict, summary: r.summary, failed: r.checks.filter((c) => !c.pass).map((c) => c.id) };
      }),
    ),
  );

  // ---- settlement screening
  let settlement: FleetScan["settlement"] = { address: record.address, screen: record.address ? "off" : null };
  if (record.address && ctx.screen) {
    try {
      const s = await ctx.screen(record.address);
      settlement = { address: record.address, screen: s.status, ...(s.reason ? { reason: s.reason } : {}) };
    } catch (err) {
      settlement = { address: record.address, screen: "unknown", reason: (err as Error).message.split("\n")[0] };
    }
  }

  // ---- events
  const events = await buildEvents(ctx, { hireLogs, fireLogs, doorways: discovered, sharedResolver, declared: record.parents });

  const mounted = discovered.filter((d) => d.mounted);
  return {
    blockNumber: block.toString(),
    timestamp: Number(header.timestamp),
    fleetRegistry: fleet,
    sharedResolver,
    canonical: record.canonical,
    settlement,
    doorways,
    agents,
    cells,
    events,
    stats: {
      mountsDiscovered: discovered.length,
      mountsLive: mounted.length,
      endorsed: mounted.filter((d) => d.declared).length,
      counterfeit: mounted.filter((d) => !d.declared).length,
      agentsActive: agents.filter((a) => a.active).length,
      agentsTotal: agents.length,
      cellsGreen: cells.filter((c) => c.verdict === "green").length,
      cellsTotal: cells.length,
    },
    scannedFrom: fromBlock.toString(),
    // Fleet identity is the route's business (lib/fleet-resolve.server.ts); /api/fleet fills these in.
    vendor: null,
    demo: false,
    canonicalRequested: "",
  };
}

type Pending = Omit<FleetEvent, "timestamp"> & { order: number };

async function buildEvents(
  ctx: Ctx,
  src: {
    hireLogs: { blockNumber: bigint | null; logIndex: number | null; transactionHash: Hex | null; args: { label?: string } }[];
    fireLogs: { blockNumber: bigint | null; logIndex: number | null; transactionHash: Hex | null; args: { tokenId?: bigint } }[];
    doorways: FleetDoorway[];
    sharedResolver: Address | null;
    declared: string[];
  },
): Promise<FleetEvent[]> {
  const out: Pending[] = [];
  const push = (l: { blockNumber: bigint | null; logIndex: number | null; transactionHash: Hex | null }, kind: FleetEvent["kind"], text: string) =>
    out.push({ block: (l.blockNumber ?? 0n).toString(), order: Number(l.blockNumber ?? 0n) * 10_000 + (l.logIndex ?? 0), kind, text, tx: l.transactionHash ?? "" });

  for (const l of src.hireLogs) push(l, "hire", `${l.args.label} joined the fleet`);
  for (const l of src.fireLogs) push(l, "fire", `${(await labelOf(ctx, l.args.tokenId ?? 0n)) ?? "agent"} fired by the vendor`);

  const range = { fromBlock: ctx.fromBlock, toBlock: ctx.block };
  await Promise.all(
    src.doorways.map(async (d) => {
      const mask = BigInt(labelhash(d.label)) & VERSION_MASK;
      const logs = await getLogs(ctx.client, { address: d.registry as Address, event: SUBREGISTRY_UPDATED, ...range });
      const who = d.name ?? `${d.label} @ ${short(d.registry)}`;
      for (const l of logs) {
        if ((l.args.tokenId! & VERSION_MASK) !== mask) continue;
        const sub = l.args.subregistry!;
        if (same(sub, ctx.fleetRegistry)) push(l, "mount", `${who} mounted the fleet${d.declared ? "" : " without endorsement"}`);
        else if (sub === zeroAddress) push(l, "unmount", `${who} unmounted the fleet`);
        else push(l, "unmount", `${who} re-pointed to ${short(sub)}`);
      }
    }),
  );

  if (src.sharedResolver) {
    const [addrLogs, textLogs] = await Promise.all([
      getLogs(ctx.client, { address: src.sharedResolver, event: ADDRESS_UPDATED, ...range }),
      getLogs(ctx.client, { address: src.sharedResolver, event: TEXT_UPDATED, ...range }),
    ]);
    for (const l of addrLogs) {
      if (l.args.coinType !== 60n) continue;
      const bytes = l.args.addressBytes ?? "0x";
      push(l, "settlement", `Settlement address set to ${bytes.length === 42 ? short(getAddress(bytes)) : bytes === "0x" ? "cleared" : bytes}`);
    }
    for (const l of textLogs) {
      if (!l.args.key?.startsWith("enf.")) continue;
      const what = l.args.key === "enf.parents" ? "Endorsed doorways list updated" : l.args.key === "enf.canonical" ? "Canonical name updated" : "Fleet record updated";
      push(l, "record", what);
    }
  }

  out.sort((a, b) => b.order - a.order);
  const top = out.slice(0, MAX_EVENTS);
  const blocks = [...new Set(top.map((e) => e.block))];
  const times = new Map<string, number>();
  await Promise.all(
    blocks.map(async (b) => {
      const h = await getBlock(ctx.client, { blockNumber: BigInt(b) }).catch(() => null);
      times.set(b, h ? Number(h.timestamp) : 0);
    }),
  );
  return top.map(({ order: _order, ...e }) => ({ ...e, timestamp: times.get(e.block) ?? 0 }));
}

// ---------------------------------------------------------------- per-block cache

const scanCache = new Map<string, Promise<FleetScan>>();

/** Scans the fleet at `block` (default: latest). Concurrent callers for the same block share one scan. */
export async function scanFleet(input: ScanInput, signature: string, block?: bigint): Promise<FleetScan> {
  const [epoch, b] = await Promise.all([chainEpoch(input.client), block ?? getBlock(input.client, { blockTag: "latest" }).then((h) => h.number!)]);
  const key = `${epoch.key}:${input.fleetRegistry.toLowerCase()}:${b}:${signature}`;
  let p = scanCache.get(key);
  if (!p) {
    p = scan(input, epoch, b);
    scanCache.set(key, p);
    p.catch(() => scanCache.delete(key));
    while (scanCache.size > 8) scanCache.delete(scanCache.keys().next().value!);
  }
  return p;
}
