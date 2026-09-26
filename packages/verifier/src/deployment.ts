// packages/verifier/src/deployment.ts — builds a VerifierDeployment from deployments/sepolia.json contents + ABIs.
// Browser/Next-safe (no fs). For Node, see ./node.ts loadDeployment(path).

import type { Abi, Address } from "viem";
import type { VerifierDeployment } from "./types";

export type SepoliaJson = {
  chainId: number;
  contracts: Record<string, { address: Address; abi: string }>;
};

/** ABI files the verifier needs, keyed by contract name in sepolia.json (file = deployments/abis/<name>.json). */
export const REQUIRED_ABIS = ["UniversalResolverV2", "UniversalHelper", "RootRegistry", "UserRegistryImpl"] as const;
export type RequiredAbiName = (typeof REQUIRED_ABIS)[number];

function addr(json: SepoliaJson, name: string): Address {
  const e = json.contracts[name];
  if (!e) throw new Error(`deployment has no contract "${name}"`);
  return e.address;
}

/**
 * `json` = parsed deployments/sepolia.json; `abis` = parsed deployments/abis/<name>.json for each REQUIRED_ABIS name.
 * The UR address is the one stock viem uses (UpgradableUniversalResolverProxy), called with the UniversalResolverV2 ABI.
 */
export function deploymentFromJson(json: SepoliaJson, abis: Record<RequiredAbiName, Abi>): VerifierDeployment {
  for (const n of REQUIRED_ABIS) if (!abis[n]) throw new Error(`missing ABI ${n}`);
  return {
    chainId: json.chainId,
    universalResolver: { address: addr(json, "UpgradableUniversalResolverProxy"), abi: abis.UniversalResolverV2 },
    universalHelper: { address: addr(json, "UniversalHelper"), abi: abis.UniversalHelper },
    rootRegistry: { address: addr(json, "RootRegistry"), abi: abis.RootRegistry },
    registryAbi: abis.UserRegistryImpl,
  };
}
