// packages/verifier/src/verify.ts — the ENF verifier (IMPLEMENTATION_PLAN Part A §A4).
//
//   membership  UR.findResolver(dns(name)): member only if a resolver is found AT THE LEAF (offset 0)
//   records     stock viem getEnsAddress / getEnsText through the deployment's UniversalResolver
//   walk        RootRegistry -> ... -> typed parent's registry -> subregistry("support") = R_doorway
//   C1          R_doorway.getState(labelhash(label)): REGISTERED and not expired (tokenId re-read every call)
//   C2          R_doorway == UniversalHelper.findExactRegistry(enf.canonical)
//               AND UniversalHelper.findCanonicalName(R_doorway) == enf.canonical
//   C3          typed parent ∈ enf.parents
//   C4          every entry on the typed parent's path (e.g. shopa.eth, support.shopa.eth) REGISTERED and not expired
//   C5          optional injected screen(addr)
//
// All reads are pinned to one block. Never throws for bad input: invalid names are black "invalid name".

import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Hex,
  getAddress,
  labelhash,
  zeroAddress,
} from "viem";
import { getBlock, getEnsAddress, getEnsText, readContract } from "viem/actions";
import {
  aggregateVerdict,
  dnsDecode,
  dnsEncode,
  capDoorways,
  doorwayParents,
  fmtTime,
  parseParents,
  safeNormalize,
  splitName,
  summarize,
} from "./pure";
import type {
  Check,
  DoorwayResult,
  Screen,
  ScreenResult,
  VerifierDeployment,
  VerifyCore,
  VerifyOptions,
  VerifyResult,
} from "./types";

const STATUS = ["AVAILABLE", "RESERVED", "REGISTERED"] as const;
const REGISTERED = 2;

type RegState = { status: number; expiry: bigint; latestOwner: Address; tokenId: bigint; resource: bigint };

type Ctx = {
  client: Client;
  d: VerifierDeployment;
  blockNumber: bigint;
  now: bigint;
  screen?: (a: Address) => Promise<ScreenResult>;
};

const isZero = (a: Address | null | undefined) => !a || a.toLowerCase() === zeroAddress;

async function read<T>(ctx: Ctx, address: Address, abi: VerifierDeployment["registryAbi"], functionName: string, args: readonly unknown[]): Promise<T> {
  return (await readContract(ctx.client, { address, abi, functionName, args, blockNumber: ctx.blockNumber } as never)) as T;
}

/**
 * True only for a genuine contract-level outcome: the call reverted (with or without revert data) or the target
 * returned no data (no code / not that interface). Transport failures (HTTP 429, timeouts, RPC errors) are NOT
 * reverts and must propagate, so they can never be mistaken for "not a member" or "counterfeit".
 */
export function isContractRevert(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return !!err.walk((e) => e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError);
}

/** Maps a contract revert to `{ ok: false }`; rethrows every other error (verify() then rejects). */
async function tryRead<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; error: string }> {
  try {
    return { ok: true, v: await p };
  } catch (err) {
    if (!isContractRevert(err)) throw err;
    return { ok: false, error: (err as Error).message.split("\n")[0] ?? "read reverted" };
  }
}

// ---------------------------------------------------------------- membership

async function findLeafResolver(ctx: Ctx, name: string) {
  const r = await tryRead(
    read<readonly [Address, Hex, bigint]>(ctx, ctx.d.universalResolver.address, ctx.d.universalResolver.abi, "findResolver", [dnsEncode(name)]),
  );
  if (!r.ok) return { member: false, resolver: null, offset: null, detail: `UniversalResolver.findResolver failed: ${r.error}` };
  const [resolver, , offsetBig] = r.v;
  const offset = Number(offsetBig);
  if (isZero(resolver)) return { member: false, resolver: zeroAddress, offset, detail: `no resolver for ${name} (ResolverNotFound)` };
  if (offset !== 0) {
    return {
      member: false,
      resolver: getAddress(resolver),
      offset,
      detail: `resolver ${resolver} is inherited from an ancestor (offset ${offset}), not set on ${name} itself`,
    };
  }
  return { member: true, resolver: getAddress(resolver), offset, detail: `resolver ${getAddress(resolver)} set on ${name} itself` };
}

// ---------------------------------------------------------------- records

async function readRecords(ctx: Ctx, name: string) {
  const ur = ctx.d.universalResolver.address;
  const opt = { name, universalResolverAddress: ur, blockNumber: ctx.blockNumber };
  const text = (key: string) => getEnsText(ctx.client, { ...opt, key });
  const [address, canonical, parents, agentContext, agentEndpointWeb] = await Promise.all([
    getEnsAddress(ctx.client, opt),
    text("enf.canonical"),
    text("enf.parents"),
    text("agent-context"),
    text("agent-endpoint[web]"),
  ]);
  return { address, canonical, parents, agentContext, agentEndpointWeb };
}

// ---------------------------------------------------------------- registry walk

type PathEntry = { name: string; registry: Address; state: RegState | null; error?: string; subregistry: Address };

/**
 * Walks from the RootRegistry down the labels of `parent` (TLD first). Returns every entry on the path and the
 * subregistry of the last one (= R_doorway), or null where the chain breaks.
 */
async function walk(ctx: Ctx, parent: string): Promise<{ path: PathEntry[]; doorway: Address | null; brokenAt?: string }> {
  const labels = parent ? parent.split(".").reverse() : [];
  let registry: Address = ctx.d.rootRegistry.address;
  const path: PathEntry[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const name = labels.slice(0, i + 1).reverse().join(".");
    const [st, sub] = await Promise.all([
      tryRead(read<RegState>(ctx, registry, ctx.d.registryAbi, "getState", [BigInt(labelhash(label))])),
      tryRead(read<Address>(ctx, registry, ctx.d.registryAbi, "getSubregistry", [label])),
    ]);
    const subregistry = sub.ok ? sub.v : zeroAddress;
    path.push({
      name,
      registry,
      state: st.ok ? st.v : null,
      error: !st.ok ? st.error : !sub.ok ? sub.error : undefined,
      subregistry,
    });
    if (isZero(subregistry)) return { path, doorway: null, brokenAt: name };
    registry = subregistry;
  }
  return { path, doorway: getAddress(registry) };
}

const alive = (ctx: Ctx, s: RegState | null) => !!s && s.status === REGISTERED && s.expiry > ctx.now;

function describeState(ctx: Ctx, s: RegState | null): string {
  if (!s) return "unreadable";
  if (s.status === REGISTERED && s.expiry <= ctx.now) return `expired at ${fmtTime(s.expiry)}`;
  return `${STATUS[s.status] ?? `status ${s.status}`}, expires ${fmtTime(s.expiry)}`;
}

// ---------------------------------------------------------------- checks

function checkC1(ctx: Ctx, label: string, parent: string, w: Awaited<ReturnType<typeof walk>>, member: RegState | null, memberErr?: string): Check {
  const title = "member token alive";
  if (!w.doorway) {
    const why = w.brokenAt === parent ? `${parent} has no subregistry (unmounted or expired)` : `${w.brokenAt} has no subregistry`;
    return { id: "C1", title, pass: false, detail: `no doorway registry: ${why}` };
  }
  if (!member) return { id: "C1", title, pass: false, detail: `could not read ${label} in ${w.doorway}: ${memberErr ?? "unknown error"}` };
  if (!alive(ctx, member)) return { id: "C1", title, pass: false, detail: `${label} in doorway registry ${w.doorway} is ${describeState(ctx, member)}` };
  return {
    id: "C1",
    title,
    pass: true,
    detail: `${label} REGISTERED in ${w.doorway} (tokenId ${member.tokenId}, owner ${member.latestOwner}, expires ${fmtTime(member.expiry)})`,
  };
}

function checkC4(ctx: Ctx, parent: string, w: Awaited<ReturnType<typeof walk>>): Check {
  const title = "doorway alive";
  if (!parent) return { id: "C4", title, pass: false, detail: "no parent name" };
  // Report the non-TLD path entries (e.g. shopa.eth, support.shopa.eth); every entry must be alive.
  const dead = w.path.filter((e) => !alive(ctx, e.state));
  const shown = w.path.filter((e) => e.name.includes("."));
  if (dead.length) {
    return { id: "C4", title, pass: false, detail: dead.map((e) => `${e.name} is ${describeState(ctx, e.state)}${e.error ? ` (${e.error})` : ""}`).join("; ") };
  }
  return { id: "C4", title, pass: true, detail: shown.map((e) => `${e.name} expires ${fmtTime(e.state!.expiry)}`).join("; ") || `${parent} alive` };
}

export function checkC2(doorway: Address | null, canonical: string | undefined, rCanonical: Address | null, canonicalNameOfDoorway: string | null): Check {
  const title = "canonical registry match";
  if (!canonical) return { id: "C2", title, pass: false, detail: "no valid enf.canonical record" };
  if (!doorway) return { id: "C2", title, pass: false, detail: "no doorway registry to compare" };
  if (isZero(rCanonical)) return { id: "C2", title, pass: false, detail: `${canonical} has no registry (findExactRegistry = 0x0)` };
  const regMatch = doorway.toLowerCase() === rCanonical!.toLowerCase();
  const nameMatch = canonicalNameOfDoorway === canonical;
  const shownName = canonicalNameOfDoorway ? `"${canonicalNameOfDoorway}"` : "none";
  if (!regMatch) {
    return {
      id: "C2",
      title,
      pass: false,
      detail: `doorway registry ${doorway} != registry of ${canonical} ${rCanonical}; doorway's canonical name is ${shownName}`,
    };
  }
  if (!nameMatch) {
    return { id: "C2", title, pass: false, detail: `doorway registry's canonical name is ${shownName}, record says ${canonical}` };
  }
  return { id: "C2", title, pass: true, detail: `doorway registry ${doorway} is the registry of ${canonical} and names it canonically` };
}

export function checkC3(parent: string, parents: string[] | undefined, invalid: string[]): Check {
  const title = "two-sided consent";
  if (!parents) return { id: "C3", title, pass: false, detail: "no enf.parents record" };
  const listed = `[${parents.join(", ")}]${invalid.length ? ` (ignored invalid: ${invalid.join(", ")})` : ""}`;
  if (!parents.includes(parent)) return { id: "C3", title, pass: false, detail: `${parent} is not in enf.parents ${listed}: the fleet never endorsed this doorway` };
  return { id: "C3", title, pass: true, detail: `${parent} is listed in enf.parents ${listed}` };
}

async function checkC5(ctx: Ctx, address: Address): Promise<Check> {
  const title = "counterparty screening";
  let r: ScreenResult;
  try {
    r = await ctx.screen!(address);
  } catch (err) {
    r = { status: "unknown", reason: `screen failed: ${(err as Error).message.split("\n")[0]}` };
  }
  const why = r.reason ? `: ${r.reason}` : "";
  const extra = r.reason ? { screenReason: r.reason } : {};
  if (r.status === "clean") return { id: "C5", title, pass: true, detail: `${address} clean${why}`, screen: "clean", ...extra };
  if (r.status === "flagged") return { id: "C5", title, pass: false, detail: `${address} flagged${why}`, screen: "flagged", ...extra };
  return { id: "C5", title, pass: false, detail: `unknown${why}`, screen: "unknown", ...extra };
}

/** Normalizes a name read from chain (findCanonicalName); an unnormalizable name is kept verbatim so C2 fails visibly. */
function normalizeOnChainName(name: string | null): string | null {
  if (!name) return null;
  const n = safeNormalize(name);
  return n.ok ? n.name : name;
}

// ---------------------------------------------------------------- one name

function invalidResult(input: string, error: string, blockNumber: bigint | null): VerifyCore {
  const reason = `invalid name: ${error}`;
  return {
    input,
    normalized: null,
    label: null,
    parent: null,
    verdict: "black",
    summary: `not a member: ${reason}`,
    reasons: [reason],
    membership: { member: false, resolver: null, offset: null, detail: reason },
    checks: [],
    resolved: {},
    registries: { doorway: null, canonical: null, canonicalNameOfDoorway: null },
    blockNumber: blockNumber === null ? null : blockNumber.toString(),
  };
}

async function verifyOne(ctx: Ctx, input: string): Promise<VerifyCore> {
  const n = safeNormalize(input);
  if (!n.ok) return invalidResult(input, n.error, ctx.blockNumber);
  const name = n.name;
  const { label, parent } = splitName(name);

  const [membership, rec, w] = await Promise.all([findLeafResolver(ctx, name), readRecords(ctx, name), walk(ctx, parent)]);

  const canonicalNorm = rec.canonical ? safeNormalize(rec.canonical) : null;
  const canonical = canonicalNorm?.ok ? canonicalNorm.name : undefined;
  const { parents, invalid } = parseParents(rec.parents);
  const parentsList = rec.parents === null ? undefined : parents;

  const helper = ctx.d.universalHelper;
  const [memberState, rCanonical, canonName] = await Promise.all([
    w.doorway ? tryRead(read<RegState>(ctx, w.doorway, ctx.d.registryAbi, "getState", [BigInt(labelhash(label))])) : Promise.resolve(null),
    canonical ? tryRead(read<Address>(ctx, helper.address, helper.abi, "findExactRegistry", [dnsEncode(canonical)])) : Promise.resolve(null),
    w.doorway ? tryRead(read<Hex>(ctx, helper.address, helper.abi, "findCanonicalName", [w.doorway])) : Promise.resolve(null),
  ]);

  const registries = {
    doorway: w.doorway,
    canonical: rCanonical?.ok ? getAddress(rCanonical.v) : null,
    canonicalNameOfDoorway: canonName?.ok && canonName.v !== "0x" ? normalizeOnChainName(dnsDecode(canonName.v)) : null,
  };

  const checks: Check[] = [
    checkC1(ctx, label, parent, w, memberState?.ok ? memberState.v : null, memberState && !memberState.ok ? memberState.error : undefined),
    checkC2(w.doorway, canonical, registries.canonical, registries.canonicalNameOfDoorway),
    checkC3(parent, parentsList, invalid),
    checkC4(ctx, parent, w),
  ];
  const address = rec.address ? getAddress(rec.address) : undefined;
  if (ctx.screen && address) checks.push(await checkC5(ctx, address));

  const { verdict, reasons } = aggregateVerdict({ member: membership.member, memberDetail: membership.detail, hasAddress: !!address, checks });
  const resolved = {
    ...(address ? { address } : {}),
    ...(canonical ? { canonical } : {}),
    ...(parentsList ? { parents: parentsList } : {}),
    ...(rec.agentContext ? { agentContext: rec.agentContext } : {}),
    ...(rec.agentEndpointWeb ? { agentEndpointWeb: rec.agentEndpointWeb } : {}),
  };
  return {
    input,
    normalized: name,
    label,
    parent,
    verdict,
    summary: summarize(verdict, parent, canonical, reasons, checks),
    reasons,
    membership,
    checks,
    resolved,
    registries,
    blockNumber: ctx.blockNumber.toString(),
  };
}

// ---------------------------------------------------------------- public

function memoScreen(screen: Screen): (a: Address) => Promise<ScreenResult> {
  const cache = new Map<string, Promise<ScreenResult>>();
  return (a) => {
    const k = a.toLowerCase();
    let p = cache.get(k);
    if (!p) {
      p = screen(a);
      cache.set(k, p);
    }
    return p;
  };
}

/**
 * Verifies `name` (e.g. "mia.support.shopa.eth"). Never throws for bad names (black "invalid name");
 * transport/RPC failures (unreachable, HTTP 429, timeouts) reject — they are never turned into red/black.
 */
export async function verify(client: Client, name: string, opts: VerifyOptions): Promise<VerifyResult> {
  const pre = safeNormalize(name);
  if (!pre.ok) return { ...invalidResult(name, pre.error, null), doorways: [], doorwaysSkipped: [] };

  const block = await getBlock(client, opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : { blockTag: "latest" });
  const ctx: Ctx = {
    client,
    d: opts.deployment,
    blockNumber: block.number!,
    now: block.timestamp,
    screen: opts.screen ? memoScreen(opts.screen) : undefined,
  };

  const main = await verifyOne(ctx, name);
  if (opts.doorways === false || !main.label) return { ...main, doorways: [], doorwaysSkipped: [] };

  // Doorways never recurse: siblings are computed with verifyOne (no doorways of their own).
  const { parents, skipped } = capDoorways(doorwayParents(main.resolved.parents, main.parent ?? ""), main.parent ?? "");
  const doorways: DoorwayResult[] = await Promise.all(
    parents.map(async (p) =>
      p === main.parent ? { ...main, isInput: true } : { ...(await verifyOne(ctx, `${main.label}.${p}`)), isInput: false },
    ),
  );
  return { ...main, doorways, doorwaysSkipped: skipped };
}
