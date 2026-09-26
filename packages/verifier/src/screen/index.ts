// packages/verifier/src/screen — counterparty screening adapters for check C5 ("@fns/verifier/screen").
//
// The verifier core only knows the injected `Screen` interface; everything sponsor-specific lives here.
// screenFromEnv combines, from environment variables (server side only — never ship INTERCEPTA_API_KEY to a browser):
//   Chainalysis sanctions oracle  on by default (keyless, real OFAC data); SCREEN_SANCTIONS=off disables,
//                                 SANCTIONS_RPC_URL picks the mainnet RPC it is read through
//   Intercepta (W3A API)          when INTERCEPTA_API_KEY is set
//   SCREEN_FLAGGED                optional local deny-list overlay (listed => flagged without calling anything)
// Several screens combine as: any flagged => flagged; else any unknown => unknown; else clean.
// With nothing enabled the screen is omitted and C5 is left out of results.

import type { Address } from "viem";
import type { Screen } from "../types";
import { type InterceptaScan, INTERCEPTA_PATHS, interceptaScreen } from "./intercepta";
import { SANCTIONS_DEFAULT_RPC_URL, sanctionsOracleScreen } from "./sanctions-oracle";
import { parseAddressList, staticListScreen } from "./static-list";

export { interceptaScreen, INTERCEPTA_DEFAULT_BASE_URL, INTERCEPTA_PATHS, type InterceptaConfig, type InterceptaScan } from "./intercepta";
export { staticListScreen, parseAddressList } from "./static-list";
export {
  sanctionsOracleScreen,
  CHAINALYSIS_SANCTIONS_ORACLE,
  SANCTIONS_DEFAULT_RPC_URL,
  type SanctionsOracleConfig,
} from "./sanctions-oracle";

/** "+"-joined active sources, e.g. "intercepta+sanctions-oracle", "sanctions-oracle+static-list", or "none". */
export type ScreenSource = string;

export type ScreenSelection = {
  screen: Screen | undefined;
  source: ScreenSource;
  /** Human description, safe to show in a UI (never contains the key). */
  description: string;
};

export type ScreenEnv = Record<string, string | undefined>;

function num(env: ScreenEnv, key: string): number | undefined {
  const raw = env[key]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key}: "${raw}" is not a non-negative number`);
  return n;
}

/** Deny-list first (no network), then the fallback screen. */
export function withDenyList(flagged: readonly Address[], fallback: Screen): Screen {
  const list = staticListScreen(flagged);
  return async (address) => {
    const r = await list(address);
    return r.status === "flagged" ? r : fallback(address);
  };
}

/** Runs every screen; any flagged => flagged, else any unknown => unknown, else clean (reasons joined). */
export function combineScreens(screens: readonly Screen[]): Screen {
  if (screens.length === 1) return screens[0]!;
  return async (address) => {
    const rs = await Promise.all(screens.map((s) => s(address)));
    const flagged = rs.find((r) => r.status === "flagged");
    if (flagged) return flagged;
    const unknown = rs.find((r) => r.status === "unknown");
    if (unknown) return unknown;
    return { status: "clean", reason: rs.map((r) => r.reason).filter(Boolean).join("; ") };
  };
}

export function screenFromEnv(env: ScreenEnv = process.env): ScreenSelection {
  const key = env.INTERCEPTA_API_KEY?.trim();
  const flagged = parseAddressList(env.SCREEN_FLAGGED);
  const sanctionsRaw = (env.SCREEN_SANCTIONS?.trim() || "on").toLowerCase();
  if (sanctionsRaw !== "on" && sanctionsRaw !== "off") throw new Error(`SCREEN_SANCTIONS: "${env.SCREEN_SANCTIONS}" must be "on" or "off"`);

  const screens: Screen[] = [];
  const sources: string[] = [];
  const parts: string[] = [];
  if (key) {
    const rawScan = env.INTERCEPTA_SCAN?.trim() || "quick";
    if (!(rawScan in INTERCEPTA_PATHS)) throw new Error(`INTERCEPTA_SCAN: "${rawScan}" must be "quick" or "deep"`);
    const scan = rawScan as InterceptaScan;
    const intercepta = interceptaScreen({
      apiKey: key,
      baseUrl: env.INTERCEPTA_BASE_URL?.trim() || undefined,
      scan,
      flagAt: num(env, "INTERCEPTA_FLAG_AT"),
      timeoutMs: num(env, "INTERCEPTA_TIMEOUT_MS"),
      cacheTtlMs: num(env, "INTERCEPTA_CACHE_TTL_MS"),
    });
    screens.push(intercepta);
    sources.push("intercepta");
    parts.push(`Intercepta ${scan}-scan`);
  }
  if (sanctionsRaw === "on") {
    screens.push(sanctionsOracleScreen({ rpcUrl: env.SANCTIONS_RPC_URL?.trim() || SANCTIONS_DEFAULT_RPC_URL }));
    sources.push("sanctions-oracle");
    parts.push("OFAC sanctions list (Chainalysis oracle)");
  }
  if (flagged.length) {
    sources.push("static-list");
    parts.push(`${flagged.length} address(es) in SCREEN_FLAGGED`);
  }
  if (!sources.length) return { screen: undefined, source: "none", description: "screening off (SCREEN_SANCTIONS=off and no INTERCEPTA_API_KEY or SCREEN_FLAGGED)" };
  const base = screens.length ? combineScreens(screens) : undefined;
  const screen = flagged.length ? (base ? withDenyList(flagged, base) : staticListScreen(flagged)) : base!;
  return { screen, source: sources.join("+"), description: parts.join(" + ") };
}
