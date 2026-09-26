// Verifies deployments/sepolia.json against a live chain (Sepolia or an anvil fork of it).
//
//   npx tsx scripts/check-deployment.ts
//   RPC_URL=http://127.0.0.1:8545 npx tsx scripts/check-deployment.ts
//
// For every contract: code exists, runtime code hash equals the pinned `codeHash`,
// and one representative view call (made with the pinned ABI) returns the expected value.
// Exit code 0 only if every line is OK.
//
// Unlike the other scripts, this one defaults to the PUBLIC Sepolia RPC (not the local fork),
// because its purpose is to check the pins against the real deployment.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Abi,
  type Address,
  type PublicClient,
  createPublicClient,
  http,
  isAddressEqual,
  keccak256,
  labelhash,
} from "viem";

type Entry = { address: Address; abi: string; codeHash: `0x${string}` };
type Deployment = { chainId: number; contracts: Record<string, Entry> };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentsDir = resolve(root, "deployments");
const dep: Deployment = JSON.parse(readFileSync(resolve(deploymentsDir, "sepolia.json"), "utf8"));
const entry = (name: string): Entry => {
  const e = dep.contracts[name];
  if (!e) throw new Error(`deployments/sepolia.json has no contract "${name}"`);
  return e;
};
const abiOf = (name: string): Abi =>
  JSON.parse(readFileSync(resolve(deploymentsDir, entry(name).abi), "utf8"));
const addr = (name: string): Address => entry(name).address;

const rpcUrl = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 3 }) }) as PublicClient;

const read = (name: string, functionName: string, args: unknown[] = []) =>
  client.readContract({ address: addr(name), abi: abiOf(name), functionName, args } as never) as Promise<unknown>;

const eqAddr = (want: Address) => (got: unknown) =>
  typeof got === "string" && isAddressEqual(got as Address, want);

// One representative view call per contract: [description, call, predicate].
const checks: Record<string, [string, () => Promise<unknown>, (v: unknown) => boolean]> = {
  RootRegistry: ['getSubregistry("eth") == ETHRegistry', () => read("RootRegistry", "getSubregistry", ["eth"]), eqAddr(addr("ETHRegistry"))],
  ETHRegistry: ['getParent() == (RootRegistry, "eth")', () => read("ETHRegistry", "getParent"),
    (v) => Array.isArray(v) && eqAddr(addr("RootRegistry"))(v[0]) && v[1] === "eth"],
  ETHRegistrar: ["ETH_REGISTRY() == ETHRegistry", () => read("ETHRegistrar", "ETH_REGISTRY"), eqAddr(addr("ETHRegistry"))],
  UserRegistryImpl: ["LABEL_STORE() == LabelStore", () => read("UserRegistryImpl", "LABEL_STORE"), eqAddr(addr("LabelStore"))],
  PermissionedResolverImpl: ["supportsInterface(IPermissionedResolver 0x8c2427cc)", () => read("PermissionedResolverImpl", "supportsInterface", ["0x8c2427cc"]), (v) => v === true],
  VerifiableFactory: ["proxyLogic() has code", async () => {
    const logic = (await read("VerifiableFactory", "proxyLogic")) as Address;
    return (await client.getCode({ address: logic }))?.length ?? 0;
  }, (v) => typeof v === "number" && v > 2],
  UniversalResolverV2: ["ROOT_REGISTRY() == RootRegistry", () => read("UniversalResolverV2", "ROOT_REGISTRY"), eqAddr(addr("RootRegistry"))],
  ManagedUniversalResolverProxy: ["implementation() == UniversalResolverV2", () => read("ManagedUniversalResolverProxy", "implementation"), eqAddr(addr("UniversalResolverV2"))],
  UpgradableUniversalResolverProxy: ["implementation() == ManagedUniversalResolverProxy (viem's default sepolia UR)", () => read("UpgradableUniversalResolverProxy", "implementation"), eqAddr(addr("ManagedUniversalResolverProxy"))],
  UniversalHelper: ["ROOT_REGISTRY() == RootRegistry", () => read("UniversalHelper", "ROOT_REGISTRY"), eqAddr(addr("RootRegistry"))],
  LabelStore: ['getLabel(labelhash("eth")) == "eth"', () => read("LabelStore", "getLabel", [BigInt(labelhash("eth"))]), (v) => v === "eth"],
  StandardRentPriceOracle: ["isPaymentToken(MockUSDC) == true", () => read("StandardRentPriceOracle", "isPaymentToken", [addr("MockUSDC")]), (v) => v === true],
  MockUSDC: ["decimals() == 6", () => read("MockUSDC", "decimals"), (v) => v === 6],
};

const fmt = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

let failures = 0;
const chainId = await client.getChainId();
if (chainId !== dep.chainId) {
  console.log(`FAIL chainId: RPC reports ${chainId}, deployment pins ${dep.chainId}`);
  failures++;
} else {
  console.log(`OK   chainId ${chainId} (${rpcUrl})`);
}

for (const [name, entry] of Object.entries(dep.contracts)) {
  const check = checks[name];
  try {
    const code = await client.getCode({ address: entry.address });
    if (!code || code === "0x") throw new Error("no code at address");
    const codeHash = keccak256(code);
    if (codeHash !== entry.codeHash) throw new Error(`codeHash ${codeHash} != pinned ${entry.codeHash}`);
    if (!check) throw new Error("no view-call check defined for this contract");
    const [desc, call, ok] = check;
    const v = await call();
    if (!ok(v)) throw new Error(`${desc}: got ${fmt(v)}`);
    console.log(`OK   ${name.padEnd(33)} ${entry.address}  ${desc}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name.padEnd(33)} ${entry.address}  ${(e as Error).message.split("\n")[0]}`);
  }
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log(`\nall ${Object.keys(dep.contracts).length} contracts OK`);
