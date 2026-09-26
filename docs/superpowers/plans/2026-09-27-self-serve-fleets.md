# Self-serve fleets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any visitor with a Sepolia wallet creates their own FNS fleet at `/start` and operates it in `/editor?fleet=support.<name>.eth`, signing everything in their own wallet. The demo fleet `support.vendor.eth` keeps working unchanged.

**Architecture:** The chain is the database: a fleet is identified by its canonical name and everything else is read from ENSv2 (`resolveFleet`). The server only plans unsigned transactions (`/api/actions`, `/api/onboard`); the browser sends them, batched with EIP-5792 `wallet_sendCalls` when the wallet supports it. Chain steps re-plan until their plan is empty, so deploy-then-wire sequences work.

**Tech Stack:** Next.js 16 (app router, `runtime = "nodejs"` routes), React 19, viem 2, vitest 2 (run from the repo root), tsx for scripts, ENSv2 Sepolia contracts pinned in `deployments/sepolia.json`.

**Spec:** `docs/superpowers/specs/2026-09-27-self-serve-fleets-design.md`

## Global Constraints

- The server never holds or reads a private key. `*_PK` variables are for `scripts/` only.
- Demo fleet canonical name is exactly `support.vendor.eth`; with no `fleet=` parameter everything behaves as today (same presets, same targets, same fleet file hints).
- Mount label is always `support`. Labels match `^[a-z0-9-]{1,63}$` after ENSIP-15 `normalize()` from `viem/ens`.
- On-chain text keys stay `enf.canonical` and `enf.parents` (protocol data). `enf.parents` is a comma-separated list of full names, e.g. `support.alice.eth,support.alice-shop.eth`.
- New proxy salts: `BigInt(keccak256(stringToHex("fns.fleet.v1:" + canonical)))`, `"fns.resolver.v1:" + canonical`, `"fns.parent.v1:" + label`.
- Self-serve fleets: vendor = operator = the wallet that owns `<vendor>.eth`; settlement (clean) address = the vendor address.
- Server libs in `app/src/lib/*.server.ts` use **relative imports only** (no `@/`), so `scripts/` can import them with tsx.
- Tests: `npx vitest run app/src/lib` from the repo root. Typecheck: `cd app && npx tsc --noEmit`.
- Other people are editing `app/src/app/page.tsx` and `app/src/components/landing/*` right now. Never revert or overwrite changes you did not make; always `git add` explicit paths, never `git add -A` / `.`.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`), **no `Co-Authored-By` trailer**.
- Copy uses the product's plain voice (see `BLOCKS` in `app/src/lib/playbook.ts`): short sentences, no exclamation marks.

## Review Focus

1. A reload or closed tab during the ~60 s commit wait must resume without re-committing: secrets persist in localStorage and `planOnboard` returns `wait`/`build`, never a second `commit`, for a live commitment (pinned in Task 9's fork script).
2. A `.eth` name owned by someone else is never touched: `classifyName` returns `taken` and every planner refuses it (Task 1 unit test, Task 4 error path).
3. A wallet without batching support, or one that rejects `wallet_sendCalls` as unsupported, falls back to one confirmation per transaction; a user rejection (4001) stops cleanly instead of falling back (Task 5 unit tests for `batchFallback`).
4. Garbage or oddly-cased `?fleet=` (`Alice`, `alice`, `alice.eth`, `support.alice.eth`, `x..eth`, empty) resolves to a canonical name or a clear error, never a crash (Task 1 unit tests; Task 7 error state).
5. Old share links (`?playbook=` only) and old saved playbooks still open on the demo fleet (Task 6 unit tests for legacy storage + share parsing).

---

## File map

| File | Responsibility |
|---|---|
| `app/src/lib/fleet-ref.ts` (new) | Pure, client+server: fleet-name parsing, label checks, salts, name classification |
| `app/src/lib/fleet-ref.test.ts` (new) | Unit tests for the above |
| `app/src/lib/fleet-resolve.server.ts` (new) | `resolveFleet`, `findProxy`, `predictProxy`, `agentsOf`, `fleetsOwnedBy` |
| `app/src/lib/actions.server.ts` | Planner keyed by fleet; new `hire`, `add-doorway`; generalised `counterfeit`, `reset` |
| `app/src/lib/onboard.server.ts` (new) | `nameStatuses`, `planOnboard` (phases commit → wait → build → done) |
| `app/src/lib/fleet-types.ts` | Types: `ActionName`, `TxStep.simulate`, `FleetScan.vendor/demo`, onboarding types |
| `app/src/app/api/{fleet,verify,actions}/route.ts` | `fleet=` parameter |
| `app/src/app/api/onboard/route.ts`, `app/src/app/api/fleets/route.ts` (new) | Onboarding plans, owned-fleet discovery |
| `app/src/lib/send-plan.ts` (new) + test | `groupBySigner`, `batchFallback` (pure) |
| `app/src/lib/wallet.ts` | `sendBatch` (EIP-5792 with fallback) |
| `app/src/lib/useRunner.ts` | Fleet-aware, batched, re-plans until done |
| `app/src/lib/playbook.ts` + `playbook.test.ts` (new) | New kinds `hire`/`doorway`, `presets(ctx)`, per-fleet storage |
| `app/src/lib/useFleetData.ts`, `app/src/app/editor/page.tsx`, `app/src/components/{Playbook,WorkflowCanvas,FleetSwitcher}.tsx` | Fleet context in the editor |
| `app/src/app/start/page.tsx`, `app/src/components/start/StartWizard.tsx` (new) | Onboarding wizard |
| `scripts/e2e-selfserve.ts` (new) | Fork run of the whole flow |

---

### Task 1: Fleet references (pure helpers)

**Files:**
- Create: `app/src/lib/fleet-ref.ts`
- Test: `app/src/lib/fleet-ref.test.ts`

**Interfaces:**
- Produces:
  - `DEMO_FLEET = "support.vendor.eth"`, `MOUNT_LABEL = "support"`, `LABEL_RE`
  - `normLabel(raw: string): string | null` — ENSIP-15 normalised label or null
  - `parseFleet(raw: string | null | undefined): { canonical: string; vendorLabel: string } | null`
  - `doorwayName(label: string): string` → `support.<label>.eth`; `doorwayLabel(name: string): string | null`
  - `fleetSalt(kind: "fleet" | "resolver", canonical: string): bigint`; `parentSalt(label: string): bigint`
  - `classifyName(owner: string, current: string): "available" | "yours" | "taken"`
  - `formatParents(labels: string[]): string` → `support.a.eth,support.b.eth`; `parseParentLabels(raw: string | null): string[]`

- [ ] **Step 1: Write the failing test** — `app/src/lib/fleet-ref.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, zeroAddress } from "viem";
import { DEMO_FLEET, classifyName, doorwayLabel, doorwayName, fleetSalt, formatParents, normLabel, parentSalt, parseFleet, parseParentLabels } from "./fleet-ref";

describe("parseFleet", () => {
  it("accepts every spelling of a fleet name", () => {
    for (const raw of ["alice", "Alice", "alice.eth", "support.alice.eth", " SUPPORT.alice.ETH "])
      expect(parseFleet(raw)).toEqual({ canonical: "support.alice.eth", vendorLabel: "alice" });
  });
  it("defaults to the demo fleet when empty", () => {
    expect(parseFleet(null)).toEqual({ canonical: DEMO_FLEET, vendorLabel: "vendor" });
    expect(parseFleet("")).toEqual({ canonical: DEMO_FLEET, vendorLabel: "vendor" });
  });
  it("rejects garbage", () => {
    for (const raw of ["x..eth", "a.b.c.eth", "support..eth", "-", "a b", "💥💥".repeat(40), "support.a.b.eth"]) expect(parseFleet(raw)).toBeNull();
  });
});

describe("labels and doorways", () => {
  it("normalises labels", () => {
    expect(normLabel("Alice-Shop")).toBe("alice-shop");
    expect(normLabel("a.b")).toBeNull();
    expect(normLabel("")).toBeNull();
  });
  it("maps doorway names both ways", () => {
    expect(doorwayName("shopa")).toBe("support.shopa.eth");
    expect(doorwayLabel("support.shopa.eth")).toBe("shopa");
    expect(doorwayLabel("mia.support.shopa.eth")).toBeNull();
  });
  it("formats and parses enf.parents", () => {
    expect(formatParents(["alice", "alice-shop"])).toBe("support.alice.eth,support.alice-shop.eth");
    expect(parseParentLabels("support.alice.eth, support.alice-shop.eth,junk")).toEqual(["alice", "alice-shop"]);
    expect(parseParentLabels(null)).toEqual([]);
  });
});

describe("salts", () => {
  it("derive from the canonical name and label", () => {
    expect(fleetSalt("fleet", "support.alice.eth")).toBe(BigInt(keccak256(stringToHex("fns.fleet.v1:support.alice.eth"))));
    expect(fleetSalt("resolver", "support.alice.eth")).toBe(BigInt(keccak256(stringToHex("fns.resolver.v1:support.alice.eth"))));
    expect(parentSalt("alice")).toBe(BigInt(keccak256(stringToHex("fns.parent.v1:alice"))));
    expect(fleetSalt("fleet", "support.a.eth")).not.toBe(fleetSalt("fleet", "support.b.eth"));
  });
});

describe("classifyName", () => {
  const me = "0x1607846398FeF2cB4573445160B57aBA3fB68dDB";
  it("classifies by the current owner", () => {
    expect(classifyName(me, zeroAddress)).toBe("available");
    expect(classifyName(me, me.toLowerCase())).toBe("yours");
    expect(classifyName(me, "0x7A9092d9C7fFEc85f2ba5ED037B4FCC9e845b05B")).toBe("taken");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run app/src/lib/fleet-ref.test.ts` (repo root). Expected: FAIL, cannot resolve `./fleet-ref`.

- [ ] **Step 3: Implement** — `app/src/lib/fleet-ref.ts`

```ts
// app/src/lib/fleet-ref.ts — naming a fleet. Pure; safe on client and server.
//
// A fleet is identified by its canonical name, support.<vendor>.eth. Everything else about it is read from chain
// (lib/fleet-resolve.server.ts). Proxy salts derive from names so addresses are predictable and one wallet can own
// several fleets.

import { keccak256, stringToHex, zeroAddress } from "viem";
import { normalize } from "viem/ens";

export const DEMO_FLEET = "support.vendor.eth";
export const MOUNT_LABEL = "support";
export const LABEL_RE = /^[a-z0-9-]{1,63}$/;

/** ENSIP-15 normalised single label, or null when it is empty, dotted or outside the label pattern. */
export function normLabel(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.includes(".")) return null;
  try {
    const n = normalize(t);
    return LABEL_RE.test(n) ? n : null;
  } catch {
    return null;
  }
}

/** "alice", "alice.eth" or "support.alice.eth" (any case) -> the canonical fleet name. Empty -> the demo fleet. */
export function parseFleet(raw: string | null | undefined): { canonical: string; vendorLabel: string } | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return { canonical: DEMO_FLEET, vendorLabel: "vendor" };
  let parts = t.split(".");
  if (parts[parts.length - 1] === "eth") parts = parts.slice(0, -1);
  if (parts.length === 2 && parts[0] === MOUNT_LABEL) parts = parts.slice(1);
  if (parts.length !== 1) return null;
  const label = normLabel(parts[0]!);
  return label ? { canonical: `${MOUNT_LABEL}.${label}.eth`, vendorLabel: label } : null;
}

export const doorwayName = (label: string) => `${MOUNT_LABEL}.${label}.eth`;

export function doorwayLabel(name: string): string | null {
  const m = /^support\.([a-z0-9-]{1,63})\.eth$/.exec(name.trim());
  return m ? m[1]! : null;
}

const salt = (s: string) => BigInt(keccak256(stringToHex(s)));
export const fleetSalt = (kind: "fleet" | "resolver", canonical: string) => salt(`fns.${kind}.v1:${canonical}`);
export const parentSalt = (label: string) => salt(`fns.parent.v1:${label}`);

export function classifyName(owner: string, current: string): "available" | "yours" | "taken" {
  if (current.toLowerCase() === zeroAddress) return "available";
  return current.toLowerCase() === owner.toLowerCase() ? "yours" : "taken";
}

export const formatParents = (labels: string[]) => labels.map(doorwayName).join(",");

export function parseParentLabels(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((x) => doorwayLabel(x.trim()))
    .filter((x): x is string => !!x);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run app/src/lib/fleet-ref.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/fleet-ref.ts app/src/lib/fleet-ref.test.ts
git commit -m "feat: fleet name parsing, salts and name classification"
```

---

### Task 2: Resolve a fleet from chain

**Files:**
- Create: `app/src/lib/fleet-resolve.server.ts`
- Modify: `app/src/lib/fleet-types.ts` (add `ResolvedFleet`)

**Interfaces:**
- Consumes: Task 1 (`parseFleet`, `fleetSalt`, `parseParentLabels`, `DEMO_FLEET`, `MOUNT_LABEL`); `readFleetFile`, `getScanContracts`, `REPO_ROOT` from `./deployment.server`; `rpcClient` from `./rpc.server`.
- Produces (all in `fleet-resolve.server.ts`):
  - `class FleetNotFoundError extends Error`
  - `resolveFleet(raw: string | null | undefined): Promise<ResolvedFleet>`
  - `findProxy(sender: Address, salt: bigint): Promise<{ address: Address; block: bigint } | null>`
  - `predictProxy(sender: Address, impl: "UserRegistryImpl" | "PermissionedResolverImpl", salt: bigint, initData: Hex): Promise<{ address: Address; deployed: boolean }>`
  - `agentsOf(fleet: ResolvedFleet): Promise<Map<string, Address>>` — label → latest registered owner
  - `fleetsOwnedBy(owner: Address): Promise<string[]>` — canonical names
  - `readText(resolver: Address, key: string): Promise<string | null>`; `contract(name): { address: Address; abi: Abi }` for `ETHRegistry | ETHRegistrar | MockUSDC | VerifiableFactory | UserRegistryImpl | PermissionedResolverImpl`
- `ResolvedFleet` (in `fleet-types.ts`):

```ts
/** A fleet as read from chain (server side). Addresses are checksummed strings. */
export type ResolvedFleet = {
  canonical: string;
  vendorLabel: string;
  /** True for support.vendor.eth, which keeps its fleet-file hints and separate operator. */
  demo: boolean;
  vendor: `0x${string}`;
  operator: `0x${string}`;
  vendorRegistry: `0x${string}`;
  fleetRegistry: `0x${string}`;
  sharedResolver: `0x${string}` | null;
  deployBlock: bigint | null;
  /** Endorsed doorway labels (from enf.parents; the demo fleet: every parent in the fleet file, scam included). */
  doorways: string[];
  /** addr(60) that `clean` and `reset` restore. */
  cleanSettlement: `0x${string}`;
};
```

- [ ] **Step 1: Add `ResolvedFleet`** to the end of `app/src/lib/fleet-types.ts` (code above).

- [ ] **Step 2: Implement** `app/src/lib/fleet-resolve.server.ts`

```ts
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
  const clean = serverEnv("SETTLEMENT_ADDRESS") || f.settlementAddress;
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
```

Check before moving on: `readFleetFile()`'s `FleetFile` type in `deployment.server.ts` has `vendor`, `operator`, `parentRegistries`, `members`, `sharedResolver`, `deployBlock`, `settlementAddress`, `fleetRegistry`. If a field is missing from the type, add it there (optional) rather than casting.

- [ ] **Step 3: Typecheck** — `cd app && npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 4: Smoke-test against Sepolia** (read-only) — from the repo root:

```bash
cat > /tmp/fns-resolve-smoke.ts <<'EOF'
import { resolveFleet, fleetsOwnedBy } from "./app/src/lib/fleet-resolve.server.ts";
const demo = await resolveFleet(null);
console.log(demo.canonical, demo.demo, demo.doorways);
console.log(await fleetsOwnedBy(demo.vendor));
await resolveFleet("nobody-owns-this-xyz-123").catch((e) => console.log("expected error:", e.message));
EOF
cp /tmp/fns-resolve-smoke.ts ./fns-resolve-smoke.ts && npx tsx ./fns-resolve-smoke.ts; rm ./fns-resolve-smoke.ts
```

Expected: `support.vendor.eth true [ 'vendor', 'shopa', 'shopb', 'scam' ]`, an array (probably empty: the demo fleet used old salts), and `expected error: nobody-owns-this-xyz-123.eth is not registered.`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/fleet-resolve.server.ts app/src/lib/fleet-types.ts app/src/lib/deployment.server.ts
git commit -m "feat: resolve any fleet from chain by its canonical name"
```

---

### Task 3: Fleet-aware planner and routes (`fleet=`, `hire`, `add-doorway`)

**Files:**
- Modify: `app/src/lib/fleet-types.ts`, `app/src/lib/actions.server.ts`, `app/src/app/api/actions/route.ts`, `app/src/app/api/fleet/route.ts`, `app/src/app/api/verify/route.ts`, `app/src/lib/fleet-scan.server.ts` (only the returned object)
- Create: `app/src/app/api/fleets/route.ts`

**Interfaces:**
- Consumes: Task 2 (`resolveFleet`, `FleetNotFoundError`, `agentsOf`, `predictProxy`, `contract`, `readText`, `forgetFleet`, `fleetsOwnedBy`); Task 1 (`normLabel`, `parentSalt`, `formatParents`, `parseParentLabels`, `doorwayName`).
- Produces:
  - `ActionName = "unmount" | "fire" | "dirty" | "clean" | "reset" | "counterfeit" | "hire" | "add-doorway"`
  - `TxStep` gains `simulate?: false` (skip the pre-flight `eth_call` for steps that depend on an earlier step in the same plan)
  - `ActionRequest = { fleet?: string; action: ActionName; target?: string; address?: string }`
  - `actionsInfo(fleet?: string): Promise<ActionsInfo>` — `ActionsInfo` gains `canonical: string; vendor: string | null; demo: boolean`
  - `planAction(req: ActionRequest): Promise<ActionPlan>`
  - `simulateSteps(steps: TxStep[]): Promise<string | null>` (error text or null) — exported for Task 4
  - `FleetScan` gains `vendor: string | null; demo: boolean; canonicalRequested: string`
  - `GET /api/fleet?fleet=`, `GET /api/verify?name=&block=&fleet=`, `GET /api/actions?fleet=`, `POST /api/actions {fleet, action, target, address}`, `GET /api/fleets?owner=0x…` → `{ fleets: string[] }`

- [ ] **Step 1: Types** — in `fleet-types.ts`:

```ts
export type ActionName = "unmount" | "fire" | "dirty" | "clean" | "reset" | "counterfeit" | "hire" | "add-doorway";

export type ActionRequest = { fleet?: string; action: ActionName; target?: string; address?: string };

export type ActionsInfo = {
  enabled: boolean;
  reason?: string;
  /** Endorsed doorway labels and agent labels, from chain (the demo fleet: its fleet file). */
  parents: string[];
  agents: string[];
  chain: "anvil" | "live" | null;
  canonical: string;
  /** The wallet that signs vendor steps; null when the fleet could not be read. */
  vendor: string | null;
  demo: boolean;
};

/** One unsigned transaction the browser wallet sends. `from` is the only address allowed to sign it.
 * `simulate: false` marks a step that depends on an earlier step of the same plan, so it is not pre-flighted. */
export type TxStep = { what: string; signer: string; from: `0x${string}`; to: `0x${string}`; data: `0x${string}`; simulate?: false };
```

and add to `FleetScan`: `vendor: string | null; demo: boolean;`.

- [ ] **Step 2: Rewrite the planner around `ResolvedFleet`** in `actions.server.ts`. Keep the file's header comment style; replace `FleetFile` usage:

  - `ACTIONS` gains `"hire", "add-doorway"`.
  - `actionsInfo(fleetRaw?: string)`: keep the kill-switch/RPC checks; then `const fleet = await resolveFleet(fleetRaw)` (catch `FleetNotFoundError` → `off(err.message)`), `const agents = [...(await agentsOf(fleet)).keys()]`, return `{ enabled: true, parents: fleet.doorways, agents, chain: kind, canonical: fleet.canonical, vendor: fleet.vendor, demo: fleet.demo }`. `off()` returns `canonical: parseFleet(fleetRaw)?.canonical ?? DEMO_FLEET, vendor: null, demo: false`.
  - `parentRegistry(label)` unchanged. `mountSteps(parent, target)` unchanged.
  - `memberSteps(fleet: ResolvedFleet, label: string, agent: Address)` — same body as today with `fleet.fleetRegistry`, `fleet.vendor`, `fleet.sharedResolver` (throw `"the fleet has no shared resolver yet"` if null) and the passed `agent`; signer label `"vendor"`.
  - `settlementSteps(fleet, settlement)` — `fleet.sharedResolver` and signer `fleet.operator`; signer label `fleet.demo ? "operator" : "vendor"`.
  - New `parentsStep(fleet, labels)`: when `parseParentLabels(await readText(resolver, "enf.parents"))` differs from `labels`, one step `setText("0x00", "enf.parents", formatParents(labels))` on the shared resolver, signed by `fleet.operator`, `what: "Endorse " + labels.map(doorwayName).join(", ")`.
  - New `doorwaySteps(fleet, label, endorse: boolean)`:

```ts
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
    return [step(`Deploy the registry for ${label}.eth`, "vendor", fleet.vendor, contract("VerifiableFactory").address, contract("VerifiableFactory").abi, "deployProxy", [contract("UserRegistryImpl").address, parentSalt(label), init])];
  const steps: TxStep[] = [];
  const current = await read<Address>(eth.address, "getSubregistry", [label], eth.abi);
  if (!same(current, reg.address)) steps.push(step(`Point ${label}.eth at its registry`, "vendor", fleet.vendor, eth.address, eth.abi, "setSubregistry", [labelId(label), reg.address]));
  const resolver = await read<Address>(eth.address, "getResolver", [label], eth.abi);
  if (resolver !== zeroAddress) steps.push(step(`Clear ${label}.eth resolver`, "vendor", fleet.vendor, eth.address, eth.abi, "setResolver", [labelId(label), zeroAddress]));
  steps.push(...(await mountStepsAt(reg.address, label, fleet.vendor, fleet.fleetRegistry)));
  if (endorse && !fleet.doorways.includes(label)) steps.push(...(await parentsStep(fleet, [...fleet.doorways, label])));
  return steps;
}
```

  Factor today's `mountSteps(parent, target)` into `mountStepsAt(reg, parent, owner, target)` (same body, registry and owner passed in) and keep `mountSteps(parent, target)` as the wrapper that looks them up. `read()` gains the optional `abi` already used by `settlementSteps`.

  - `buildSteps(req, fleet)`:

```ts
switch (req.action) {
  case "unmount":
    return mountSteps(req.target!, zeroAddress);
  case "counterfeit":
    return fleet.demo ? mountSteps("scam", fleet.fleetRegistry) : doorwaySteps(fleet, req.target!, false);
  case "add-doorway":
    return doorwaySteps(fleet, req.target!, true);
  case "hire":
    return memberSteps(fleet, req.target!, getAddress(req.address!));
  case "fire": { /* as today, with fleet.fleetRegistry and fleet.vendor */ }
  case "dirty": { /* as today */ return settlementSteps(fleet, SANCTIONED_DEMO_ADDRESS); }
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
```

  - `planAction(req)`: resolve the fleet (`FleetNotFoundError` → `{ok:false, error}`), validate:
    - `unmount`: `target` in `fleet.doorways`; `fire`: `target` in agents.
    - `hire`: `normLabel(target)` must equal `target`; `address` must match `/^0x[0-9a-fA-F]{40}$/`; refuse if the label is already registered to a different owner (memberSteps already throws).
    - `add-doorway` / `counterfeit` on a self-serve fleet: `normLabel(target) === target`, and `add-doorway` refuses `target === fleet.vendorLabel` ("already the canonical doorway").
    - then `const steps = await buildSteps(req, fleet)`, `const err = await simulateSteps(steps)`, `forgetFleet(fleet.canonical)` when steps is non-empty, return.
  - `simulateSteps(steps)`: today's loop, skipping `s.simulate === false`; returns the `"<what> would revert: …"` string or null.

- [ ] **Step 3: Routes.**
  - `api/actions/route.ts`: `GET` → `actionsInfo(new URL(request.url).searchParams.get("fleet") ?? undefined)`. `POST` body `{ fleet?, action, target?, address? }`: type-check `fleet` and `address` as optional strings like `target`, then `planAction({ fleet, action, target, address })`.
  - `api/fleet/route.ts`: replace `readFleetFile()` with `const fleet = await resolveFleet(url.searchParams.get("fleet"))` (`FleetNotFoundError` → 404 `{ error }`); pass `fleetRegistry: fleet.fleetRegistry`, `sharedResolverHint: fleet.sharedResolver ?? undefined`, `deployBlockHint: fleet.deployBlock ?? undefined`; respond with `{ ...scan, vendor: fleet.vendor, demo: fleet.demo, screening }`. Update the header comment (404 for an unknown fleet instead of 503).
  - `api/verify/route.ts`: replace the fleet-file block with `const fleet = await resolveFleet(url.searchParams.get("fleet")).catch(() => null)` and use `fleet?.canonical` where it used `fleet.canonicalName`.
  - `fleet-scan.server.ts`: `FleetScan` now requires `vendor`/`demo`; have `scanFleet` return `vendor: null, demo: false` and let the route overwrite them (keeps the scan module fleet-agnostic).
  - New `api/fleets/route.ts`:

```ts
// GET /api/fleets?owner=0x… -> { fleets: string[] }: canonical names of the fleets that wallet deployed (lib/fleet-resolve.server.ts).
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { fleetsOwnedBy } from "@/lib/fleet-resolve.server";
import { rpcErrorMessage } from "@/lib/rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get("owner") ?? "";
  if (!isAddress(owner)) return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  try {
    return NextResponse.json({ fleets: await fleetsOwnedBy(getAddress(owner)) });
  } catch (err) {
    return NextResponse.json({ error: `RPC unavailable: ${rpcErrorMessage(err)}` }, { status: 502 });
  }
}
```

- [ ] **Step 4: Typecheck** — `cd app && npx tsc --noEmit`. Fix every caller the type changes break (`useRunner.ts` builds `{action, target}` today; leave its behaviour, just satisfy the types — Task 5 rewrites it).

- [ ] **Step 5: Regression check on the demo fleet** — `cd app && npx next dev -p 3100` in the background, then:

```bash
curl -s localhost:3100/api/actions | head -c 400; echo
curl -s -X POST localhost:3100/api/actions -H 'content-type: application/json' -d '{"action":"fire","target":"mia"}' | head -c 400; echo
curl -s 'localhost:3100/api/fleet?fleet=nobody-owns-this-xyz-123' ; echo
curl -s 'localhost:3100/api/fleets?owner=0x1607846398FeF2cB4573445160B57aBA3fB68dDB'; echo
```

Expected: `enabled: true` with `canonical":"support.vendor.eth","demo":true`; a plan (`ok:true`, steps or empty); a 404 JSON error `nobody-owns-this-xyz-123.eth is not registered.`; `{"fleets":[...]}`. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/fleet-types.ts app/src/lib/actions.server.ts app/src/lib/fleet-scan.server.ts app/src/app/api/actions/route.ts app/src/app/api/fleet/route.ts app/src/app/api/verify/route.ts app/src/app/api/fleets/route.ts
git commit -m "feat: plan kill switches for any fleet, add hire and add-doorway"
```

---

### Task 4: Onboarding planner and `/api/onboard`

**Files:**
- Create: `app/src/lib/onboard.server.ts`, `app/src/app/api/onboard/route.ts`
- Modify: `app/src/lib/fleet-types.ts`

**Interfaces:**
- Consumes: Task 1 (`normLabel`, `classifyName`, `fleetSalt`, `parentSalt`, `formatParents`, `doorwayName`, `MOUNT_LABEL`); Task 2 (`contract`, `predictProxy`); Task 3 (`simulateSteps`, `TxStep`).
- Produces (types in `fleet-types.ts`):

```ts
export type NameStatus = { label: string; status: "available" | "yours" | "taken" | "invalid" };

export type OnboardRequest = {
  owner: `0x${string}`;
  vendor: string;
  doorways: string[];
  agents: { label: string; address: `0x${string}` }[];
  /** Commit secret per label that still needs registering (32-byte hex, generated and kept in the browser). */
  secrets: Record<string, `0x${string}`>;
};

export type OnboardPhase = "commit" | "wait" | "build" | "done";

export type OnboardPlan =
  | { ok: true; phase: OnboardPhase; steps: TxStep[]; canonical: string; names: NameStatus[]; waitSeconds?: number }
  | { ok: false; error: string; names?: NameStatus[] };
```

  - `nameStatuses(owner: Address, labels: string[]): Promise<NameStatus[]>`
  - `planOnboard(req: OnboardRequest): Promise<OnboardPlan>`
  - `GET /api/onboard?owner=0x…&labels=a,b` → `{ names: NameStatus[] }`; `POST /api/onboard` (same-origin) body `OnboardRequest` → `OnboardPlan`

- [ ] **Step 1: Types** — add the block above to `fleet-types.ts`.

- [ ] **Step 2: Implement** `app/src/lib/onboard.server.ts`

```ts
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
import { contract, predictProxy } from "./fleet-resolve.server";
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
  const seed = [
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: ["0x00", 60n, owner] }),
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x00", "enf.canonical", canonical] }),
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x00", "enf.parents", formatParents(labels)] }),
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x00", "agent-context", `FNS fleet ${canonical}: agents answer under ${labels.map(doorwayName).join(", ")}.`] }),
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
```

Notes for the implementer:
- In the build phase, the name `register` steps are `simulate: false` (they need the approve first). The `support` mounts, `setParent` and agent steps do not depend on the names, so they simulate fine.
- `getState` returns a struct; viem returns it as an object with `status`, `latestOwner` — same as `actions.server.ts` uses today.

- [ ] **Step 3: Route** — `app/src/app/api/onboard/route.ts`

```ts
// GET  /api/onboard?owner=0x…&labels=a,b -> { names }: is each <label>.eth available, yours or taken.
// POST /api/onboard OnboardRequest -> OnboardPlan: the next batch of unsigned transactions for a new fleet.
// The server holds no keys and sends nothing; see lib/onboard.server.ts.

import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { nameStatuses, planOnboard } from "@/lib/onboard.server";
import type { OnboardRequest } from "@/lib/fleet-types";
import { rpcErrorMessage } from "@/lib/rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner") ?? "";
  const labels = (url.searchParams.get("labels") ?? "").split(",").filter(Boolean).slice(0, 6);
  if (!isAddress(owner)) return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  try {
    return NextResponse.json({ names: await nameStatuses(getAddress(owner), labels) });
  } catch (err) {
    return NextResponse.json({ error: `RPC unavailable: ${rpcErrorMessage(err)}` }, { status: 502 });
  }
}

function validRequest(b: unknown): b is OnboardRequest {
  const r = b as OnboardRequest;
  return (
    !!r && typeof r === "object" && typeof r.owner === "string" && isAddress(r.owner) && typeof r.vendor === "string" &&
    Array.isArray(r.doorways) && r.doorways.length <= 3 && r.doorways.every((d) => typeof d === "string") &&
    Array.isArray(r.agents) && r.agents.length <= 8 && r.agents.every((a) => a && typeof a.label === "string" && typeof a.address === "string" && isAddress(a.address)) &&
    !!r.secrets && typeof r.secrets === "object"
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ ok: false, error: "cross-origin request refused" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  if (!validRequest(body)) return NextResponse.json({ ok: false, error: "malformed onboarding request" }, { status: 400 });
  try {
    const plan = await planOnboard(body);
    return NextResponse.json(plan, { status: plan.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: rpcErrorMessage(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Typecheck** — `cd app && npx tsc --noEmit`.

- [ ] **Step 5: Smoke-test planning on Sepolia** (read-only, nothing is sent): with the dev server running,

```bash
curl -s 'localhost:3100/api/onboard?owner=0x1607846398FeF2cB4573445160B57aBA3fB68dDB&labels=vendor,shopa,fns-free-name-9731'; echo
curl -s -X POST localhost:3100/api/onboard -H 'content-type: application/json' -d '{"owner":"0x1607846398FeF2cB4573445160B57aBA3fB68dDB","vendor":"fns-free-name-9731","doorways":[],"agents":[],"secrets":{"fns-free-name-9731":"0x1111111111111111111111111111111111111111111111111111111111111111"}}' | head -c 800; echo
```

Expected: `vendor` → `yours`, `shopa` → `taken`, the free name → `available`; the POST returns `phase":"commit"` with 3 steps (registry, fleet registry, shared resolver deploys) + 1 commit.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/onboard.server.ts app/src/lib/fleet-types.ts app/src/app/api/onboard/route.ts
git commit -m "feat: onboarding planner for self-serve fleets"
```

---

### Task 5: Batched sending and a fleet-aware runner

**Files:**
- Create: `app/src/lib/send-plan.ts`, `app/src/lib/send-plan.test.ts`
- Modify: `app/src/lib/wallet.ts`, `app/src/lib/useRunner.ts`

**Interfaces:**
- Consumes: `TxStep`, `ActionRequest` (Task 3).
- Produces:
  - `groupBySigner(steps: TxStep[]): TxStep[][]` — consecutive same-`from` runs
  - `batchFallback(err: unknown): "fallback" | "rethrow"` — 4001 → rethrow; unsupported-method codes (`-32601`, `4200`, `5700`, `5710`, `5720`, `5750`) and messages matching `/not supported|unsupported|does not exist|method not found/i` → fallback; anything else → rethrow
  - `sendBatch(steps: TxStep[], onSent?: (hashes: string[]) => void): Promise<{ hashes: string[]; block: bigint }>` in `wallet.ts`
  - `useRunner({ fleet, onChainChange, onChecked })` — `fleet: string`; the step's request is `{ fleet, action, target: step.target, address: step.address }`

- [ ] **Step 1: Write the failing test** — `app/src/lib/send-plan.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { TxStep } from "./fleet-types";
import { batchFallback, groupBySigner } from "./send-plan";

const s = (from: string, what = "x"): TxStep => ({ what, signer: "s", from: from as `0x${string}`, to: "0x0000000000000000000000000000000000000001", data: "0x" });

describe("groupBySigner", () => {
  it("groups consecutive steps from the same signer, in order", () => {
    const A = "0x00000000000000000000000000000000000000aA", B = "0x00000000000000000000000000000000000000bb";
    const g = groupBySigner([s(A, "1"), s(A.toLowerCase(), "2"), s(B, "3"), s(A, "4")]);
    expect(g.map((x) => x.map((y) => y.what))).toEqual([["1", "2"], ["3"], ["4"]]);
  });
  it("returns nothing for an empty plan", () => expect(groupBySigner([])).toEqual([]));
});

describe("batchFallback", () => {
  it("never falls back when the user rejected", () => expect(batchFallback({ code: 4001 })).toBe("rethrow"));
  it("falls back when the wallet cannot batch", () => {
    for (const e of [{ code: -32601 }, { code: 5700 }, { code: 5710 }, { code: 4200 }, { message: "wallet_sendCalls is not supported" }, new Error("Method not found")])
      expect(batchFallback(e)).toBe("fallback");
  });
  it("rethrows other failures", () => expect(batchFallback(new Error("execution reverted"))).toBe("rethrow"));
});
```

- [ ] **Step 2: Run it** — `npx vitest run app/src/lib/send-plan.test.ts`. Expected: FAIL, cannot resolve `./send-plan`.

- [ ] **Step 3: Implement** `app/src/lib/send-plan.ts`

```ts
// app/src/lib/send-plan.ts — pure helpers for sending a plan. Client and tests.
import type { TxStep } from "./fleet-types";

/** Consecutive steps from the same signer, in plan order: each group can be one wallet batch. */
export function groupBySigner(steps: TxStep[]): TxStep[][] {
  const out: TxStep[][] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last[0]!.from.toLowerCase() === s.from.toLowerCase()) last.push(s);
    else out.push([s]);
  }
  return out;
}

const UNSUPPORTED = new Set([-32601, 4200, 5700, 5710, 5720, 5750]);

/** Whether a failed wallet_sendCalls should fall back to one transaction at a time. A rejection never does. */
export function batchFallback(err: unknown): "fallback" | "rethrow" {
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return "rethrow";
  if (typeof e?.code === "number" && UNSUPPORTED.has(e.code)) return "fallback";
  return /not supported|unsupported|does not exist|method not found/i.test(e?.message ?? "") ? "fallback" : "rethrow";
}
```

- [ ] **Step 4: Run tests** — expected PASS.

- [ ] **Step 5: `sendBatch` in `wallet.ts`** (append; reuse `provider`, `ensureChain`, `sendStep`, `waitForReceipt`):

```ts
const hex = (n: number) => `0x${n.toString(16)}`;

async function canBatch(eth: EIP1193Provider, from: string): Promise<boolean> {
  try {
    const caps = (await eth.request({ method: "wallet_getCapabilities", params: [from, [hex(CHAIN_ID)]] } as never)) as Record<string, { atomic?: { status?: string } }>;
    const status = caps?.[hex(CHAIN_ID)]?.atomic?.status;
    return status === "supported" || status === "ready";
  } catch {
    return false;
  }
}

/** Sends a same-signer group: one EIP-5792 batch when the wallet supports it, else one transaction at a time.
 * Resolves with every transaction hash and the newest block they landed in; throws if any reverted. */
export async function sendBatch(steps: TxStep[], onSent?: (hashes: string[]) => void): Promise<{ hashes: string[]; block: bigint }> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found.");
  await ensureChain(eth);
  const from = steps[0]!.from;
  if (steps.length > 1 && (await canBatch(eth, from))) {
    try {
      const { id } = (await eth.request({
        method: "wallet_sendCalls",
        params: [{ version: "2.0.0", chainId: hex(CHAIN_ID), from, atomicRequired: true, calls: steps.map((s) => ({ to: s.to, data: s.data, value: "0x0" })) }],
      } as never)) as { id: string };
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = (await eth.request({ method: "wallet_getCallsStatus", params: [id] } as never)) as { status: number; receipts?: { status: string; blockNumber: string; transactionHash: string }[] };
        if (st.status < 200) continue;
        if (st.status !== 200 || !st.receipts?.length || st.receipts.some((r) => r.status !== "0x1")) throw new Error("The batch failed or reverted in the wallet.");
        const hashes = st.receipts.map((r) => r.transactionHash);
        onSent?.(hashes);
        return { hashes, block: st.receipts.reduce((m, r) => (BigInt(r.blockNumber) > m ? BigInt(r.blockNumber) : m), 0n) };
      }
    } catch (err) {
      if (batchFallback(err) === "rethrow") throw err;
    }
  }
  const hashes: string[] = [];
  let block = 0n;
  for (const s of steps) {
    const hash = await sendStep(s);
    hashes.push(hash);
    onSent?.([...hashes]);
    const b = await waitForReceipt(s, hash);
    if (b > block) block = b;
  }
  return { hashes, block };
}
```

(import `batchFallback` from `./send-plan`.)

- [ ] **Step 6: Runner** — in `useRunner.ts`:
  - signature `useRunner({ fleet, onChainChange, onChecked }: { fleet: string; … })`.
  - Replace `runChainStep`'s body after connecting with a re-plan loop:

```ts
let sent = 0;
for (let round = 0; round < 6; round++) {
  const res = await wait("Preparing the transactions.", fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fleet, action, target: step.target, address: step.address }),
  }));
  const plan = (await res.json()) as ActionPlan;
  if (!plan.ok) throw new Error(plan.error);
  if (plan.steps.length === 0) {
    onChainChange();
    return sent === 0 ? "Already done. No transaction needed." : `${sent === 1 ? "1 transaction" : `${sent} transactions`}. Done.`;
  }
  for (const group of groupBySigner(plan.steps)) {
    const signer = group[0]!;
    await wait(`Switch your wallet to the ${signer.signer}.`, waitForAccount(signer.from, signer.signer));
    const label = group.length === 1 ? `${signer.what}. Confirm it in your wallet.` : `${group.length} transactions (${group.map((g) => g.what).join("; ")}). Confirm them in your wallet.`;
    const { hashes, block } = await wait(label, sendBatch(group, (h) => patch(step.id, { txs: [...txs, ...h.map((hash, i) => ({ what: group[i]?.what ?? "", hash }))] })));
    txs.push(...hashes.map((hash, i) => ({ what: group[i]?.what ?? "", hash })));
    patch(step.id, { txs: [...txs] });
    sent += hashes.length;
    if (minBlock.current === null || block > minBlock.current) minBlock.current = block;
  }
}
throw new Error("Still not finished after 6 rounds of transactions. Run it again to continue.");
```

  (`txs` is declared before the loop as today. `Step` gets `address?: string` in Task 6; until then use `(step as { address?: string }).address`.) Remove the now-unused `sendStep`/`waitForReceipt` imports from the runner.

- [ ] **Step 7: Typecheck + tests** — `cd app && npx tsc --noEmit` and `npx vitest run app/src/lib` (repo root). The editor page passes no `fleet` yet: pass `fleet: DEMO_FLEET` there for now (Task 7 wires the real one).

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/send-plan.ts app/src/lib/send-plan.test.ts app/src/lib/wallet.ts app/src/lib/useRunner.ts app/src/app/editor/page.tsx
git commit -m "feat: batch same-signer transactions and re-plan chain steps until done"
```

---

### Task 6: Playbooks — new blocks, per-fleet presets and storage

**Files:**
- Modify: `app/src/lib/playbook.ts`
- Create: `app/src/lib/playbook.test.ts`

**Interfaces:**
- Consumes: Task 1 (`DEMO_FLEET`, `LABEL_RE`).
- Produces:
  - `StepKind` adds `"hire" | "doorway"`; `Step` adds `address?: string`
  - `BLOCKS.hire`, `BLOCKS.doorway`; `BLOCK_ORDER = ["check", "hire", "doorway", "unmount", "fire", "dirty", "clean", "counterfeit", "reset"]`
  - `actionOf(step)`: `doorway` → `"add-doorway"`, `check` → null, others → their kind
  - `type FleetCtx = { canonical: string; doorways: string[]; agents: string[] }`
  - `presets(ctx?: FleetCtx): Playbook[]` — demo (no ctx or `ctx.canonical === DEMO_FLEET`) returns exactly today's list
  - `loadSaved(fleet?: string)`, `savePlaybook(p, fleet?: string)`, `deleteSaved(id, fleet?: string)` — `fleet` defaults to `DEMO_FLEET`

- [ ] **Step 1: Write the failing test** — `app/src/lib/playbook.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_FLEET } from "./fleet-ref";
import { actionOf, decodePlaybook, deleteSaved, encodePlaybook, linear, loadSaved, makeStep, presets, savePlaybook, stepSummary } from "./playbook";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new MemStorage(); });

describe("presets", () => {
  it("keeps the demo presets unchanged", () => {
    expect(presets().map((p) => p.title)).toEqual(presets({ canonical: DEMO_FLEET, doorways: [], agents: [] }).map((p) => p.title));
    expect(presets()[0]!.title).toBe("The full demo");
  });
  it("builds stories from a fleet's own doorway and agent", () => {
    const ps = presets({ canonical: "support.alice.eth", doorways: ["alice", "alice-shop"], agents: ["zoe"] });
    const names = ps.flatMap((p) => p.nodes.map((n) => n.name ?? n.target ?? ""));
    expect(names).toContain("zoe.support.alice-shop.eth");
    expect(names).toContain("alice-shop");
    expect(names.join(" ")).not.toMatch(/mia|shopa|shopb|scam/);
  });
  it("offers hiring first when the fleet has no agents", () => {
    const ps = presets({ canonical: "support.alice.eth", doorways: ["alice"], agents: [] });
    expect(ps[0]!.nodes[0]!.kind).toBe("hire");
    expect(ps[0]!.nodes[0]!.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe("new blocks", () => {
  it("maps kinds to actions", () => {
    expect(actionOf(makeStep("doorway"))).toBe("add-doorway");
    expect(actionOf(makeStep("hire"))).toBe("hire");
    expect(actionOf(makeStep("check"))).toBeNull();
  });
  it("summarises them", () => {
    expect(stepSummary({ id: "1", kind: "hire", target: "zoe" })).toBe("Hire zoe");
    expect(stepSummary({ id: "1", kind: "doorway", target: "alice-shop" })).toBe("Add support.alice-shop.eth");
  });
  it("round-trips hire and doorway through a share link, rejecting bad addresses", () => {
    const good = linear("t", "T", [{ id: "", kind: "hire", target: "zoe", address: "0x00107c5e51b62bd50418e388FDfc45A93d46d11D" }, { id: "", kind: "doorway", target: "alice-shop" }]);
    const back = decodePlaybook(encodePlaybook(good))!;
    expect(back.nodes.map((n) => [n.kind, n.target, n.address])).toEqual([["hire", "zoe", "0x00107c5e51b62bd50418e388FDfc45A93d46d11D"], ["doorway", "alice-shop", undefined]]);
    const bad = linear("t", "T", [{ id: "", kind: "hire", target: "zoe", address: "0xnope" }]);
    expect(decodePlaybook(encodePlaybook(bad))!.nodes).toHaveLength(0);
  });
});

describe("storage per fleet", () => {
  it("keeps fleets apart and reads the legacy list for the demo fleet", () => {
    const p = linear("a", "Mine", [{ id: "", kind: "fire", target: "zoe" }]);
    savePlaybook(p, "support.alice.eth");
    expect(loadSaved("support.alice.eth").map((x) => x.title)).toEqual(["Mine"]);
    expect(loadSaved(DEMO_FLEET)).toEqual([]);
    localStorage.setItem("fns.playbooks.v2", JSON.stringify([{ id: "old", title: "Legacy", nodes: [], edges: [] }]));
    expect(loadSaved().map((x) => x.title)).toEqual(["Legacy"]);
    deleteSaved(loadSaved("support.alice.eth")[0]!.id, "support.alice.eth");
    expect(loadSaved("support.alice.eth")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run app/src/lib/playbook.test.ts`. Expected: FAIL (unknown kinds, `presets` ignores ctx, `loadSaved` has no fleet).

- [ ] **Step 3: Implement** in `playbook.ts`:
  - Types: `StepKind` adds `"hire" | "doorway"`; `Step` adds `/** hire: the agent's address. */ address?: string;`. Import `ActionName` already exists.
  - `BLOCKS` additions:

```ts
hire: { title: "Hire an agent", signer: "The vendor", blurb: "One transaction from the vendor. The new agent answers under every doorway at once.", chain: true },
doorway: { title: "Add a doorway", signer: "The vendor", blurb: "Mounts the fleet under another .eth name the vendor owns and endorses it in enf.parents.", chain: true },
```

  and change `counterfeit.blurb` to `"Mounts the fleet under a name without the fleet's consent."`, `counterfeit.signer` to `"The name's owner"`.
  - `BLOCK_ORDER` as in Interfaces.
  - `makeStep`: `hire` → `step.target = "agent"; step.address = randomAddress();` ; `doorway` → `step.target = ""`. Add

```ts
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
/** A fresh address for a new agent. Members hold no roles, so its key never has to sign anything. */
export const randomAddress = () => privateKeyToAddress(generatePrivateKey());
```

  - `actionOf`: `step.kind === "check" ? null : step.kind === "doorway" ? "add-doorway" : step.kind`.
  - `stepSummary`: `hire` → `` `Hire ${step.target}` ``; `doorway` → `` `Add support.${step.target}.eth` ``; `counterfeit` → `step.target ? \`Counterfeit mount at support.${step.target}.eth\` : BLOCKS.counterfeit.title`.
  - `stepTouches`: `hire` → `{ doorway: null, agent: step.target ?? null, resolver: false }`; `doorway` → `{ doorway: \`support.${step.target}.eth\`, agent: null, resolver: false }`; `counterfeit` → `{ doorway: \`support.${step.target ?? "scam"}.eth\`, agent: null, resolver: false }`.
  - `presets(ctx?: FleetCtx)`: rename today's function body to `demoPresets()`; new:

```ts
export type FleetCtx = { canonical: string; doorways: string[]; agents: string[] };

export function presets(ctx?: FleetCtx): Playbook[] {
  if (!ctx || ctx.canonical === DEMO_FLEET) return demoPresets();
  const v = /^support\.([a-z0-9-]+)\.eth$/.exec(ctx.canonical)![1]!;
  const shop = ctx.doorways.find((d) => d !== v) ?? v;
  const at = (agent: string, door: string) => `${agent}.support.${door}.eth`;
  if (ctx.agents.length === 0)
    return [linear("fleet-hire", "Hire your first agent", [s("hire", { target: "agent-1", address: randomAddress() }), s("check", { name: at("agent-1", v), expect: "green" })])];
  const a = ctx.agents[0]!;
  const list = [
    linear("fleet-demo", "The full story", [
      s("check", { name: at(a, shop), expect: "green" }),
      ...(shop !== v ? [s("unmount", { target: shop }), s("check", { name: at(a, shop), expect: "black" })] : []),
      s("fire", { target: a }),
      s("check", { name: at(a, v), expect: "black" }),
    ]),
    linear("fleet-vendor", "The vendor fires one agent everywhere", [s("fire", { target: a }), s("check", { name: at(a, v), expect: "black" })]),
    linear("fleet-screening", "A dirty settlement address", [s("dirty"), s("check", { name: at(a, v), expect: "orange" }), s("clean"), s("check", { name: at(a, v), expect: "green" })]),
    linear("fleet-reset", "Reset the fleet", [s("reset"), s("check", { name: at(a, shop), expect: "green" })]),
  ];
  if (shop !== v)
    list.splice(1, 0, linear("fleet-merchant", "A merchant fires the vendor", [s("unmount", { target: shop }), s("check", { name: at(a, shop), expect: "black" }), s("check", { name: at(a, v), expect: "green" })]));
  return list;
}
```

  - `cleanStep`: `KINDS` adds `"hire", "doorway"`; `hire` requires `LABEL.test(target)` and `/^0x[0-9a-fA-F]{40}$/.test(address)` (else return null); `doorway` requires `LABEL.test(target)`; `counterfeit` keeps an optional `target` when it passes `LABEL`. `strip()` already spreads `...rest`, so `address` travels in share links.
  - Storage: `const keyFor = (fleet: string) => \`${STORE}:${fleet}\``; `write(list, fleet)`; `loadSaved(fleet = DEMO_FLEET)` reads `keyFor(fleet)`, and for `DEMO_FLEET` falls back to `STORE` then `OLD_STORE` when the new key is absent; `savePlaybook(p, fleet = DEMO_FLEET)`; `deleteSaved(id, fleet = DEMO_FLEET)`.

- [ ] **Step 4: Run tests** — `npx vitest run app/src/lib`. Expected: all PASS.

- [ ] **Step 5: Typecheck** — `cd app && npx tsc --noEmit` (fix exhaustiveness errors in `WorkflowCanvas`/`Playbook` icon maps by adding entries for `hire` — `UserPlus` — and `doorway` — `DoorOpen` — from `@phosphor-icons/react`, wherever a `Record<StepKind, …>` exists).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/playbook.ts app/src/lib/playbook.test.ts app/src/components/WorkflowCanvas.tsx app/src/components/Playbook.tsx
git commit -m "feat: hire and doorway blocks, per-fleet presets and saved playbooks"
```

---

### Task 7: Editor — fleet context, switcher, visitor note, new node fields

**Files:**
- Create: `app/src/components/FleetSwitcher.tsx`, `app/src/lib/my-fleets.ts`
- Modify: `app/src/lib/useFleetData.ts`, `app/src/app/editor/page.tsx`, `app/src/components/WorkflowCanvas.tsx`, `app/src/components/Playbook.tsx`, `app/src/app/globals.css` (only new classes)

**Interfaces:**
- Consumes: Task 1 (`parseFleet`, `DEMO_FLEET`), Task 3 (`FleetScan.vendor/demo`, `/api/fleets`), Task 5 (`useRunner({ fleet })`), Task 6 (`presets(ctx)`, per-fleet storage, `randomAddress`).
- Produces:
  - `my-fleets.ts`: `rememberFleet(canonical: string): void`, `rememberedFleets(): string[]` (localStorage `fns.fleets.v1`, try/catch, max 12, newest first)
  - `useFleetData(fleet: string)` — adds `&fleet=` / `?fleet=` to `/api/fleet` and `/api/verify`; default committed name: demo → `mia.support.shopa.eth`; otherwise empty until the first scan, then `<first active agent>.<canonical>` if any
  - `<FleetSwitcher current={canonical} account={account} />`
  - `Playbook` gets `fleet: string` prop (storage + share link); `WorkflowCanvas` gets `demo: boolean`

- [ ] **Step 1: `my-fleets.ts`**

```ts
// app/src/lib/my-fleets.ts — fleets this browser created or opened. A convenience: losing it loses nothing (the chain
// and /api/fleets?owner= still find them).
const KEY = "fns.fleets.v1";

export function rememberedFleets(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberFleet(canonical: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([canonical, ...rememberedFleets().filter((x) => x !== canonical)].slice(0, 12)));
  } catch {
    // storage unavailable
  }
}
```

- [ ] **Step 2: `FleetSwitcher.tsx`**

```tsx
"use client";
// The top bar's fleet picker: this browser's fleets, the connected wallet's fleets, the demo fleet, and + New fleet.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_FLEET } from "@/lib/fleet-ref";
import { rememberedFleets } from "@/lib/my-fleets";

export function FleetSwitcher({ current, account }: { current: string; account: string | null }) {
  const router = useRouter();
  const [fleets, setFleets] = useState<string[]>([]);
  useEffect(() => {
    const local = rememberedFleets();
    setFleets(local);
    if (!account) return;
    fetch(`/api/fleets?owner=${account}`)
      .then((r) => r.json())
      .then((b: { fleets?: string[] }) => setFleets([...new Set([...local, ...(b.fleets ?? [])])]))
      .catch(() => {});
  }, [account]);
  const options = [...new Set([current, ...fleets.filter((f) => f !== DEMO_FLEET), DEMO_FLEET])];
  return (
    <label className="fleet-switcher">
      <span className="sr-only">Fleet</span>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new") router.push("/start");
          else router.push(v === DEMO_FLEET ? "/editor" : `/editor?fleet=${encodeURIComponent(v)}`);
        }}
      >
        {options.map((f) => (
          <option key={f} value={f}>
            {f === DEMO_FLEET ? `${f} (demo)` : f}
          </option>
        ))}
        <option value="__new">+ New fleet</option>
      </select>
    </label>
  );
}
```

  CSS (append to `globals.css`, using existing tokens — check `:root` for the names used by `.search input` and copy them):

```css
.fleet-switcher select { font: inherit; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); max-width: 240px; }
.notice.visitor { margin: 0 0 12px; }
```

  (If `--line`, `--surface`, `--ink` do not exist, use the tokens `.search input` uses.)

- [ ] **Step 3: `useFleetData(fleet)`** — add the parameter; `fetch(\`/api/fleet?fleet=${encodeURIComponent(fleet)}\`)`; add `qs.set("fleet", fleet)` for `/api/verify`; initial `input`/`committed` = `fleet === DEMO_FLEET ? DEFAULT_NAME : ""`; after a scan, if `committed === ""` and `scan.agents.find((a) => a.active)` exists, set both to `\`${agent.label}.${scan.canonical ?? fleet}\``. Make `runVerify` a no-op for an empty name (no request, `loading=false`). Keep `?name=` URL syncing as is.

- [ ] **Step 4: Editor page** (`editor/page.tsx`):
  - Read the fleet once on mount: `const [fleet, setFleet] = useState<string>(DEMO_FLEET)` + effect reading `new URLSearchParams(location.search).get("fleet")` → `parseFleet(...)`; invalid → keep a `fleetError` string (`"<raw>" is not a fleet name.`) and render it in place of the canvas with `<Link href="/start">Start your own fleet</Link>`. Valid non-demo → `rememberFleet(canonical)`.
  - `useFleetData(fleet)`, `useRunner({ fleet, … })`.
  - Presets: `const ctx = d.scan ? { canonical: fleet, doorways: parents, agents } : undefined;` Initial playbook stays `presets()[0]` (demo). When the first scan for a non-demo fleet arrives and no `?playbook=` was given, `setPlaybook(presets(ctx)[0]!)` once (guard with a ref).
  - `parents`: for non-demo fleets derive from `d.scan.doorways.filter((x) => x.declared)` labels (fallback `[vendorLabel]`), demo unchanged.
  - Top bar: insert `<FleetSwitcher current={fleet} account={account} />` before `<WalletButton />`.
  - Visitor note, above the title row:

```tsx
{d.scan && !d.scan.demo && d.scan.vendor && (!account || account.toLowerCase() !== d.scan.vendor.toLowerCase()) && (
  <p className="notice tone-orange banner visitor" role="status">
    Viewing {fleet}. Only its owner ({shortAddr(d.scan.vendor)}) can run chain steps; checks run for anyone.
  </p>
)}
```

  - The unmounted-canonical banner text becomes `…Run Reset the fleet to remount it.` for non-demo fleets.
  - Pass `fleet={fleet}` to `<Playbook>` and `demo={fleet === DEMO_FLEET}` to `<WorkflowCanvas>`; `makeStep` defaults in `addAfter`/`dropBlock` unchanged.
  - A `/api/fleet` 404 shows `d.scanError` in the canvas area (already handled) plus the `/start` link.

- [ ] **Step 5: `Playbook.tsx`** — accept `fleet: string`; `loadSaved(fleet)`, `savePlaybook(playbook, fleet)`, `deleteSaved(p.id, fleet)`; the "Demo playbooks" menu uses a new `presetList: PlaybookData[]` prop (the editor passes `presets(ctx)`); `share()` also sets `url.searchParams.set("fleet", fleet)` unless `fleet === DEMO_FLEET` (then deletes it). Rename the menu heading to `fleet === DEMO_FLEET ? "Demo playbooks" : "Playbooks for this fleet"`.

- [ ] **Step 6: `WorkflowCanvas.tsx` `NodeFields`** — add `demo` to its props and these branches:

```tsx
if (node.kind === "hire")
  return (
    <>
      <label className="field grow">
        <span className="field-label">Agent name</span>
        <input value={node.target ?? ""} disabled={locked} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="zoe"
          onChange={(e) => onChange({ ...node, target: e.target.value.toLowerCase() })} />
      </label>
      <label className="field grow">
        <span className="field-label">Address</span>
        <span className="field-row">
          <input className="mono" value={node.address ?? ""} disabled={locked} spellCheck={false} autoComplete="off" placeholder="0x…"
            onChange={(e) => onChange({ ...node, address: e.target.value.trim() })} />
          <button type="button" className="tool-btn" disabled={locked} onClick={() => onChange({ ...node, address: randomAddress() })}>Generate</button>
        </span>
      </label>
    </>
  );
if (node.kind === "doorway" || (node.kind === "counterfeit" && !demo))
  return (
    <label className="field grow">
      <span className="field-label">{node.kind === "doorway" ? "A .eth name you own" : "Mount under (a .eth name you own)"}</span>
      <input value={node.target ?? ""} disabled={locked} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="alice-cafe"
        onChange={(e) => onChange({ ...node, target: e.target.value.toLowerCase().replace(/\.eth$/, "") })} />
    </label>
  );
```

  Add `.field-row { display: flex; gap: 6px; }` to `globals.css`. Thread `demo` from `WorkflowCanvas` props into `NodeFields`.

- [ ] **Step 7: Verify in the browser** — `cd app && npx next dev -p 3100`; with the Playwright MCP tools (or manually):
  1. `/editor` → demo fleet, same presets as before, switcher shows `support.vendor.eth (demo)`.
  2. `/editor?fleet=nobody-owns-this-xyz-123` → readable error + `/start` link, no crash.
  3. `/editor?fleet=Alice!!` → "is not a fleet name".
  4. Add a Hire block → Generate fills an address. Add a doorway block → text field.
  5. Old share link: `/editor?playbook=<code from the landing page>` opens on the demo fleet.
  Take one screenshot of the demo editor into the scratchpad and look at it.

- [ ] **Step 8: Typecheck + tests + commit**

```bash
cd app && npx tsc --noEmit && cd .. && npx vitest run app/src/lib
git add app/src/lib/my-fleets.ts app/src/components/FleetSwitcher.tsx app/src/lib/useFleetData.ts app/src/app/editor/page.tsx app/src/components/WorkflowCanvas.tsx app/src/components/Playbook.tsx app/src/app/globals.css
git commit -m "feat: open any fleet in the editor, with a fleet switcher and visitor view"
```

---

### Task 8: `/start` onboarding wizard and landing CTA

**Files:**
- Create: `app/src/app/start/page.tsx`, `app/src/components/start/StartWizard.tsx`
- Modify: `app/src/app/page.tsx` (CTA only — **read the current file first; it has uncommitted edits by someone else; change only the button labels/hrefs listed below**), `app/src/app/globals.css` (new `.wizard*` classes)

**Interfaces:**
- Consumes: `/api/onboard` (Task 4), `sendBatch`, `connect`, `useWallet` (Task 5 / existing), `rememberFleet` (Task 7), `normLabel` (Task 1), `randomAddress` (Task 6), `groupBySigner` (Task 5).
- Produces: route `/start`.

- [ ] **Step 1: Page** — `app/src/app/start/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { StartWizard } from "@/components/start/StartWizard";

export const metadata: Metadata = { title: "Start your fleet · FNS" };

export default function StartPage() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="FNS home">
            <span className="brand-name">FNS</span>
            <span className="brand-sub">Start your fleet</span>
          </Link>
        </div>
      </header>
      <main className="wizard">
        <StartWizard />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Wizard** — `app/src/components/start/StartWizard.tsx`

```tsx
"use client";
// The /start wizard: pick names and agents, then let the planner walk commit -> wait -> build -> done, one wallet batch
// per phase. Everything is re-planned from chain after each step, so a reload or a rejection resumes where it stopped.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPublicClient, custom, formatEther, type Address } from "viem";
import type { NameStatus, OnboardPlan, OnboardRequest } from "@/lib/fleet-types";
import { normLabel } from "@/lib/fleet-ref";
import { rememberFleet } from "@/lib/my-fleets";
import { randomAddress } from "@/lib/playbook";
import { walletError } from "@/lib/useRunner";
import { connect, provider, sendBatch, useWallet } from "@/lib/wallet";

type Draft = { vendor: string; doorways: string[]; agents: { label: string; address: `0x${string}` }[]; secrets: Record<string, `0x${string}`> };
type Status = { kind: "idle" } | { kind: "working"; text: string } | { kind: "waiting"; seconds: number } | { kind: "error"; text: string } | { kind: "done"; canonical: string };

const FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const draftKey = (a: string) => `fns.onboard.v1:${a.toLowerCase()}`;
const emptyDraft = (): Draft => ({ vendor: "", doorways: [""], agents: [{ label: "mia", address: randomAddress() }], secrets: {} });

function loadDraft(a: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(a)) ?? "null") as Draft | null;
  } catch {
    return null;
  }
}
function saveDraft(a: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(a), JSON.stringify(d));
  } catch {
    // storage unavailable: a reload during the wait would need a fresh commit
  }
}
const randomSecret = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

export function StartWizard() {
  const { account, available } = useWallet();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [names, setNames] = useState<NameStatus[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const running = useRef(false);

  // Restore this wallet's draft (and its commit secrets) so a reload resumes.
  useEffect(() => {
    if (account) setDraft(loadDraft(account) ?? emptyDraft());
  }, [account]);
  useEffect(() => {
    if (account) saveDraft(account, draft);
  }, [account, draft]);

  const labels = useMemo(() => [draft.vendor, ...draft.doorways].map((x) => x.trim()).filter(Boolean), [draft]);
  const invalid = labels.filter((l) => normLabel(l) !== l);

  // Live availability, debounced.
  useEffect(() => {
    if (!account || labels.length === 0 || invalid.length) return setNames([]);
    const t = setTimeout(() => {
      fetch(`/api/onboard?owner=${account}&labels=${labels.join(",")}`)
        .then((r) => r.json())
        .then((b: { names?: NameStatus[] }) => setNames(b.names ?? []))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [account, labels.join(","), invalid.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const eth = provider();
    if (!eth || !account) return;
    createPublicClient({ transport: custom(eth) }).getBalance({ address: account }).then(setBalance).catch(() => {});
  }, [account]);

  const statusOf = (l: string) => names.find((n) => n.label === l)?.status;
  const agentsOk = draft.agents.every((a) => normLabel(a.label) === a.label && /^0x[0-9a-fA-F]{40}$/.test(a.address)) && new Set(draft.agents.map((a) => a.label)).size === draft.agents.length;
  const ready = !!account && !!draft.vendor && invalid.length === 0 && agentsOk && labels.every((l) => statusOf(l) === "available" || statusOf(l) === "yours") && new Set(labels).size === labels.length;

  async function run() {
    if (running.current || !account) return;
    running.current = true;
    try {
      // A secret per name that still needs registering, kept with the draft.
      const secrets = { ...draft.secrets };
      for (const l of labels) if (statusOf(l) === "available" && !secrets[l]) secrets[l] = randomSecret();
      const d = { ...draft, doorways: draft.doorways.map((x) => x.trim()).filter(Boolean), secrets };
      setDraft(d);
      saveDraft(account, d);
      const req: OnboardRequest = { owner: account as `0x${string}`, vendor: d.vendor, doorways: d.doorways, agents: d.agents, secrets };
      for (let round = 0; round < 12; round++) {
        setStatus({ kind: "working", text: "Reading the chain." });
        const res = await fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
        const plan = (await res.json()) as OnboardPlan;
        if (!plan.ok) throw new Error(plan.error);
        if (plan.phase === "done") {
          rememberFleet(plan.canonical);
          setStatus({ kind: "done", canonical: plan.canonical });
          return;
        }
        if (plan.phase === "wait") {
          for (let s = plan.waitSeconds ?? 5; s > 0; s--) {
            setStatus({ kind: "waiting", seconds: s });
            await new Promise((r) => setTimeout(r, 1000));
          }
          continue;
        }
        const what = plan.phase === "commit" ? "Deploying your fleet's contracts and reserving your names" : "Registering names, mounting doorways and hiring agents";
        setStatus({ kind: "working", text: `${what}: ${plan.steps.length} transactions. Confirm in your wallet.` });
        await sendBatch(plan.steps);
      }
      throw new Error("Still not finished. Press Continue to pick up where it stopped.");
    } catch (err) {
      setStatus({ kind: "error", text: walletError(err) });
    } finally {
      running.current = false;
    }
  }

  const setDoorway = (i: number, v: string) => setDraft((d) => ({ ...d, doorways: d.doorways.map((x, j) => (j === i ? v.toLowerCase() : x)) }));
  const busy = status.kind === "working" || status.kind === "waiting";
  const badge = (l: string) => {
    const s = normLabel(l) !== l ? "invalid" : statusOf(l);
    return s ? <span className={`name-badge ${s}`}>{s === "available" ? "Available" : s === "yours" ? "Yours" : s === "taken" ? "Taken" : "Not a valid name"}</span> : null;
  };

  if (status.kind === "done")
    return (
      <section className="wizard-card">
        <h1 className="page-title">{status.canonical} is live</h1>
        <p className="lede">Your agents answer under every doorway you mounted. Open the editor to run kill switches and checks on it.</p>
        <Link className="btn btn-primary btn-lg" href={`/editor?fleet=${encodeURIComponent(status.canonical)}`}>Open in editor</Link>
      </section>
    );

  return (
    <section className="wizard-card">
      <h1 className="page-title">Start your fleet</h1>
      <p className="lede">Pick a name for your fleet, the shop names it also answers under, and your first agents. Everything is signed in your wallet on Sepolia.</p>

      {!available && <p className="notice tone-orange">Install a browser wallet such as MetaMask to continue.</p>}
      {available && !account && (
        <button type="button" className="btn btn-primary" onClick={() => void connect().catch(() => {})}>Connect wallet</button>
      )}
      {account && balance !== null && balance < 10n ** 16n && (
        <p className="notice tone-orange">
          This wallet has {formatEther(balance)} Sepolia ETH. You need about 0.01 for gas. <a href={FAUCET} target="_blank" rel="noreferrer">Get some from a faucet</a>.
        </p>
      )}

      <fieldset className="wizard-group" disabled={busy || !account}>
        <legend>Your fleet</legend>
        <label className="field">
          <span className="field-label">Fleet name</span>
          <span className="field-row">
            <input value={draft.vendor} placeholder="alice" onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value.toLowerCase() }))} />
            <span className="suffix">.eth</span>
            {draft.vendor && badge(draft.vendor)}
          </span>
          {draft.vendor && <span className="hint">Agents answer at <span className="mono">name.support.{draft.vendor}.eth</span></span>}
        </label>
      </fieldset>

      <fieldset className="wizard-group" disabled={busy || !account}>
        <legend>Doorways</legend>
        <p className="hint">Extra names you register and mount the same fleet under, like a shop. Each one gets its own kill switch.</p>
        {draft.doorways.map((d, i) => (
          <span className="field-row" key={i}>
            <input value={d} placeholder={`${draft.vendor || "alice"}-shop`} onChange={(e) => setDoorway(i, e.target.value)} />
            <span className="suffix">.eth</span>
            {d && badge(d)}
            <button type="button" className="tool-btn" onClick={() => setDraft((x) => ({ ...x, doorways: x.doorways.filter((_, j) => j !== i) }))}>Remove</button>
          </span>
        ))}
        {draft.doorways.length < 2 && <button type="button" className="tool-btn" onClick={() => setDraft((x) => ({ ...x, doorways: [...x.doorways, ""] }))}>Add a doorway</button>}
      </fieldset>

      <fieldset className="wizard-group" disabled={busy || !account}>
        <legend>Agents</legend>
        {draft.agents.map((a, i) => (
          <span className="field-row" key={i}>
            <input value={a.label} placeholder="mia" onChange={(e) => setDraft((x) => ({ ...x, agents: x.agents.map((y, j) => (j === i ? { ...y, label: e.target.value.toLowerCase() } : y)) }))} />
            <input className="mono" value={a.address} onChange={(e) => setDraft((x) => ({ ...x, agents: x.agents.map((y, j) => (j === i ? { ...y, address: e.target.value.trim() as `0x${string}` } : y)) }))} />
            <button type="button" className="tool-btn" onClick={() => setDraft((x) => ({ ...x, agents: x.agents.map((y, j) => (j === i ? { ...y, address: randomAddress() } : y)) }))}>Generate</button>
            <button type="button" className="tool-btn" onClick={() => setDraft((x) => ({ ...x, agents: x.agents.filter((_, j) => j !== i) }))}>Remove</button>
          </span>
        ))}
        {draft.agents.length < 8 && <button type="button" className="tool-btn" onClick={() => setDraft((x) => ({ ...x, agents: [...x.agents, { label: "", address: randomAddress() }] }))}>Add an agent</button>}
        <p className="hint">Agents hold no roles, so a generated address is fine: its key never has to sign anything.</p>
      </fieldset>

      <div className="wizard-actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={!ready || busy} onClick={() => void run()}>
          {status.kind === "error" ? "Continue" : "Create my fleet"}
        </button>
        <p className="pb-note" aria-live="polite">
          {status.kind === "working" && status.text}
          {status.kind === "waiting" && `Names reserved. The registrar needs ${status.seconds}s before they can be registered. Keep this tab open.`}
          {status.kind === "error" && status.text}
        </p>
      </div>
    </section>
  );
}
```

  CSS (append; reuse existing tokens as in Task 7):

```css
.wizard { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
.wizard-card { display: flex; flex-direction: column; gap: 20px; }
.wizard-group { border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.wizard-group legend { font-weight: 700; padding: 0 6px; }
.wizard-group .field-row { flex-wrap: wrap; align-items: center; }
.wizard-group input { min-width: 0; flex: 1 1 140px; }
.wizard-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.suffix, .hint { color: var(--muted); }
.name-badge { font-size: 0.85em; padding: 2px 8px; border-radius: 999px; }
.name-badge.available, .name-badge.yours { color: var(--green); }
.name-badge.taken, .name-badge.invalid { color: var(--red); }
```

  (Swap `--line`, `--muted`, `--green`, `--red` for the real token names in `globals.css` `:root` if they differ.)

- [ ] **Step 3: Landing CTA** — in `app/src/app/page.tsx` (read it first; keep all other edits): the primary top-bar and hero buttons that link to `/editor` become `<Link href="/start" className="btn btn-primary …">Start your fleet</Link>`, and next to the hero one add a secondary `<Link href="/editor" className="btn …">Try the demo fleet</Link>` using the existing secondary button class in that file. Leave the preset links unchanged.

- [ ] **Step 4: Verify in the browser** — `/start` without a wallet shows the install note; with the Playwright tools, fill `alice` and see the badge request fire (network) and the layout hold at 375px width. Screenshot to the scratchpad and look at it.

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npx tsc --noEmit && cd ..
git add app/src/app/start/page.tsx app/src/components/start/StartWizard.tsx app/src/app/globals.css app/src/app/page.tsx
git commit -m "feat: /start wizard to create a self-serve fleet"
```

(If `page.tsx` has someone else's uncommitted hunks, use `git add -p app/src/app/page.tsx` and stage only your CTA hunks.)

---

### Task 9: Fork end-to-end run and docs

**Files:**
- Create: `scripts/e2e-selfserve.ts`
- Modify: `STATUS.md` (§2 map, §7 routes, §8 frontend, §9 gaps), `README.md` (a short "Create your own fleet" section)

**Interfaces:**
- Consumes: `planOnboard` (Task 4), `planAction` (Task 3), `verify` from `@fns/verifier`, `getDeployment` from `app/src/lib/deployment.server.ts`, `rpcClient`.

- [ ] **Step 1: Script** — `scripts/e2e-selfserve.ts`

```ts
// scripts/e2e-selfserve.ts — the self-serve flow end to end on an anvil fork, as a brand-new wallet.
//
//   ./scripts/fork.sh   (another terminal)
//   RPC_URL=http://127.0.0.1:8545 npx tsx scripts/e2e-selfserve.ts
//
// Plans with the same server code the app uses, signs with a fresh key, and checks verdicts with @fns/verifier.

import { createWalletClient, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verify } from "@fns/verifier";
import { planOnboard } from "../app/src/lib/onboard.server.ts";
import { planAction } from "../app/src/lib/actions.server.ts";
import { getDeployment } from "../app/src/lib/deployment.server.ts";
import { rpcClient } from "../app/src/lib/rpc.server.ts";
import type { OnboardRequest, TxStep } from "../app/src/lib/fleet-types.ts";

const RPC = process.env.RPC_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(RPC)) throw new Error("run this against a local anvil fork (RPC_URL=http://127.0.0.1:8545)");

const client = rpcClient();
const account = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account, transport: http(RPC) });
await client.request({ method: "anvil_setBalance", params: [account.address, `0x${parseEther("10").toString(16)}`] } as never);

const tag = Math.random().toString(36).slice(2, 7);
const vendor = `e2e-${tag}`;
const shop = `e2e-${tag}-shop`;
const fake = `e2e-${tag}-fake`;
const rand = () => `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
const req: OnboardRequest = {
  owner: account.address,
  vendor,
  doorways: [shop],
  agents: [{ label: "zoe", address: privateKeyToAccount(generatePrivateKey()).address }],
  secrets: { [vendor]: rand(), [shop]: rand() },
};

async function send(steps: TxStep[]) {
  for (const s of steps) {
    const hash = await wallet.sendTransaction({ to: s.to, data: s.data, chain: null });
    const r = await client.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${s.what} reverted`);
  }
}

const phases: string[] = [];
for (let i = 0; i < 10; i++) {
  const plan = await planOnboard(req);
  if (!plan.ok) throw new Error(plan.error);
  phases.push(plan.phase);
  console.log(`phase ${plan.phase}: ${plan.steps.length} steps`);
  if (plan.phase === "done") break;
  if (plan.phase === "wait") {
    // Review Focus 1: a second plan during the wait must not re-commit.
    const again = await planOnboard(req);
    if (!again.ok || again.phase !== "wait") throw new Error(`expected wait on re-plan, got ${again.ok ? again.phase : again.error}`);
    await client.request({ method: "evm_increaseTime", params: [(plan.waitSeconds ?? 60) + 2] } as never);
    await client.request({ method: "evm_mine", params: [] } as never);
    continue;
  }
  await send(plan.steps);
}
if (phases.join(",") !== "commit,wait,build,done") throw new Error(`unexpected phases ${phases.join(",")}`);

const canonical = `support.${vendor}.eth`;
const deployment = getDeployment();
async function expectVerdict(name: string, want: string) {
  const r = await verify(client, name, { deployment });
  console.log(`${name}: ${r.verdict} (${r.summary})`);
  if (r.verdict !== want) throw new Error(`${name}: expected ${want}, got ${r.verdict}`);
}

await expectVerdict(`zoe.${canonical}`, "green");
await expectVerdict(`zoe.support.${shop}.eth`, "green");

async function act(action: Parameters<typeof planAction>[0]) {
  for (let round = 0; round < 6; round++) {
    const p = await planAction({ fleet: canonical, ...action });
    if (!p.ok) throw new Error(`${action.action}: ${p.error}`);
    if (!p.steps.length) return;
    await send(p.steps);
  }
  throw new Error(`${action.action} did not finish`);
}

// Counterfeit: register a third name the same way, then mount without endorsing.
{
  const r2: OnboardRequest = { ...req, vendor: fake, doorways: [], agents: [], secrets: { [fake]: rand() } };
  // Only the name is needed: reuse the planner's name phases and ignore its fleet (a separate throwaway fleet).
  for (let i = 0; i < 10; i++) {
    const p = await planOnboard(r2);
    if (!p.ok) throw new Error(p.error);
    if (p.phase === "done") break;
    if (p.phase === "wait") {
      await client.request({ method: "evm_increaseTime", params: [(p.waitSeconds ?? 60) + 2] } as never);
      await client.request({ method: "evm_mine", params: [] } as never);
      continue;
    }
    await send(p.steps);
  }
}
await act({ action: "counterfeit", target: fake });
await expectVerdict(`zoe.support.${fake}.eth`, "red");

await act({ action: "unmount", target: shop });
await expectVerdict(`zoe.support.${shop}.eth`, "black");
await expectVerdict(`zoe.${canonical}`, "green");

await act({ action: "hire", target: "kit", address: privateKeyToAccount(generatePrivateKey()).address });
await expectVerdict(`kit.${canonical}`, "green");

await act({ action: "fire", target: "zoe" });
await expectVerdict(`zoe.${canonical}`, "black");

await act({ action: "reset" });
await expectVerdict(`zoe.support.${shop}.eth`, "green");

console.log("self-serve e2e: all checks passed");
```

  Notes: `verify()`'s option names must match `packages/verifier/src/verify.ts` (check `VerifyOptions`; `screen` is optional). The counterfeit fake name is registered through `planOnboard` as its own one-name fleet, which also mounts `support.<fake>.eth` at *its own* fleet; `counterfeit` then re-points that `support` at the e2e fleet without endorsing it. If `doorwaySteps` refuses because `support` already exists, make `mountStepsAt` use `setSubregistry` in that case (it already does for a registered entry).

- [ ] **Step 2: Run it** — needs a fork: `./scripts/fork.sh` in the background, wait for it, then `RPC_URL=http://127.0.0.1:8545 npx tsx scripts/e2e-selfserve.ts`. Expected final line: `self-serve e2e: all checks passed`. If `fork.sh` needs a Sepolia RPC it cannot reach, report that instead of skipping silently.

- [ ] **Step 3: Docs** — `STATUS.md`: add `fleet-ref.ts`, `fleet-resolve.server.ts`, `onboard.server.ts`, `/start`, `/api/onboard`, `/api/fleets`, the `fleet=` parameter and the batching behaviour to §2/§7/§8; add to §9: "Batching and the wizard have only been tested on a fork with a key signer; do one real MetaMask run on Sepolia before the demo." `README.md`: a 6-line "Create your own fleet" section (connect wallet on Sepolia, get test ETH, `/start`, pick names and agents, confirm the batches, open in editor).

- [ ] **Step 4: Full check + commit**

```bash
npx vitest run app/src/lib && (cd app && npx tsc --noEmit)
git add scripts/e2e-selfserve.ts STATUS.md README.md
git commit -m "test: fork end-to-end run of the self-serve flow; docs"
```
