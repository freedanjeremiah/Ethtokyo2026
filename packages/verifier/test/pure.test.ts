// Pure unit tests: no network.
import { describe, expect, it } from "vitest";
import { aggregateVerdict, dnsDecode, dnsEncode, doorwayParents, parseParents, safeNormalize, splitName } from "../src/pure";
import { checkC2, checkC3 } from "../src/verify";
import type { Check } from "../src/types";

const ok = (id: Check["id"]): Check => ({ id, title: id, pass: true, detail: "ok" });
const bad = (id: Check["id"], detail = "bad"): Check => ({ id, title: id, pass: false, detail });
const all = () => [ok("C1"), ok("C2"), ok("C3"), ok("C4")];
const base = { member: true, memberDetail: "leaf resolver", hasAddress: true };

describe("aggregateVerdict", () => {
  it("green when every check passes (C5 omitted)", () => {
    expect(aggregateVerdict({ ...base, checks: all() })).toEqual({ verdict: "green", reasons: [] });
  });
  it("black when not a member, regardless of other checks", () => {
    const r = aggregateVerdict({ ...base, member: false, memberDetail: "no resolver", checks: [ok("C1"), bad("C2"), bad("C3"), ok("C4")] });
    expect(r.verdict).toBe("black");
    expect(r.reasons[0]).toBe("no resolver");
  });
  it("black when member but no addr", () => {
    expect(aggregateVerdict({ ...base, hasAddress: false, checks: all() }).verdict).toBe("black");
  });
  it("C1 or C4 failure implies black (beats red)", () => {
    expect(aggregateVerdict({ ...base, checks: [bad("C1"), bad("C2"), ok("C3"), ok("C4")] }).verdict).toBe("black");
    expect(aggregateVerdict({ ...base, checks: [ok("C1"), ok("C2"), bad("C3"), bad("C4")] }).verdict).toBe("black");
  });
  it("red when C2 or C3 fails while resolving, with the failing details", () => {
    const r = aggregateVerdict({ ...base, checks: [ok("C1"), ok("C2"), bad("C3", "not endorsed"), ok("C4")] });
    expect(r.verdict).toBe("red");
    expect(r.reasons).toEqual(["C3 C3: not endorsed"]);
    expect(aggregateVerdict({ ...base, checks: [ok("C1"), bad("C2"), ok("C3"), ok("C4")] }).verdict).toBe("red");
  });
  it("red beats orange", () => {
    const c5: Check = { ...bad("C5"), screen: "flagged" };
    expect(aggregateVerdict({ ...base, checks: [ok("C1"), bad("C2"), ok("C3"), ok("C4"), c5] }).verdict).toBe("red");
  });
  it("orange when C5 flagged and ENS checks pass", () => {
    const c5: Check = { ...bad("C5", "sanctioned"), screen: "flagged" };
    expect(aggregateVerdict({ ...base, checks: [...all(), c5] }).verdict).toBe("orange");
  });
  it("C5 unknown: verdict stays green but the reason is surfaced", () => {
    const c5: Check = { ...bad("C5", "unknown"), screen: "unknown" };
    const r = aggregateVerdict({ ...base, checks: [...all(), c5] });
    expect(r.verdict).toBe("green");
    expect(r.reasons).toHaveLength(1);
  });
  it("C5 clean stays green", () => {
    const c5: Check = { ...ok("C5"), screen: "clean" };
    expect(aggregateVerdict({ ...base, checks: [...all(), c5] })).toEqual({ verdict: "green", reasons: [] });
  });
});

describe("parseParents", () => {
  it("splits, trims, normalizes and dedupes", () => {
    expect(parseParents(" support.vendor.eth, Support.ShopA.eth ,,support.vendor.eth")).toEqual({
      parents: ["support.vendor.eth", "support.shopa.eth"],
      invalid: [],
    });
  });
  it("reports invalid entries without throwing", () => {
    const r = parseParents("support.vendor.eth,bad..name,a\u0000b.eth");
    expect(r.parents).toEqual(["support.vendor.eth"]);
    expect(r.invalid.length).toBe(2);
  });
  it("handles null/empty", () => {
    expect(parseParents(null)).toEqual({ parents: [], invalid: [] });
    expect(parseParents("")).toEqual({ parents: [], invalid: [] });
  });
});

describe("names", () => {
  it("normalizes valid names and rejects invalid ones", () => {
    expect(safeNormalize(" MIA.support.ShopA.eth")).toEqual({ ok: true, name: "mia.support.shopa.eth" });
    expect(safeNormalize("mia..eth").ok).toBe(false);
    expect(safeNormalize("").ok).toBe(false);
    expect(safeNormalize("a\u0000b.eth").ok).toBe(false);
  });
  it("splits label and parent", () => {
    expect(splitName("mia.support.shopa.eth")).toEqual({ label: "mia", parent: "support.shopa.eth" });
    expect(splitName("eth")).toEqual({ label: "eth", parent: "" });
  });
  it("dns encode/decode round-trip", () => {
    expect(dnsEncode("support.vendor.eth")).toBe("0x07737570706f72740676656e646f720365746800");
    expect(dnsDecode("0x07737570706f72740676656e646f720365746800")).toBe("support.vendor.eth");
    expect(dnsDecode("0x")).toBe("");
    expect(dnsDecode("0x0561")).toBeNull();
  });
  it("doorwayParents dedupes and appends the typed parent", () => {
    expect(doorwayParents(["a.eth", "b.eth"], "b.eth")).toEqual(["a.eth", "b.eth"]);
    expect(doorwayParents(["a.eth"], "scam.eth")).toEqual(["a.eth", "scam.eth"]);
    expect(doorwayParents(undefined, "x.eth")).toEqual(["x.eth"]);
  });
});

describe("C2 / C3 builders", () => {
  const FLEET = "0x02400CF3D99d8F2571c8C199731258606A6dF008" as const;
  const COPY = "0x00000000000000000000000000000000000000c0" as const;
  it("C2 passes only when registry and canonical name both match", () => {
    expect(checkC2(FLEET, "support.vendor.eth", FLEET, "support.vendor.eth").pass).toBe(true);
    const copy = checkC2(COPY, "support.vendor.eth", FLEET, null);
    expect(copy.pass).toBe(false);
    expect(copy.detail).toContain("!=");
    expect(checkC2(FLEET, "support.vendor.eth", FLEET, "support.scam.eth").pass).toBe(false);
    expect(checkC2(FLEET, undefined, null, null).pass).toBe(false);
  });
  it("C3 requires the typed parent in enf.parents", () => {
    expect(checkC3("support.shopa.eth", ["support.vendor.eth", "support.shopa.eth"], []).pass).toBe(true);
    const r = checkC3("support.scam.eth", ["support.vendor.eth", "support.shopa.eth"], []);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("support.scam.eth is not in enf.parents");
    expect(checkC3("support.shopa.eth", undefined, []).pass).toBe(false);
  });
});
