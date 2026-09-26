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
    return LABEL_RE.test(n) && !n.startsWith("-") && !n.endsWith("-") ? n : null;
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
