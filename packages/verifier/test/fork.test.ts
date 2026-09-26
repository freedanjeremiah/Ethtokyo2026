// Integration tests against the anvil fork built by `scripts/fork.sh` + `scripts/setup-all.ts`.
// Skipped (with a message) if RPC_URL is unreachable, not anvil, or deployments/fleet.anvil.json is missing.
// The kill-switch tests shell out to the real demo scripts and always end with demo-reset.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpRequestError, concat, createPublicClient, custom, getAddress, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { screenFromEnv } from "../src/screen";
import { verify } from "../src/index";
import { loadDeployment } from "../src/node";
import type { Screen, VerifyResult } from "../src/types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const FLEET_FILE = resolve(REPO_ROOT, "deployments", "fleet.anvil.json");

async function skipReason(): Promise<string | null> {
  if (!existsSync(FLEET_FILE)) return `${FLEET_FILE} missing (run scripts/fork.sh, then 00-keys.ts + setup-all.ts)`;
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }),
      signal: AbortSignal.timeout(3000),
    });
    const v = String(((await res.json()) as { result?: string }).result ?? "");
    if (!v.toLowerCase().includes("anvil")) return `RPC_URL ${RPC_URL} is not an anvil fork (${v || "unknown client"}); refusing to run kill switches`;
  } catch (err) {
    return `RPC_URL ${RPC_URL} unreachable (${(err as Error).message})`;
  }
  return null;
}

const SKIP = await skipReason();
if (SKIP) console.warn(`\n[verifier fork tests] SKIPPED: ${SKIP}\n`);

const deployment = loadDeployment(resolve(REPO_ROOT, "deployments", "sepolia.json"));
const client = createPublicClient({ transport: http(RPC_URL) });
const fleet = SKIP ? null : (JSON.parse(readFileSync(FLEET_FILE, "utf8")) as { fleetRegistry: string; settlementAddress: string });

const v = (name: string, screen?: Screen) => verify(client, name, { deployment, screen });
const check = (r: VerifyResult, id: string) => r.checks.find((c) => c.id === id);
const doorway = (r: VerifyResult, name: string) => r.doorways.find((d) => d.normalized === name);

function script(...args: string[]): string {
  return execFileSync("npx", ["tsx", ...args], { cwd: REPO_ROOT, env: { ...process.env, RPC_URL }, stdio: "pipe" }).toString();
}

/** KEY=value pairs from the repo-root .env.local (re-read each call; demo scripts write to it). */
function envLocal(): Record<string, string> {
  const path = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1]!, m[2]!]),
  );
}

describe.skipIf(!!SKIP)("verifier against the fork", () => {
  beforeAll(async () => {
    script("scripts/demo-reset.ts");
    // Warm the fork's remote-state cache: the < 2 s budget is for a warm fork (controller ruling 11).
    await Promise.all(["mia.support.shopa.eth", "mia.support.scam.eth"].map((n) => v(n)));
  });
  afterAll(() => script("scripts/demo-reset.ts"));

  describe("green", () => {
    for (const name of ["mia.support.shopa.eth", "mia.support.vendor.eth"]) {
      it(name, async () => {
        const t0 = performance.now();
        const r = await v(name);
        expect(performance.now() - t0).toBeLessThan(2000);
        expect(r.verdict, JSON.stringify(r.reasons)).toBe("green");
        expect(r.membership).toMatchObject({ member: true, offset: 0 });
        expect(r.checks.map((c) => [c.id, c.pass])).toEqual([["C1", true], ["C2", true], ["C3", true], ["C4", true]]);
        expect(r.resolved.address).toBe(getAddress(fleet!.settlementAddress));
        expect(r.resolved.canonical).toBe("support.vendor.eth");
        expect(r.resolved.parents).toEqual(["support.vendor.eth", "support.shopa.eth", "support.shopb.eth"]);
        expect(r.resolved.agentContext).toBeTruthy();
        expect(r.resolved.agentEndpointWeb).toBeTruthy();
        expect(r.registries.doorway).toBe(getAddress(fleet!.fleetRegistry));
        expect(r.registries.canonical).toBe(r.registries.doorway);
        expect(r.registries.canonicalNameOfDoorway).toBe("support.vendor.eth");
        expect(r.doorways.map((d) => [d.normalized, d.verdict])).toEqual([
          ["mia.support.vendor.eth", "green"],
          ["mia.support.shopa.eth", "green"],
          ["mia.support.shopb.eth", "green"],
        ]);
        expect(r.doorways.filter((d) => d.isInput).map((d) => d.normalized)).toEqual([name]);
      });
    }
    it("normalizes the input (MIA.Support.ShopA.eth)", async () => {
      const r = await v("MIA.Support.ShopA.eth");
      expect(r.normalized).toBe("mia.support.shopa.eth");
      expect(r.verdict).toBe("green");
    });
  });

  it("red: mia.support.scam.eth fails C3 (not endorsed) while resolving the same clean address", async () => {
    const r = await v("mia.support.scam.eth");
    expect(r.verdict).toBe("red");
    expect(r.membership.member).toBe(true);
    expect(r.resolved.address).toBe(getAddress(fleet!.settlementAddress));
    expect(check(r, "C1")?.pass).toBe(true);
    expect(check(r, "C2")?.pass).toBe(true); // same fleet registry is mounted; C3 is what catches it
    expect(check(r, "C3")?.pass).toBe(false);
    expect(check(r, "C3")?.detail).toContain("support.scam.eth is not in enf.parents");
    expect(check(r, "C4")?.pass).toBe(true);
    expect(r.summary).toContain("C3");
    // siblings: 3 endorsed doorways green + the typed counterfeit one
    expect(r.doorways.map((d) => [d.normalized, d.verdict, d.isInput])).toEqual([
      ["mia.support.vendor.eth", "green", false],
      ["mia.support.shopa.eth", "green", false],
      ["mia.support.shopb.eth", "green", false],
      ["mia.support.scam.eth", "red", true],
    ]);
  });

  describe("black", () => {
    it("nobody.support.shopa.eth: no resolver at the leaf", async () => {
      const r = await v("nobody.support.shopa.eth");
      expect(r.verdict).toBe("black");
      expect(r.membership.member).toBe(false);
      expect(r.reasons[0]).toContain("no resolver");
      expect(check(r, "C1")?.pass).toBe(false);
      expect(r.doorways.map((d) => d.normalized)).toEqual(["nobody.support.shopa.eth"]);
    });
    for (const name of ["support.shopa.eth", "shopa.eth"]) {
      it(`${name}: not a member`, async () => {
        const r = await v(name);
        expect(r.verdict).toBe("black");
        expect(r.membership.member).toBe(false);
        expect(r.resolved.address).toBeUndefined();
      });
    }
    for (const bad of ["mia..support.shopa.eth", "a\u0000b.support.shopa.eth", "", "   "]) {
      it(`invalid name ${JSON.stringify(bad)} -> black, no throw`, async () => {
        const r = await v(bad);
        expect(r.verdict).toBe("black");
        expect(r.normalized).toBeNull();
        expect(r.reasons[0]).toMatch(/^invalid name/);
        expect(r.doorways).toEqual([]);
      });
    }
  });

  it("a 429 on the enf.parents read rejects instead of showing a legit member as red", async () => {
    const needle = stringToHex("enf.parents").slice(2);
    const upstream = http(RPC_URL)({});
    const flaky = createPublicClient({
      transport: custom(
        {
          async request(args: { method: string; params?: unknown }) {
            if (args.method === "eth_call" && JSON.stringify(args.params).includes(needle))
              throw new HttpRequestError({ url: RPC_URL, status: 429, details: "Too Many Requests" });
            return upstream.request(args as never);
          },
        },
        { retryCount: 0 },
      ),
    });
    await expect(verify(flaky, "mia.support.shopa.eth", { deployment })).rejects.toThrow();
    // same client path without the fault still verifies green
    expect((await verify(createPublicClient({ transport: custom({ request: (a) => upstream.request(a as never) }) }), "mia.support.shopa.eth", { deployment })).verdict).toBe("green");
  });

  it("doorwaysSkipped is empty for the 3-parent roster", async () => {
    expect((await v("mia.support.shopa.eth")).doorwaysSkipped).toEqual([]);
  });

  describe("screening (C5)", () => {
    it("flagged -> orange on an endorsed doorway", async () => {
      const r = await v("mia.support.shopa.eth", async () => ({ status: "flagged", reason: "test list" }));
      expect(r.verdict).toBe("orange");
      expect(check(r, "C5")).toMatchObject({ pass: false, screen: "flagged" });
      expect(r.doorways.every((d) => d.verdict === "orange")).toBe(true);
    });
    it("flagged does not hide a counterfeit: scam stays red", async () => {
      const r = await v("mia.support.scam.eth", async () => ({ status: "flagged" }));
      expect(r.verdict).toBe("red");
    });
    it("unknown -> verdict unchanged, C5 pass:false detail unknown", async () => {
      const r = await v("mia.support.shopa.eth", async () => ({ status: "unknown" }));
      expect(r.verdict).toBe("green");
      expect(check(r, "C5")).toMatchObject({ pass: false, detail: "unknown", screen: "unknown" });
    });
    it("clean -> green with C5 pass; screen called once per address across doorways", async () => {
      let calls = 0;
      const r = await v("mia.support.shopa.eth", async () => {
        calls++;
        return { status: "clean" };
      });
      expect(r.verdict).toBe("green");
      expect(check(r, "C5")?.pass).toBe(true);
      expect(calls).toBe(1);
    });
    it("absent screen -> C5 omitted", async () => {
      expect(check(await v("mia.support.shopa.eth"), "C5")).toBeUndefined();
    });
  });

  describe("Intercepta demo: static-list screen + demo-dirty/clean-settlement (truth table on chain)", () => {
    const ENDORSED = ["vendor", "shopa", "shopb"];
    const MEMBERS = ["mia", "kai", "rin"];
    // Same derivation as scripts/lib/fleet.ts ensureDirtySettlementAddress (tag "enf.dirty-settlement.v1").
    const dirty = () =>
      privateKeyToAccount(keccak256(concat([envLocal().OPERATOR_PK as `0x${string}`, stringToHex("enf.dirty-settlement.v1")]))).address;

    it("legit + clean -> green; scam + clean -> red (screening passes, C3 fails)", async () => {
      const { screen, source } = screenFromEnv({ SCREEN_FLAGGED: dirty() });
      expect(source).toBe("static-list");
      const legit = await v("mia.support.shopa.eth", screen);
      expect(legit.verdict).toBe("green");
      expect(check(legit, "C5")).toMatchObject({ pass: true, screen: "clean" });
      const scam = await v("mia.support.scam.eth", screen);
      expect(scam.verdict).toBe("red");
      expect(check(scam, "C5")).toMatchObject({ pass: true, screen: "clean" }); // same clean address: screening alone would pass it
      expect(check(scam, "C3")?.pass).toBe(false);
      expect(scam.resolved.address).toBe(legit.resolved.address);
    });

    it("demo-dirty-settlement: ONE tx turns every endorsed doorway of every member orange; scam stays red; idempotent", async () => {
      const before = await client.getBlockNumber();
      script("scripts/demo-dirty-settlement.ts");
      expect(await client.getBlockNumber()).toBe(before + 1n); // anvil automine: exactly one transaction
      const env = envLocal();
      expect(env.DIRTY_SETTLEMENT_ADDRESS).toBe(dirty());
      expect(env.SCREEN_FLAGGED?.split(",")).toContain(dirty());
      // Configure exactly as the app / CLI do: from .env.local via screenFromEnv.
      const { screen } = screenFromEnv({ SCREEN_FLAGGED: env.SCREEN_FLAGGED });
      for (const m of MEMBERS) {
        const r = await v(`${m}.support.shopa.eth`, screen);
        expect(r.resolved.address, m).toBe(dirty());
        expect(r.verdict, m).toBe("orange");
        expect(r.summary).toBe("endorsed doorway, flagged counterparty");
        expect(check(r, "C5"), m).toMatchObject({ pass: false, screen: "flagged" });
        expect(r.doorways.map((d) => [d.normalized, d.verdict])).toEqual(ENDORSED.map((p) => [`${m}.support.${p}.eth`, "orange"]));
      }
      const scam = await v("mia.support.scam.eth", screen);
      expect(scam.verdict).toBe("red"); // counterfeit + dirty: red has precedence
      expect(check(scam, "C5")).toMatchObject({ screen: "flagged", screenReason: "listed in SCREEN_FLAGGED (static list)" });

      const again = script("scripts/demo-dirty-settlement.ts");
      expect(again).toContain("already dirty");
      expect(await client.getBlockNumber()).toBe(before + 1n);
    });

    it("injected screen outage (unknown): verdict stays ENS-only green, C5 unknown on every doorway, reason kept", async () => {
      const r = await v("mia.support.shopa.eth", async () => ({ status: "unknown", reason: "Intercepta quick-scan unavailable: timed out" }));
      expect(r.verdict).toBe("green");
      expect(check(r, "C5")).toMatchObject({ pass: false, screen: "unknown" });
      expect(r.reasons.join()).toContain("unknown");
      expect(check(r, "C5")?.screenReason).toBe("Intercepta quick-scan unavailable: timed out");
      expect(r.doorways.every((d) => d.checks.find((c) => c.id === "C5")?.screen === "unknown")).toBe(true);
    });

    it("demo-clean-settlement restores the derived settlement address -> green", async () => {
      const before = await client.getBlockNumber();
      script("scripts/demo-clean-settlement.ts");
      expect(await client.getBlockNumber()).toBe(before + 1n);
      const { screen } = screenFromEnv({ SCREEN_FLAGGED: envLocal().SCREEN_FLAGGED });
      const r = await v("mia.support.shopa.eth", screen);
      expect(r.resolved.address).toBe(getAddress(fleet!.settlementAddress));
      expect(r.verdict).toBe("green");
      expect(r.doorways.map((d) => d.verdict)).toEqual(["green", "green", "green"]);
      expect(script("scripts/demo-clean-settlement.ts")).toContain("already clean");
    });
  });

  describe("kill switches", () => {
    it("demo-unmount shopb: mia.support.shopb.eth black, shopa stays green", async () => {
      script("scripts/demo-unmount.ts", "shopb");
      const b = await v("mia.support.shopb.eth");
      expect(b.verdict).toBe("black");
      expect(check(b, "C1")?.detail).toContain("support.shopb.eth has no subregistry");
      expect(check(b, "C4")?.pass).toBe(true); // the doorway name itself is still alive, just unmounted
      const a = await v("mia.support.shopa.eth");
      expect(a.verdict).toBe("green");
      expect(doorway(a, "mia.support.shopb.eth")?.verdict).toBe("black");
      expect(doorway(a, "mia.support.vendor.eth")?.verdict).toBe("green");
      script("scripts/demo-reset.ts");
      expect((await v("mia.support.shopb.eth")).verdict).toBe("green");
    });

    it("demo-unregister mia: black everywhere; kai unaffected; demo-reset restores", async () => {
      script("scripts/demo-unregister.ts", "mia");
      for (const p of ["vendor", "shopa", "shopb", "scam"]) {
        const r = await v(`mia.support.${p}.eth`);
        expect(r.verdict, p).toBe("black");
        expect(check(r, "C1")?.pass, p).toBe(false);
        expect(check(r, "C1")?.detail, p).toMatch(/AVAILABLE|expired/);
      }
      expect((await v("kai.support.shopa.eth")).verdict).toBe("green");
      script("scripts/demo-reset.ts");
      const r = await v("mia.support.shopa.eth");
      expect(r.verdict).toBe("green");
      expect(r.doorways.map((d) => d.verdict)).toEqual(["green", "green", "green"]);
    });
  });
});
