import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, zeroAddress } from "viem";
import { DEMO_FLEET, classifyName, doorwayLabel, doorwayName, fleetSalt, formatParents, normLabel, parentSalt, parseFleet, parseParentLabels } from "./fleet-ref";

describe("parseFleet", () => {
  it("accepts every spelling of a fleet name", () => {
    for (const raw of ["alice", "Alice", "alice.eth", "support.alice.eth", " SUPPORT.alice.ETH "])
      expect(parseFleet(raw)).toEqual({ canonical: "support.alice.eth", vendorLabel: "alice" });
  });
  it("defaults to the demo fleet when empty", () => {
    expect(parseFleet(null)).toEqual({ canonical: DEMO_FLEET, vendorLabel: "vendor" });
    expect(parseFleet("")).toEqual({ canonical: DEMO_FLEET, vendorLabel: "vendor" });
  });
  it("rejects garbage", () => {
    for (const raw of ["x..eth", "a.b.c.eth", "support..eth", "-", "a b", "💥💥".repeat(40), "support.a.b.eth"]) expect(parseFleet(raw)).toBeNull();
  });
});

describe("labels and doorways", () => {
  it("normalises labels", () => {
    expect(normLabel("Alice-Shop")).toBe("alice-shop");
    expect(normLabel("a.b")).toBeNull();
    expect(normLabel("")).toBeNull();
    expect(normLabel("alice-")).toBe("alice-");
    expect(normLabel("-shop")).toBe("-shop");
    expect(normLabel("---")).toBeNull();
  });
  it("maps doorway names both ways", () => {
    expect(doorwayName("shopa")).toBe("support.shopa.eth");
    expect(doorwayLabel("support.shopa.eth")).toBe("shopa");
    expect(doorwayLabel("mia.support.shopa.eth")).toBeNull();
  });
  it("formats and parses enf.parents", () => {
    expect(formatParents(["alice", "alice-shop"])).toBe("support.alice.eth,support.alice-shop.eth");
    expect(parseParentLabels("support.alice.eth, support.alice-shop.eth,junk")).toEqual(["alice", "alice-shop"]);
    expect(parseParentLabels(null)).toEqual([]);
  });
});

describe("salts", () => {
  it("derive from the canonical name and label", () => {
    expect(fleetSalt("fleet", "support.alice.eth")).toBe(BigInt(keccak256(stringToHex("fns.fleet.v1:support.alice.eth"))));
    expect(fleetSalt("resolver", "support.alice.eth")).toBe(BigInt(keccak256(stringToHex("fns.resolver.v1:support.alice.eth"))));
    expect(parentSalt("alice")).toBe(BigInt(keccak256(stringToHex("fns.parent.v1:alice"))));
    expect(fleetSalt("fleet", "support.a.eth")).not.toBe(fleetSalt("fleet", "support.b.eth"));
  });
});

describe("classifyName", () => {
  const me = "0x1607846398FeF2cB4573445160B57aBA3fB68dDB";
  it("classifies by the current owner", () => {
    expect(classifyName(me, zeroAddress)).toBe("available");
    expect(classifyName(me, me.toLowerCase())).toBe("yours");
    expect(classifyName(me, "0x7A9092d9C7fFEc85f2ba5ED037B4FCC9e845b05B")).toBe("taken");
  });
});
