// packages/verifier/src/screen — counterparty screening adapters for check C5 ("@mount/verifier/screen").
//
// The verifier core only knows the injected `Screen` interface; everything sponsor-specific lives here.
// screenFromEnv picks, from environment variables (server side only — never ship INTERCEPTA_API_KEY to a browser):
//   INTERCEPTA_API_KEY set  -> Intercepta (W3A API); if SCREEN_FLAGGED is also set it acts as a local deny-list
//                              overlay (listed => flagged without calling the API; otherwise Intercepta decides)
//   else SCREEN_FLAGGED set -> static list (listed => flagged, otherwise clean)
//   else                    -> none (C5 omitted from results)

import type { Address } from "viem";
import type { Screen } from "../types";
import { type InterceptaScan, INTERCEPTA_PATHS, interceptaScreen } from "./intercepta";
import { parseAddressList, staticListScreen } from "./static-list";

export { interceptaScreen, INTERCEPTA_DEFAULT_BASE_URL, INTERCEPTA_PATHS, type InterceptaConfig, type InterceptaScan } from "./intercepta";
export { staticListScreen, parseAddressList } from "./static-list";

export type ScreenSource = "intercepta" | "intercepta+static-list" | "static-list" | "none";

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

export function screenFromEnv(env: ScreenEnv = process.env): ScreenSelection {
  const key = env.INTERCEPTA_API_KEY?.trim();
  const flagged = parseAddressList(env.SCREEN_FLAGGED);
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
    if (flagged.length)
      return {
        screen: withDenyList(flagged, intercepta),
        source: "intercepta+static-list",
        description: `Intercepta ${scan}-scan + ${flagged.length} address(es) in SCREEN_FLAGGED`,
      };
    return { screen: intercepta, source: "intercepta", description: `Intercepta ${scan}-scan` };
  }
  if (flagged.length)
    return { screen: staticListScreen(flagged), source: "static-list", description: `static list (${flagged.length} address(es) in SCREEN_FLAGGED)` };
  return { screen: undefined, source: "none", description: "screening not configured (set INTERCEPTA_API_KEY or SCREEN_FLAGGED)" };
}
