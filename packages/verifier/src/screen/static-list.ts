// packages/verifier/src/screen/static-list.ts — demo/offline counterparty screen.
//
// Flags exactly the addresses listed in SCREEN_FLAGGED (comma / whitespace separated).
// Used for the MOUNT demo on a Sepolia fork (Intercepta's data covers mainnets, not a
// freshly derived test address), and as a local deny-list overlay on top of Intercepta.

import { type Address, getAddress, isAddress } from "viem";
import type { Screen } from "../types";

/** Parses a SCREEN_FLAGGED-style list. Throws on any entry that is not an address (config errors are loud). */
export function parseAddressList(raw: string | undefined): Address[] {
  const out: Address[] = [];
  for (const part of (raw ?? "").split(/[\s,]+/)) {
    const t = part.trim();
    if (!t) continue;
    if (!isAddress(t, { strict: false })) throw new Error(`SCREEN_FLAGGED: "${t}" is not an address`);
    const a = getAddress(t);
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

/** listed => flagged; otherwise clean. Never throws, never "unknown". */
export function staticListScreen(flagged: readonly string[]): Screen {
  const set = new Set(flagged.map((a) => getAddress(a)));
  return async (address) => {
    const a = getAddress(address);
    return set.has(a)
      ? { status: "flagged", reason: "listed in SCREEN_FLAGGED (static list)" }
      : { status: "clean", reason: "not in SCREEN_FLAGGED (static list)" };
  };
}
