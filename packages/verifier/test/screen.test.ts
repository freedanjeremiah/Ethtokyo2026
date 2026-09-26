// Unit tests for the C5 screening adapters (no chain). fetch is mocked: Intercepta is a third-party HTTP API.

import { describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { aggregateVerdict } from "../src/pure";
import type { Check, ScreenStatus } from "../src/types";
import {
  INTERCEPTA_DEFAULT_BASE_URL,
  combineScreens,
  interceptaScreen,
  parseAddressList,
  sanctionsOracleScreen,
  screenFromEnv,
  staticListScreen,
} from "../src/screen";

const CLEAN = "0x1111111111111111111111111111111111111111" as const;
const DIRTY = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("static-list adapter", () => {
  it("listed -> flagged, others -> clean (case-insensitive)", async () => {
    const s = staticListScreen([DIRTY]);
    expect((await s(getAddress(DIRTY))).status).toBe("flagged");
    expect((await s(DIRTY.toUpperCase().replace("0X", "0x") as `0x${string}`)).status).toBe("flagged");
    expect((await s(CLEAN)).status).toBe("clean");
  });
  it("parseAddressList: comma/whitespace separated, deduped, checksummed; throws on garbage", () => {
    expect(parseAddressList(` ${DIRTY}, ${CLEAN}\n${DIRTY.toUpperCase().replace("0X", "0x")} `)).toEqual([getAddress(DIRTY), getAddress(CLEAN)]);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
    expect(() => parseAddressList("0x1234")).toThrow(/not an address/);
  });
});

describe("intercepta adapter (mocked fetch)", () => {
  const mk = (impl: (url: string, init: RequestInit) => Promise<Response>, extra = {}) => {
    const f = vi.fn(impl);
    return { f, s: interceptaScreen({ apiKey: "k-123", fetch: f as unknown as typeof fetch, ...extra }) };
  };

  it("calls the documented quick-scan URL with the X-API-KEY header", async () => {
    const { f, s } = mk(async () => jsonResponse(200, { toxicScore: 0, traits: [] }));
    const r = await s(getAddress(CLEAN));
    expect(r.status).toBe("clean");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${INTERCEPTA_DEFAULT_BASE_URL}/api/public/v2/extension/account/${CLEAN}/quick-scan`);
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("k-123");
    expect(init.method).toBe("GET");
  });
  it("deep scan uses /toxic-score", async () => {
    const { f, s } = mk(async () => jsonResponse(200, { toxicScore: 0, traits: [] }), { scan: "deep", baseUrl: "https://x.test/" });
    await s(CLEAN);
    expect(f.mock.calls[0]![0]).toBe(`https://x.test/api/public/v2/extension/account/${CLEAN}/toxic-score`);
  });
  it("toxicScore >= flagAt -> flagged, with trait names in the reason", async () => {
    const { s } = mk(async () =>
      jsonResponse(200, {
        toxicScore: 100,
        traits: [{ risk: 100, name: "sanction_address", txsCount: 3, description: "d" }, { risk: 0.04, name: "non_kyc_transfers", txsCount: 1, description: "d" }],
      }),
    );
    const r = await s(DIRTY);
    expect(r.status).toBe("flagged");
    expect(r.reason).toContain("sanction_address (100)");
    expect(r.reason).not.toContain("non_kyc_transfers");
  });
  it("a single high-risk trait flags even when toxicScore is low", async () => {
    const { s } = mk(async () => jsonResponse(200, { toxicScore: 10, traits: [{ risk: 85, name: "sanction_address_communication", txsCount: 1, description: "d" }] }));
    expect((await s(DIRTY)).status).toBe("flagged");
  });
  it("below threshold -> clean; custom flagAt respected", async () => {
    const body = { toxicScore: 30, traits: [{ risk: 30, name: "mixer_transfers", txsCount: 1, description: "d" }] };
    expect((await mk(async () => jsonResponse(200, body)).s(CLEAN)).status).toBe("clean");
    expect((await mk(async () => jsonResponse(200, body), { flagAt: 25 }).s(CLEAN)).status).toBe("flagged");
  });
  it.each([
    ["403 bad key", async () => jsonResponse(403, { status: 403, response: "This authentication key is incorrect or doesn't exist" }), /rejected the API key/],
    ["404", async () => jsonResponse(404, {}), /HTTP 404/],
    ["500", async () => jsonResponse(500, "oops"), /HTTP 500/],
    ["429", async () => jsonResponse(429, {}), /HTTP 429/],
    ["non-JSON", async () => new Response("<html>", { status: 200 }), /not JSON/],
    ["wrong shape", async () => jsonResponse(200, { clean: true }), /unexpected response shape/],
    ["bad trait", async () => jsonResponse(200, { toxicScore: 1, traits: [{ name: "x" }] }), /unexpected response shape/],
    ["network error", async () => Promise.reject(new TypeError("fetch failed")), /fetch failed/],
  ] as const)("%s -> unknown (never throws, never clean)", async (_n, impl, re) => {
    const r = await mk(impl as never).s(CLEAN);
    expect(r.status).toBe("unknown");
    expect(r.reason).toMatch(re);
  });
  it("timeout -> unknown", async () => {
    const { s } = mk(
      (_u, init) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener("abort", () => rej(init.signal!.reason));
        }),
      { timeoutMs: 20 },
    );
    const r = await s(CLEAN);
    expect(r).toMatchObject({ status: "unknown" });
    expect(r.reason).toMatch(/timed out after 20 ms/);
  });
  it("caches clean/flagged per address for the TTL; never caches unknown", async () => {
    let t = 0;
    let n = 0;
    const { f, s } = mk(async () => (++n === 1 ? jsonResponse(500, {}) : jsonResponse(200, { toxicScore: 0, traits: [] })), {
      now: () => t,
      cacheTtlMs: 1000,
    });
    expect((await s(CLEAN)).status).toBe("unknown");
    expect((await s(CLEAN)).status).toBe("clean"); // unknown was not cached
    expect((await s(getAddress(CLEAN))).status).toBe("clean"); // cached (case-insensitive key)
    expect(f).toHaveBeenCalledTimes(2);
    t = 1001;
    await s(CLEAN);
    expect(f).toHaveBeenCalledTimes(3); // expired
  });
});

describe("sanctionsOracleScreen", () => {
  it("sanctioned -> flagged, with the OFAC / Chainalysis source in the reason", async () => {
    const s = sanctionsOracleScreen({ isSanctioned: async () => true });
    const r = await s(DIRTY);
    expect(r.status).toBe("flagged");
    expect(r.reason).toMatch(/OFAC/);
    expect(r.reason).toMatch(/Chainalysis/);
  });
  it("not sanctioned -> clean", async () => {
    const r = await sanctionsOracleScreen({ isSanctioned: async () => false })(CLEAN);
    expect(r.status).toBe("clean");
  });
  it("oracle failure -> unknown, never clean, never a throw", async () => {
    const r = await sanctionsOracleScreen({
      isSanctioned: async () => {
        throw new Error("HTTP 429");
      },
    })(CLEAN);
    expect(r.status).toBe("unknown");
    expect(r.reason).toContain("HTTP 429");
  });
  it("caches definite answers per address for cacheTtlMs, but not failures", async () => {
    let t = 0;
    const f = vi.fn(async () => false);
    const s = sanctionsOracleScreen({ isSanctioned: f, cacheTtlMs: 1000, now: () => t });
    await s(CLEAN);
    await s(CLEAN);
    expect(f).toHaveBeenCalledTimes(1);
    t = 2000;
    await s(CLEAN);
    expect(f).toHaveBeenCalledTimes(2);
    let fail = 0;
    const g = sanctionsOracleScreen({
      isSanctioned: async () => {
        fail++;
        throw new Error("down");
      },
    });
    await g(CLEAN);
    await g(CLEAN);
    expect(fail).toBe(2);
  });
});

describe("combineScreens", () => {
  const clean = async () => ({ status: "clean" as const, reason: "a clean" });
  const flagged = async () => ({ status: "flagged" as const, reason: "b flagged" });
  const unknown = async () => ({ status: "unknown" as const, reason: "c down" });
  it("any flagged -> flagged (its reason), even if another is unknown", async () => {
    expect(await combineScreens([clean, unknown, flagged])(CLEAN)).toEqual({ status: "flagged", reason: "b flagged" });
  });
  it("no flag but one unknown -> unknown", async () => {
    expect((await combineScreens([clean, unknown])(CLEAN)).status).toBe("unknown");
  });
  it("all clean -> clean, reasons joined", async () => {
    const r = await combineScreens([clean, async () => ({ status: "clean" as const, reason: "d clean" })])(CLEAN);
    expect(r).toEqual({ status: "clean", reason: "a clean; d clean" });
  });
});

describe("screenFromEnv", () => {
  it("sanctions oracle by default (keyless, real)", () => {
    const sel = screenFromEnv({});
    expect(sel.source).toBe("sanctions-oracle");
    expect(sel.screen).toBeDefined();
    expect(sel.description).toMatch(/Chainalysis/);
  });
  it("none only when the oracle is switched off and nothing else is configured", () => {
    const sel = screenFromEnv({ SCREEN_SANCTIONS: "off" });
    expect(sel.source).toBe("none");
    expect(sel.screen).toBeUndefined();
  });
  it("static-list when only SCREEN_FLAGGED is set", async () => {
    const sel = screenFromEnv({ SCREEN_SANCTIONS: "off", SCREEN_FLAGGED: DIRTY });
    expect(sel.source).toBe("static-list");
    expect((await sel.screen!(getAddress(DIRTY))).status).toBe("flagged");
    expect((await sel.screen!(CLEAN)).status).toBe("clean");
  });
  it("intercepta when INTERCEPTA_API_KEY is set; description never leaks the key", async () => {
    const f = vi.fn(async () => jsonResponse(200, { toxicScore: 0, traits: [] }));
    vi.stubGlobal("fetch", f);
    try {
      const sel = screenFromEnv({ SCREEN_SANCTIONS: "off", INTERCEPTA_API_KEY: "secret-key", INTERCEPTA_SCAN: "deep" });
      expect(sel.source).toBe("intercepta");
      expect(sel.description).not.toContain("secret-key");
      expect((await sel.screen!(CLEAN)).status).toBe("clean");
      expect(String((f.mock.calls[0] as unknown[])[0])).toContain("/toxic-score");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("intercepta + SCREEN_FLAGGED: deny-list flags without a call; others go to Intercepta", async () => {
    const f = vi.fn(async () => jsonResponse(200, { toxicScore: 0, traits: [] }));
    vi.stubGlobal("fetch", f);
    try {
      const sel = screenFromEnv({ SCREEN_SANCTIONS: "off", INTERCEPTA_API_KEY: "k", SCREEN_FLAGGED: DIRTY });
      expect(sel.source).toBe("intercepta+static-list");
      expect((await sel.screen!(getAddress(DIRTY))).status).toBe("flagged");
      expect(f).not.toHaveBeenCalled();
      expect((await sel.screen!(CLEAN)).reason).toMatch(/Intercepta/);
      expect(f).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("oracle + Intercepta together when a key is set", () => {
    expect(screenFromEnv({ INTERCEPTA_API_KEY: "k" }).source).toBe("intercepta+sanctions-oracle");
  });
  it("rejects bad config loudly", () => {
    expect(() => screenFromEnv({ SCREEN_SANCTIONS: "maybe" })).toThrow(/SCREEN_SANCTIONS/);
    expect(() => screenFromEnv({ SCREEN_FLAGGED: "nope" })).toThrow(/SCREEN_FLAGGED/);
    expect(() => screenFromEnv({ INTERCEPTA_API_KEY: "k", INTERCEPTA_SCAN: "mega" })).toThrow(/INTERCEPTA_SCAN/);
    expect(() => screenFromEnv({ INTERCEPTA_API_KEY: "k", INTERCEPTA_FLAG_AT: "high" })).toThrow(/INTERCEPTA_FLAG_AT/);
  });
});

describe("truth table (verifier-algorithm §A4) via aggregateVerdict", () => {
  const c = (id: Check["id"], pass: boolean): Check => ({ id, title: id, pass, detail: pass ? "ok" : "fail" });
  const c5 = (s: ScreenStatus): Check => ({ id: "C5", title: "counterparty screening", pass: s === "clean", detail: s, screen: s });
  const run = (ens: { c2: boolean; c3: boolean }, screen: ScreenStatus | null, member = true) =>
    aggregateVerdict({
      member,
      memberDetail: "no resolver for x (ResolverNotFound)",
      hasAddress: member,
      checks: member ? [c("C1", true), c("C2", ens.c2), c("C3", ens.c3), c("C4", true), ...(screen ? [c5(screen)] : [])] : [],
    });

  it.each([
    ["legit mount, clean vendor", { c2: true, c3: true }, "clean", true, "green"],
    ["counterfeit mount (scam.eth), same clean address", { c2: true, c3: false }, "clean", true, "red"],
    ["counterfeit via foreign registry, clean", { c2: false, c3: true }, "clean", true, "red"],
    ["legit mount, dirty settlement", { c2: true, c3: true }, "flagged", true, "orange"],
    ["counterfeit + dirty (red has precedence)", { c2: true, c3: false }, "flagged", true, "red"],
    ["legit, screening unknown (ENS decides, reason kept)", { c2: true, c3: true }, "unknown", true, "green"],
    ["counterfeit, screening unknown", { c2: true, c3: false }, "unknown", true, "red"],
    ["non-member", { c2: true, c3: true }, null, false, "black"],
  ] as const)("%s -> %s", (_n, ens, screen, member, want) => {
    expect(run(ens, screen, member).verdict).toBe(want);
  });
  it("unknown is never silent: the green verdict carries the C5 reason", () => {
    expect(run({ c2: true, c3: true }, "unknown").reasons).toEqual(["C5 counterparty screening: unknown"]);
  });
  it("orange reason names C5", () => {
    expect(run({ c2: true, c3: true }, "flagged").reasons[0]).toMatch(/^C5 /);
  });
});
