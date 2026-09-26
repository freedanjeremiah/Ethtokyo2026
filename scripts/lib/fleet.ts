// scripts/lib/fleet.ts
//
// Shared building blocks for MOUNT's fleet setup scripts (01..04, demo-*).
// Everything here is idempotent: each `ensure*` function reads chain state
// first and only sends the transactions needed to reach the target state.
//
// Topology (docs/ensv2-notes.md §3, global-constraints.md "Topology"):
//
//   ETHRegistry ── <parent>.eth  (resolver 0x0, subregistry = PARENT_REG)
//     PARENT_REG ── support      (resolver 0x0, subregistry = FLEET)   <- mount / unmount
//       FLEET ── mia|kai|rin     (resolver = SHARED_RESOLVER, roles 0) <- register / unregister
//   SHARED_RESOLVER default record (DNS name 0x00) holds the roster bundle.
//
// Both the fleet UserRegistry, each parent's UserRegistry and the shared
// PermissionedResolver are proxies deployed through the real VerifiableFactory
// (there is no dedicated UserRegistry factory — notes §1, Deviation 1).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Abi,
  type Address,
  type Hex,
  concat,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  keccak256,
  labelhash,
  parseAbi,
  stringToHex,
  toHex,
  zeroAddress,
} from "viem";
import { normalize, packetToBytes } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ActorLabel,
  type ActorWalletClient,
  ENV_LOCAL_PATH,
  REPO_ROOT,
  actorAccount,
  actorAddress,
  detectChainKind,
  publicClient,
  readEnvFileValue,
  requireEnv,
  upsertEnvFile,
  walletClientFor,
} from "./env.js";
import { abiOf, addressOf, contractOf } from "./deployment.js";

// ---------------------------------------------------------------- constants

/** Every role + admin role (ENS's own setup uses this; notes §2.4). */
export const ALL_ROLES = BigInt("0x" + "1".repeat(64));
/** Members get no roles at all: no setter roles, no ROLE_CAN_TRANSFER_ADMIN => soulbound (notes §2.5). */
export const MEMBER_ROLES = 0n;

export const MOUNT_LABEL = "support";

/** UserRegistry entry status values (getState/getStatus), per the real ENSv2 UserRegistry ABI. */
export const REG_STATUS_AVAILABLE = 0;
export const REG_STATUS_RESERVED = 1;
export const REG_STATUS_REGISTERED = 2;
export const CANONICAL_PARENT = "vendor";

export type Parent = { label: string; actor: ActorLabel; endorsed: boolean };
export const PARENTS: Parent[] = [
  { label: "vendor", actor: "VENDOR", endorsed: true },
  { label: "shopa", actor: "SHOPA", endorsed: true },
  { label: "shopb", actor: "SHOPB", endorsed: true },
  { label: "scam", actor: "SCAM", endorsed: false }, // counterfeit mount: not in mount.parents
];

export type Member = { label: string; actor: ActorLabel };
export const MEMBERS: Member[] = [
  { label: "mia", actor: "MIA" },
  { label: "kai", actor: "KAI" },
  { label: "rin", actor: "RIN" },
];

/** Registration period for `support` entries and members: 1 year. */
export const ENTRY_DURATION_SECONDS = 365n * 24n * 60n * 60n;

// Factory salts (CREATE2 salt = keccak256(abi.encode(msg.sender, salt)), so
// these only need to be unique per deployer).
export const SALT_FLEET = BigInt(keccak256(stringToHex("mount.fleet-registry.v1")));
export const SALT_RESOLVER = BigInt(keccak256(stringToHex("mount.shared-resolver.v1")));
export const SALT_PARENT_REGISTRY = BigInt(keccak256(stringToHex("mount.parent-registry.v1")));

// Placeholder URLs (not live services) for the ENSIP-26 agent records.
export const AGENT_CONTEXT_URL = "https://mount.example/fleet";
export const AGENT_ENDPOINT_WEB_URL = "https://mount.example/fleet/chat";

export function parentByLabel(label: string): Parent {
  const n = normalize(label);
  const p = PARENTS.find((x) => x.label === n);
  if (!p) throw new Error(`unknown parent "${label}" (expected one of ${PARENTS.map((x) => x.label).join(", ")})`);
  return p;
}

export function memberByLabel(label: string): Member {
  const n = normalize(label);
  const m = MEMBERS.find((x) => x.label === n);
  if (!m) throw new Error(`unknown member "${label}" (expected one of ${MEMBERS.map((x) => x.label).join(", ")})`);
  return m;
}

export function mountName(parentLabel: string): string {
  return normalize(`${MOUNT_LABEL}.${parentLabel}.eth`);
}

export const CANONICAL_NAME = mountName(CANONICAL_PARENT);
export const ENDORSED_PARENTS_RECORD = PARENTS.filter((p) => p.endorsed)
  .map((p) => mountName(p.label))
  .join(",");

/** labelhash as the uint256 `anyId` PermissionedRegistry accepts. */
export function labelId(label: string): bigint {
  return BigInt(labelhash(normalize(label)));
}

/** DNS wire-format encoding of a name (the PermissionedResolver setters take this). `""` => 0x00 (default record). */
export function dnsEncode(name: string): Hex {
  if (name === "") return "0x00";
  return toHex(packetToBytes(normalize(name)));
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// ---------------------------------------------------------------- tx helper

type WriteArgs = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/** Simulates (for a readable revert), sends, and waits for a successful receipt. */
export async function send(wallet: ActorWalletClient, what: string, call: WriteArgs): Promise<Hex> {
  const { request } = await publicClient.simulateContract({ ...call, account: wallet.account } as never);
  const hash = await wallet.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what}: tx ${hash} reverted`);
  console.log(`    tx ${what}: ${hash} (gas ${receipt.gasUsed})`);
  return hash;
}

async function hasCode(address: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address });
  return !!code && code !== "0x";
}

async function nowSeconds(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}

// ---------------------------------------------------------------- fleet file

export type FleetFile = {
  chainId: number;
  chainKind: "anvil" | "live";
  updatedAt: string;
  fleetRegistry: Address;
  sharedResolver: Address;
  parentRegistries: Record<string, Address>;
  canonicalName: string;
  mountLabel: string;
  members: Record<string, Address>;
  operator: Address;
  vendor: Address;
  settlementAddress?: Address;
};

/** Anvil forks also report chainId 11155111, so they get their own gitignored file. */
export async function fleetFilePath(): Promise<string> {
  const kind = await detectChainKind();
  const chainId = await publicClient.getChainId();
  return resolve(REPO_ROOT, "deployments", kind === "anvil" ? "fleet.anvil.json" : `fleet.${chainId}.json`);
}

export async function readFleetFile(): Promise<Partial<FleetFile>> {
  const path = await fleetFilePath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Partial<FleetFile>;
}

export async function updateFleetFile(patch: Partial<FleetFile>): Promise<string> {
  const path = await fleetFilePath();
  const current = await readFleetFile();
  const merged = {
    ...current,
    ...patch,
    parentRegistries: { ...(current.parentRegistries ?? {}), ...(patch.parentRegistries ?? {}) },
    chainId: await publicClient.getChainId(),
    chainKind: await detectChainKind(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  return path;
}

/** Reads the fleet registry + shared resolver addresses (written by 01-deploy-fleet), verifying they exist on this chain. */
export async function loadFleet(): Promise<{ fleetRegistry: Address; sharedResolver: Address }> {
  const f = await readFleetFile();
  const path = await fleetFilePath();
  if (!f.fleetRegistry || !f.sharedResolver) throw new Error(`${path} missing fleet addresses — run 01-deploy-fleet.ts`);
  if (!(await hasCode(f.fleetRegistry)) || !(await hasCode(f.sharedResolver)))
    throw new Error(`${path} points at addresses with no code on this chain (stale fork?) — rerun setup-all.ts`);
  return { fleetRegistry: f.fleetRegistry, sharedResolver: f.sharedResolver };
}

// ---------------------------------------------------------------- factory

/**
 * Deploys a proxy of `implName` through VerifiableFactory, or returns the
 * existing one. `known` is a previously recorded address (fleet file / chain
 * discovery); it is reused only if the factory verifies it as a proxy of the
 * expected implementation.
 */
async function ensureFactoryProxy(
  wallet: ActorWalletClient,
  what: string,
  implName: "UserRegistryImpl" | "PermissionedResolverImpl",
  salt: bigint,
  initData: Hex,
  known: Address | undefined,
): Promise<{ address: Address; status: "exists" | "deployed" }> {
  const factory = contractOf("VerifiableFactory");
  const impl = addressOf(implName);
  if (known && known !== zeroAddress && (await hasCode(known))) {
    const verified = (await publicClient
      .readContract({ ...factory, functionName: "verifyContract", args: [known] })
      .catch(() => zeroAddress)) as Address;
    if (same(verified, impl)) return { address: getAddress(known), status: "exists" };
  }
  // Predict the CREATE2 address by simulating the exact call.
  let predicted: Address;
  try {
    const sim = await publicClient.simulateContract({
      ...factory,
      functionName: "deployProxy",
      args: [impl, salt, initData],
      account: wallet.account,
    });
    predicted = sim.result as Address;
  } catch (err) {
    throw new Error(
      `${what}: deployProxy simulation failed — a proxy with this salt probably already exists for ` +
        `${wallet.account.address} but its address was not recorded. (${(err as Error).message.split("\n")[0]})`,
    );
  }
  await send(wallet, `${what} deployProxy`, { ...factory, functionName: "deployProxy", args: [impl, salt, initData] });
  if (!(await hasCode(predicted))) throw new Error(`${what}: no code at predicted proxy ${predicted}`);
  return { address: predicted, status: "deployed" };
}

function userRegistryInit(owner: Address): Hex {
  return encodeFunctionData({
    abi: abiOf("UserRegistryImpl"),
    functionName: "initialize",
    args: [[{ account: owner, roleBitmap: ALL_ROLES }]],
  });
}

function resolverInit(operator: Address): Hex {
  return encodeFunctionData({
    abi: abiOf("PermissionedResolverImpl"),
    functionName: "initialize",
    args: [[{ account: operator, roleBitmap: ALL_ROLES }], []],
  });
}

/** Fleet UserRegistry, owned (all root roles) by the vendor. */
export async function ensureFleetRegistry(known?: Address) {
  const vendor = walletClientFor(actorAccount("VENDOR"));
  // Chain discovery fallback: whatever vendor's `support` currently points at.
  let candidate = known;
  if (!candidate) {
    const vendorReg = await getParentRegistry("vendor");
    if (vendorReg !== zeroAddress)
      candidate = (await publicClient.readContract({
        address: vendorReg,
        abi: abiOf("UserRegistryImpl"),
        functionName: "getSubregistry",
        args: [MOUNT_LABEL],
      })) as Address;
  }
  return ensureFactoryProxy(vendor, "fleet registry", "UserRegistryImpl", SALT_FLEET, userRegistryInit(vendor.account.address), candidate);
}

/** Shared PermissionedResolver: operator holds every role; nobody else holds any. */
export async function ensureSharedResolver(known?: Address) {
  const operator = walletClientFor(actorAccount("OPERATOR"));
  return ensureFactoryProxy(
    operator,
    "shared resolver",
    "PermissionedResolverImpl",
    SALT_RESOLVER,
    resolverInit(operator.account.address),
    known,
  );
}

// ---------------------------------------------------------------- parents

const ethRegistry = () => contractOf("ETHRegistry");
const userRegistryAbi = () => abiOf("UserRegistryImpl");

export async function getParentRegistry(parentLabel: string): Promise<Address> {
  return (await publicClient.readContract({
    ...ethRegistry(),
    functionName: "getSubregistry",
    args: [normalize(parentLabel)],
  })) as Address;
}

/**
 * Ensures `<parent>.eth` has its own UserRegistry as subregistry and
 * resolver 0x0 (no wildcard resolver above the members — notes §5).
 */
export async function ensureParentRegistry(parent: Parent): Promise<Address> {
  const wallet = walletClientFor(actorAccount(parent.actor));
  const label = normalize(parent.label);
  const owner = (await publicClient.readContract({ ...ethRegistry(), functionName: "findOwner", args: [label] })) as Address;
  if (!same(owner, wallet.account.address))
    throw new Error(`${label}.eth owner is ${owner}, expected ${parent.actor} — run setup-names.ts`);

  const current = await getParentRegistry(label);
  const { address: reg, status } = await ensureFactoryProxy(
    wallet,
    `${label}.eth registry`,
    "UserRegistryImpl",
    SALT_PARENT_REGISTRY,
    userRegistryInit(wallet.account.address),
    current,
  );
  console.log(`  ${label}.eth registry ${reg} (${status})`);
  if (!same(current, reg)) {
    await send(wallet, `ETHRegistry.setSubregistry(${label}, reg)`, {
      ...ethRegistry(),
      functionName: "setSubregistry",
      args: [labelId(label), reg],
    });
  }
  const resolver = (await publicClient.readContract({ ...ethRegistry(), functionName: "getResolver", args: [label] })) as Address;
  if (resolver !== zeroAddress) {
    await send(wallet, `ETHRegistry.setResolver(${label}, 0x0)`, {
      ...ethRegistry(),
      functionName: "setResolver",
      args: [labelId(label), zeroAddress],
    });
  }
  return reg;
}

/**
 * Ensures `support.<parent>.eth` exists in the parent's registry, owned by
 * the parent, with resolver 0x0 and subregistry = `target` (the fleet to
 * mount, or 0x0 to leave unmounted). Returns what changed.
 */
export async function ensureMount(parent: Parent, target: Address): Promise<string> {
  const wallet = walletClientFor(actorAccount(parent.actor));
  const reg = await getParentRegistry(parent.label);
  if (reg === zeroAddress) throw new Error(`${parent.label}.eth has no registry — run 02-mount.ts`);
  const c = { address: reg, abi: userRegistryAbi() };
  const name = mountName(parent.label);
  const state = (await publicClient.readContract({ ...c, functionName: "getState", args: [labelId(MOUNT_LABEL)] })) as {
    status: number;
  };
  const actions: string[] = [];
  if (state.status !== REG_STATUS_REGISTERED) {
    const expiry = (await nowSeconds()) + ENTRY_DURATION_SECONDS;
    await send(wallet, `register ${name}`, {
      ...c,
      functionName: "register",
      args: [MOUNT_LABEL, wallet.account.address, target, zeroAddress, ALL_ROLES, expiry],
    });
    actions.push("registered");
  } else {
    const sub = (await publicClient.readContract({ ...c, functionName: "getSubregistry", args: [MOUNT_LABEL] })) as Address;
    if (!same(sub, target)) {
      await send(wallet, `setSubregistry(${name}, ${target})`, {
        ...c,
        functionName: "setSubregistry",
        args: [labelId(MOUNT_LABEL), target],
      });
      actions.push(target === zeroAddress ? "unmounted" : "mounted");
    }
  }
  const resolver = (await publicClient.readContract({ ...c, functionName: "getResolver", args: [MOUNT_LABEL] })) as Address;
  if (resolver !== zeroAddress) {
    await send(wallet, `setResolver(${name}, 0x0)`, { ...c, functionName: "setResolver", args: [labelId(MOUNT_LABEL), zeroAddress] });
    actions.push("resolver cleared");
  }
  return actions.length ? actions.join(", ") : "ok (no change)";
}

/** Canonical back-pointers: FLEET -> (vendorReg, "support"), vendorReg -> (ETHRegistry, "vendor"). Never toward shopa/shopb/scam. */
export async function ensureCanonicalParents(fleet: Address): Promise<void> {
  const vendor = walletClientFor(actorAccount("VENDOR"));
  const vendorReg = await getParentRegistry(CANONICAL_PARENT);
  const pairs: { reg: Address; parent: Address; label: string; what: string }[] = [
    { reg: vendorReg, parent: addressOf("ETHRegistry"), label: CANONICAL_PARENT, what: "vendor registry" },
    { reg: fleet, parent: vendorReg, label: MOUNT_LABEL, what: "fleet registry" },
  ];
  for (const p of pairs) {
    const [cur, curLabel] = (await publicClient.readContract({
      address: p.reg,
      abi: userRegistryAbi(),
      functionName: "getParent",
    })) as [Address, string];
    if (same(cur, p.parent) && curLabel === p.label) {
      console.log(`  ${p.what}.getParent() = (${cur}, "${curLabel}") ok`);
      continue;
    }
    await send(vendor, `${p.what}.setParent(${p.parent}, "${p.label}")`, {
      address: p.reg,
      abi: userRegistryAbi(),
      functionName: "setParent",
      args: [p.parent, p.label],
    });
  }
}

// ---------------------------------------------------------------- members

/**
 * Ensures `<label>` is registered in the fleet, owned by the agent key, with
 * resolver = shared resolver and no roles. tokenIds are never cached — they
 * change on every (re-)registration.
 */
export async function ensureMember(member: Member, fleet: Address, sharedResolver: Address): Promise<string> {
  const vendor = walletClientFor(actorAccount("VENDOR"));
  const agent = actorAddress(member.actor);
  const label = normalize(member.label);
  const c = { address: fleet, abi: userRegistryAbi() };
  const state = (await publicClient.readContract({ ...c, functionName: "getState", args: [labelId(label)] })) as {
    status: number;
    latestOwner: Address;
    tokenId: bigint;
  };
  if (state.status === REG_STATUS_REGISTERED) {
    if (!same(state.latestOwner, agent))
      throw new Error(`${label} is registered to ${state.latestOwner}, expected ${member.actor} ${agent} — refusing to touch it`);
    const resolver = (await publicClient.readContract({ ...c, functionName: "getResolver", args: [label] })) as Address;
    if (!same(resolver, sharedResolver)) {
      await send(vendor, `setResolver(${label}, shared)`, { ...c, functionName: "setResolver", args: [labelId(label), sharedResolver] });
      return "resolver fixed";
    }
    return `ok (tokenId ${state.tokenId})`;
  }
  if (state.status === REG_STATUS_RESERVED) throw new Error(`${label} is RESERVED in the fleet; refusing to guess`);
  const expiry = (await nowSeconds()) + ENTRY_DURATION_SECONDS;
  await send(vendor, `register ${label}`, {
    ...c,
    functionName: "register",
    args: [label, agent, zeroAddress, sharedResolver, MEMBER_ROLES, expiry],
  });
  const tokenId = (await publicClient.readContract({ ...c, functionName: "getTokenId", args: [labelId(label)] })) as bigint;
  return `registered (tokenId ${tokenId})`;
}

// ---------------------------------------------------------------- records

/** Domain separator for deriving the default settlement key from the operator key. */
export const SETTLEMENT_DERIVATION_TAG = "mount.settlement.v1";

/**
 * Default settlement key, derived deterministically from the operator key:
 * keccak256(OPERATOR_PK || "mount.settlement.v1"). Losing .env.local therefore
 * never changes addr(60), and the key (hence any funds) is always recoverable
 * from OPERATOR_PK.
 */
export function deriveSettlementKey(): Hex {
  const operatorPk = requireEnv("OPERATOR_PK") as Hex;
  return keccak256(concat([operatorPk, stringToHex(SETTLEMENT_DERIVATION_TAG)]));
}

/**
 * SETTLEMENT_ADDRESS if explicitly set (env / .env.local); otherwise the
 * operator-derived address, stored with its key (SETTLEMENT_PK) in .env.local.
 */
export function ensureSettlementAddress(): Address {
  const fromEnv = process.env.SETTLEMENT_ADDRESS || readEnvFileValue(ENV_LOCAL_PATH, "SETTLEMENT_ADDRESS");
  if (fromEnv) return getAddress(fromEnv);
  const pk = deriveSettlementKey();
  const addr = privateKeyToAccount(pk).address;
  upsertEnvFile(ENV_LOCAL_PATH, { SETTLEMENT_ADDRESS: addr, SETTLEMENT_PK: pk });
  process.env.SETTLEMENT_ADDRESS = addr;
  console.log(`  derived SETTLEMENT_ADDRESS=${addr} from OPERATOR_PK (address + SETTLEMENT_PK stored in .env.local)`);
  return addr;
}

const readAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
]);

/** Reads a record straight from the resolver's default record (name 0x00) via its ENSIP-10 resolve(). */
async function readDefault(resolver: Address, fn: "text" | "addr", arg: string | bigint): Promise<string> {
  const zeroNode = `0x${"00".repeat(32)}` as Hex;
  const data =
    fn === "text"
      ? encodeFunctionData({ abi: readAbi, functionName: "text", args: [zeroNode, arg as string] })
      : encodeFunctionData({ abi: readAbi, functionName: "addr", args: [zeroNode, arg as bigint] });
  const raw = (await publicClient.readContract({
    address: resolver,
    abi: abiOf("PermissionedResolverImpl"),
    functionName: "resolve",
    args: ["0x00", data],
  })) as Hex;
  return decodeFunctionResult({ abi: readAbi, functionName: fn, data: raw }) as string;
}

export type RosterRecords = { settlement: Address; texts: Record<string, string> };

export function rosterRecords(settlement: Address): RosterRecords {
  return {
    settlement,
    texts: {
      "mount.canonical": CANONICAL_NAME,
      "mount.parents": ENDORSED_PARENTS_RECORD,
      "agent-context": AGENT_CONTEXT_URL,
      "agent-endpoint[web]": AGENT_ENDPOINT_WEB_URL,
    },
  };
}

/** Operator writes only the differing default-record (0x00) entries, in a single multicall. */
export async function ensureDefaultRecords(sharedResolver: Address, want: RosterRecords): Promise<string[]> {
  const operator = walletClientFor(actorAccount("OPERATOR"));
  const abi = abiOf("PermissionedResolverImpl");
  const calls: Hex[] = [];
  const changed: string[] = [];
  const curAddr = (await readDefault(sharedResolver, "addr", 60n)) as Hex;
  if (!same(curAddr, want.settlement)) {
    calls.push(encodeFunctionData({ abi, functionName: "setAddress", args: ["0x00", 60n, want.settlement] }));
    changed.push(`addr(60) ${curAddr || "(unset)"} -> ${want.settlement}`);
  }
  for (const [key, value] of Object.entries(want.texts)) {
    const cur = await readDefault(sharedResolver, "text", key);
    if (cur !== value) {
      calls.push(encodeFunctionData({ abi, functionName: "setText", args: ["0x00", key, value] }));
      changed.push(`text(${key}) "${cur}" -> "${value}"`);
    }
  }
  if (calls.length) {
    await send(operator, `resolver.multicall(${calls.length} default-record writes)`, {
      address: sharedResolver,
      abi,
      functionName: "multicall",
      args: [calls],
    });
  }
  return changed;
}

// ---------------------------------------------------------------- screening demo (Task 8)

/** Domain separator for the demo's "dirty" settlement address (never funded, never used to sign). */
export const DIRTY_SETTLEMENT_DERIVATION_TAG = "mount.dirty-settlement.v1";

/**
 * The demo's flagged settlement address, derived deterministically from the operator key:
 * address(keccak256(OPERATOR_PK || "mount.dirty-settlement.v1")). Also makes sure .env.local has
 * DIRTY_SETTLEMENT_ADDRESS and that SCREEN_FLAGGED contains it (other entries are kept), so the
 * static-list screen (packages/verifier/src/screen) flags it.
 */
export function ensureDirtySettlementAddress(): Address {
  const operatorPk = requireEnv("OPERATOR_PK") as Hex;
  const dirty = privateKeyToAccount(keccak256(concat([operatorPk, stringToHex(DIRTY_SETTLEMENT_DERIVATION_TAG)]))).address;
  const current = readEnvFileValue(ENV_LOCAL_PATH, "SCREEN_FLAGGED") ?? "";
  const list = current.split(/[\s,]+/).filter(Boolean);
  const updates: Record<string, string> = {};
  if (readEnvFileValue(ENV_LOCAL_PATH, "DIRTY_SETTLEMENT_ADDRESS") !== dirty) updates.DIRTY_SETTLEMENT_ADDRESS = dirty;
  if (!list.some((a) => same(a, dirty))) updates.SCREEN_FLAGGED = [...list, dirty].join(",");
  if (Object.keys(updates).length) {
    upsertEnvFile(ENV_LOCAL_PATH, updates);
    console.log(`  .env.local: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }
  process.env.DIRTY_SETTLEMENT_ADDRESS = dirty;
  process.env.SCREEN_FLAGGED = updates.SCREEN_FLAGGED ?? current;
  return dirty;
}

/** Operator points the fleet's default addr(60) at `settlement` (one multicall, only if it differs). */
export async function setDefaultSettlement(settlement: Address): Promise<string[]> {
  const { sharedResolver } = await loadFleet();
  return ensureDefaultRecords(sharedResolver, rosterRecords(settlement));
}
