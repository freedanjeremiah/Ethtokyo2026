// packages/verifier/src/screen/intercepta.ts — Intercepta (W3A API) counterparty screen. SERVER-SIDE ONLY.
//
// Built against Intercepta's published OpenAPI docs (docs.web3antivirus.io, fetched 2026-09-26):
//   Quick Scan Address  GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan
//   Deep Scan Address   GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/toxic-score
//   auth: apiKey in header "X-API-KEY"
//   200 body (ToxicScoreShortResponseV2): { toxicScore: number, traits: [{ risk: number, name: string, txsCount: number, description: string }] }
//   a wrong key answers 403 {"status":403,"response":"This authentication key is incorrect or doesn't exist",...} (observed).
// The docs define no clean/flagged threshold and no score scale; ENF flags when toxicScore or any
// trait risk is >= flagAt (default 50, env INTERCEPTA_FLAG_AT). See docs/intercepta.md.
//
// Every failure (timeout, network, non-200, unparseable body) is { status: "unknown" } — never a throw,
// never "clean". Only definite answers (clean / flagged) are cached, for cacheTtlMs.

import type { Address } from "viem";
import type { Screen, ScreenResult } from "../types";

export const INTERCEPTA_DEFAULT_BASE_URL = "https://api.web3antivirus.io";
export const INTERCEPTA_PATHS = {
  quick: "/api/public/v2/extension/account/{address}/quick-scan",
  deep: "/api/public/v2/extension/account/{address}/toxic-score",
} as const;
export type InterceptaScan = keyof typeof INTERCEPTA_PATHS;

export type InterceptaConfig = {
  apiKey: string;
  /** Default https://api.web3antivirus.io */
  baseUrl?: string;
  /** "quick" (default, low latency) or "deep". */
  scan?: InterceptaScan;
  /** Flag when toxicScore or any trait risk >= flagAt. Default 50. */
  flagAt?: number;
  /** Per-request timeout. Default 4000 ms. */
  timeoutMs?: number;
  /** Per-address cache TTL for clean/flagged answers. Default 60 000 ms. */
  cacheTtlMs?: number;
  /** Injected for tests. Default globalThis.fetch. */
  fetch?: typeof fetch;
  /** Injected for tests. Default Date.now. */
  now?: () => number;
};

type Trait = { risk: number; name: string };

function parseBody(body: unknown): { toxicScore: number; traits: Trait[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { toxicScore?: unknown; traits?: unknown };
  if (typeof b.toxicScore !== "number" || !Number.isFinite(b.toxicScore) || !Array.isArray(b.traits)) return null;
  const traits: Trait[] = [];
  for (const t of b.traits) {
    if (typeof t !== "object" || t === null) return null;
    const { risk, name } = t as { risk?: unknown; name?: unknown };
    if (typeof risk !== "number" || !Number.isFinite(risk)) return null;
    traits.push({ risk, name: typeof name === "string" ? name : "?" });
  }
  return { toxicScore: b.toxicScore, traits };
}

export function interceptaScreen(cfg: InterceptaConfig): Screen {
  if (!cfg.apiKey) throw new Error("interceptaScreen: apiKey is required");
  const baseUrl = (cfg.baseUrl || INTERCEPTA_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const scan = cfg.scan ?? "quick";
  const path = INTERCEPTA_PATHS[scan];
  const flagAt = cfg.flagAt ?? 50;
  const timeoutMs = cfg.timeoutMs ?? 4000;
  const ttl = cfg.cacheTtlMs ?? 60_000;
  const doFetch = cfg.fetch ?? globalThis.fetch;
  const now = cfg.now ?? Date.now;
  const cache = new Map<string, { at: number; result: ScreenResult }>();
  const tag = `Intercepta ${scan}-scan`;

  async function query(address: string): Promise<ScreenResult> {
    const url = baseUrl + path.replace("{address}", address);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "GET",
        headers: { "X-API-KEY": cfg.apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const e = err as Error;
      const why = e.name === "TimeoutError" || e.name === "AbortError" ? `timed out after ${timeoutMs} ms` : e.message.split("\n")[0];
      return { status: "unknown", reason: `${tag} unavailable: ${why}` };
    }
    if (res.status === 401 || res.status === 403) return { status: "unknown", reason: `${tag} rejected the API key (HTTP ${res.status})` };
    if (!res.ok) return { status: "unknown", reason: `${tag} unavailable: HTTP ${res.status}` };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { status: "unknown", reason: `${tag}: response is not JSON` };
    }
    const parsed = parseBody(body);
    if (!parsed) return { status: "unknown", reason: `${tag}: unexpected response shape` };
    const hits = parsed.traits.filter((t) => t.risk >= flagAt);
    const summary = `toxicScore ${parsed.toxicScore}`;
    if (parsed.toxicScore >= flagAt || hits.length) {
      const names = hits.map((t) => `${t.name} (${t.risk})`).join(", ");
      return { status: "flagged", reason: `${tag}: ${summary}${names ? `; ${names}` : ""} (flag at >= ${flagAt})` };
    }
    return { status: "clean", reason: `${tag}: ${summary}, no trait >= ${flagAt}` };
  }

  return async (address: Address) => {
    const key = address.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.result;
    const result = await query(key);
    if (result.status !== "unknown") cache.set(key, { at: now(), result });
    else cache.delete(key);
    return result;
  };
}
