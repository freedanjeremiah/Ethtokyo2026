// Shared (client + server) shape of GET /api/fleet. Types only — safe to import from client components.
import type { Verdict } from "@fns/verifier";

/** One place the fleet registry is (or was) mounted, found from SubregistryUpdated logs — never from config. */
export type FleetDoorway = {
  /** e.g. "support.shopa.eth"; null if the registry's own name could not be recovered from chain. */
  name: string | null;
  /** Registry that holds the `support` entry (e.g. shopa.eth's UserRegistry). */
  registry: string;
  /** Mount label inside that registry (e.g. "support"). */
  label: string;
  /** True if registry.getSubregistry(label) still points at the fleet at the scanned block. */
  mounted: boolean;
  /** True if listed in the fleet's own enf.parents record. */
  declared: boolean;
  /** True if this is the fleet's enf.canonical name. */
  canonical: boolean;
  /** true only when found on chain (false = declared in enf.parents but never mounted). */
  discovered: boolean;
};

/** One agent ever registered in the fleet registry (from LabelRegistered logs). */
export type FleetAgent = {
  label: string;
  /** REGISTERED and not expired at the scanned block. */
  active: boolean;
};

export type FleetCell = {
  agent: string;
  doorway: string;
  /** "<agent>.<doorway>" */
  name: string;
  verdict: Verdict;
  summary: string;
  /** Failed check ids (e.g. ["C2","C3"]). */
  failed: string[];
};

export type FleetEventKind = "hire" | "fire" | "mount" | "unmount" | "settlement" | "record";

export type FleetEvent = {
  block: string;
  /** Unix seconds. */
  timestamp: number;
  kind: FleetEventKind;
  text: string;
  tx: string;
};

export type FleetScan = {
  blockNumber: string;
  timestamp: number;
  fleetRegistry: string;
  sharedResolver: string | null;
  canonical: string | null;
  settlement: { address: string | null; screen: "clean" | "flagged" | "unknown" | "off" | null; reason?: string };
  doorways: FleetDoorway[];
  agents: FleetAgent[];
  cells: FleetCell[];
  events: FleetEvent[];
  stats: {
    mountsDiscovered: number;
    mountsLive: number;
    endorsed: number;
    counterfeit: number;
    agentsActive: number;
    agentsTotal: number;
    cellsGreen: number;
    cellsTotal: number;
  };
  /** Lowest block the log scan covered. */
  scannedFrom: string;
};

export type ActionName = "unmount" | "fire" | "dirty" | "clean" | "reset" | "counterfeit";

export type ActionsInfo = {
  enabled: boolean;
  /** Why the kill switches are disabled (live chain, production build, ...). */
  reason?: string;
  /** Allowed targets, from the fleet file (never free text). */
  parents: string[];
  agents: string[];
  /** Which chain the buttons act on; null when disabled. */
  chain: "anvil" | "live" | null;
};

/** One unsigned transaction the browser wallet sends. `from` is the only address allowed to sign it. */
export type TxStep = { what: string; signer: string; from: `0x${string}`; to: `0x${string}`; data: `0x${string}` };

/** The transactions an action still needs (empty when there is nothing to do), or why it cannot run. */
export type ActionPlan = { ok: true; steps: TxStep[] } | { ok: false; error: string };

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
