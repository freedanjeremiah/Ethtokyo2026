// packages/verifier/src/types.ts — the public result shape (consumed by the UI, Task 7, and screening, Task 8).

import type { Abi, Address } from "viem";

export type Verdict = "green" | "red" | "orange" | "black";

export type CheckId = "C1" | "C2" | "C3" | "C4" | "C5";

export type ScreenStatus = "clean" | "flagged" | "unknown";

export type ScreenResult = { status: ScreenStatus; reason?: string };

/** Optional injected counterparty screen (Intercepta, Task 8). Absent => C5 is omitted, not failed. */
export type Screen = (address: Address) => Promise<ScreenResult>;

export type Check = {
  id: CheckId;
  /** Short human title, e.g. "member token alive". */
  title: string;
  pass: boolean;
  /** Why it passed / failed, with the on-chain values that decided it. */
  detail: string;
  /** Only on C5: the raw screening status ("unknown" => pass:false but does not change the verdict). */
  screen?: ScreenStatus;
  /** Only on C5: the screen's own reason string, verbatim (absent if the screen gave none). */
  screenReason?: string;
};

export type Membership = {
  /** True only if the UniversalResolver finds a resolver AT THE LEAF (offset 0), never inherited. */
  member: boolean;
  /** Resolver returned by UR.findResolver (zero address if none). */
  resolver: Address | null;
  /** Byte offset into the DNS-encoded name where the resolver was found (0 = the name itself). */
  offset: number | null;
  detail: string;
};

export type Resolved = {
  /** addr(60) — the fleet settlement address. */
  address?: Address;
  /** text(enf.canonical), normalized. */
  canonical?: string;
  /** text(enf.parents), split on commas, trimmed, normalized. */
  parents?: string[];
  /** ENSIP-26 text(agent-context). */
  agentContext?: string;
  /** ENSIP-26 text(agent-endpoint[web]). */
  agentEndpointWeb?: string;
};

export type Registries = {
  /** R_doorway = subregistry of the typed parent (e.g. support.shopa.eth), found by walking from the RootRegistry. */
  doorway: Address | null;
  /** R_canonical = UniversalHelper.findExactRegistry(enf.canonical). */
  canonical: Address | null;
  /** UniversalHelper.findCanonicalName(R_doorway), decoded (null if none). */
  canonicalNameOfDoorway: string | null;
};

export type VerifyCore = {
  /** Exactly what the caller passed. */
  input: string;
  /** ENSIP-15 normalized name, or null if the input is not a valid name. */
  normalized: string | null;
  /** First label (e.g. "mia"); null if invalid. */
  label: string | null;
  /** Typed parent = everything after the first label (e.g. "support.shopa.eth"); null if invalid. */
  parent: string | null;
  verdict: Verdict;
  /** One-line human summary of the verdict. */
  summary: string;
  /** Why the verdict is not green (empty when green with nothing to note). */
  reasons: string[];
  membership: Membership;
  /** C1..C4 always (in order) for a valid name; C5 only when a screen was injected and an address resolved. */
  checks: Check[];
  resolved: Resolved;
  registries: Registries;
  /** Block all reads were pinned to. */
  blockNumber: string | null;
};

export type DoorwayResult = VerifyCore & {
  /** True for the doorway the caller actually typed (same object data as the top-level result). */
  isInput: boolean;
};

export type VerifyResult = VerifyCore & {
  /** For each name in enf.parents plus the typed parent (deduped): the verdict for `<label>.<parent>`. */
  doorways: DoorwayResult[];
  /**
   * Parent names from enf.parents NOT verified because of the fan-out cap (MAX_DOORWAYS = 16, typed parent
   * always kept). Usually empty.
   */
  doorwaysSkipped: string[];
};

export type ContractRef = { address: Address; abi: Abi };

/** Addresses + ABIs the verifier reads. Built from deployments/sepolia.json + deployments/abis (never hardcoded). */
export type VerifierDeployment = {
  chainId: number;
  /** UR the stock client path uses (UpgradableUniversalResolverProxy) with the UniversalResolverV2 ABI. */
  universalResolver: ContractRef;
  universalHelper: ContractRef;
  rootRegistry: ContractRef;
  /** PermissionedRegistry ABI used for every registry on the walk (UserRegistryImpl ABI). */
  registryAbi: Abi;
};

export type VerifyOptions = {
  deployment: VerifierDeployment;
  screen?: Screen;
  /** Compute sibling doorways (default true). Doorways themselves are always computed without doorways. */
  doorways?: boolean;
  /** Pin every read to this block (default: latest). Lets callers verify many names against one block. */
  blockNumber?: bigint;
};
