// packages/verifier/src/pure.ts — network-free logic (unit-tested without a chain).

import { type Hex, hexToBytes, toHex } from "viem";
import { normalize, packetToBytes } from "viem/ens";
import type { Check, Verdict } from "./types";

/** ENSIP-15 normalize; returns null (never throws) for invalid input. */
export function safeNormalize(name: string): { ok: true; name: string } | { ok: false; error: string } {
  try {
    const n = normalize(name.trim());
    if (!n) return { ok: false, error: "empty name" };
    if (n.split(".").some((l) => l.length === 0)) return { ok: false, error: "empty label" };
    return { ok: true, name: n };
  } catch (err) {
    return { ok: false, error: (err as Error).message.split("\n")[0] ?? "normalization failed" };
  }
}

/** "mia.support.shopa.eth" -> { label: "mia", parent: "support.shopa.eth" }. Parent is "" for a single label. */
export function splitName(normalized: string): { label: string; parent: string } {
  const i = normalized.indexOf(".");
  if (i < 0) return { label: normalized, parent: "" };
  return { label: normalized.slice(0, i), parent: normalized.slice(i + 1) };
}

/** DNS wire-format encoding (what the UniversalResolver / UniversalHelper take). */
export function dnsEncode(name: string): Hex {
  if (name === "") return "0x00";
  return toHex(packetToBytes(name));
}

/** Decodes DNS wire format ("0x" or "0x00" => ""). Returns null for malformed input. */
export function dnsDecode(hex: Hex): string | null {
  const b = hexToBytes(hex);
  const labels: string[] = [];
  let i = 0;
  while (i < b.length) {
    const len = b[i]!;
    if (len === 0) return labels.join(".");
    if (i + 1 + len > b.length) return null;
    labels.push(new TextDecoder().decode(b.slice(i + 1, i + 1 + len)));
    i += 1 + len;
  }
  return labels.length === 0 ? "" : null; // missing terminator
}

/**
 * Parses text(enf.parents): split on commas, trim, drop empties, normalize each, dedupe.
 * Entries that fail ENSIP-15 are returned in `invalid` (never throws).
 */
export function parseParents(raw: string | null | undefined): { parents: string[]; invalid: string[] } {
  const parents: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const n = safeNormalize(t);
    if (!n.ok) invalid.push(t);
    else if (!parents.includes(n.name)) parents.push(n.name);
  }
  return { parents, invalid };
}

/** Parents from enf.parents plus the typed parent (deduped, typed parent last if not already listed). */
export function doorwayParents(parents: string[] | undefined, typedParent: string): string[] {
  const out = [...(parents ?? [])];
  if (typedParent && !out.includes(typedParent)) out.push(typedParent);
  return out;
}

/** Max sibling doorways verified per call (bounds fan-out from an arbitrarily long enf.parents record). */
export const MAX_DOORWAYS = 16;

/**
 * Keeps at most `max` doorway parents, always including the typed parent; returns the rest as `skipped`
 * (in enf.parents order).
 */
export function capDoorways(parents: string[], typedParent: string, max = MAX_DOORWAYS): { parents: string[]; skipped: string[] } {
  if (parents.length <= max) return { parents, skipped: [] };
  const others = parents.filter((p) => p !== typedParent);
  const hasTyped = !!typedParent && parents.includes(typedParent);
  const keepOthers = others.slice(0, hasTyped ? max - 1 : max);
  const keep = new Set(hasTyped ? [...keepOthers, typedParent] : keepOthers);
  return { parents: parents.filter((p) => keep.has(p)), skipped: parents.filter((p) => !keep.has(p)) };
}

export type AggregateInput = {
  member: boolean;
  memberDetail: string;
  hasAddress: boolean;
  checks: Check[];
};

/**
 * Verdict precedence (controller ruling 8):
 *   black  — not a member (no resolver at the leaf) / no addr / C1 or C4 fails
 *   red    — resolves but C2 (canonical registry) or C3 (two-sided consent) fails
 *   orange — C5 screening flagged
 *   green  — otherwise. C5 "unknown" leaves the verdict as ENS decides (reason is still reported).
 */
export function aggregateVerdict(a: AggregateInput): { verdict: Verdict; reasons: string[] } {
  const byId = (id: string) => a.checks.find((c) => c.id === id);
  const fmt = (c: Check) => `${c.id} ${c.title}: ${c.detail}`;

  const black: string[] = [];
  if (!a.member) black.push(a.memberDetail);
  else if (!a.hasAddress) black.push("resolver found but no addr(60) record");
  for (const id of ["C1", "C4"]) {
    const c = byId(id);
    if (c && !c.pass) black.push(fmt(c));
  }
  if (black.length) return { verdict: "black", reasons: black };

  const red = ["C2", "C3"].map(byId).filter((c): c is Check => !!c && !c.pass);
  if (red.length) return { verdict: "red", reasons: red.map(fmt) };

  const c5 = byId("C5");
  if (c5 && c5.screen === "flagged") return { verdict: "orange", reasons: [fmt(c5)] };
  if (c5 && !c5.pass) return { verdict: "green", reasons: [fmt(c5)] };
  return { verdict: "green", reasons: [] };
}

export function summarize(verdict: Verdict, parent: string | null, canonical: string | undefined, reasons: string[], checks: Check[]): string {
  switch (verdict) {
    case "green":
      return `mounted by ${parent} (canonical ${canonical})`;
    case "red": {
      const failed = checks.filter((c) => (c.id === "C2" || c.id === "C3") && !c.pass).map((c) => c.id);
      return `counterfeit mount: ${failed.join(" + ")} failed`;
    }
    case "orange":
      return "endorsed doorway, flagged counterparty";
    case "black":
      return `not a member: ${reasons[0] ?? "unknown reason"}`;
  }
}

export function fmtTime(expiry: bigint): string {
  if (expiry >= 0xffffffffffffffffn) return "never";
  return new Date(Number(expiry) * 1000).toISOString().replace(".000Z", "Z");
}
