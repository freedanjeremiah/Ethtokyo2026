// Transport failures must reject verify(), never become a red/black verdict. No network.
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BaseError,
  CallExecutionError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  createPublicClient,
  custom,
  parseAbi,
} from "viem";
import { capDoorways, isContractRevert, verify } from "../src/index";
import { loadDeployment } from "../src/node";

const deployment = loadDeployment(resolve(__dirname, "..", "..", "..", "deployments", "sepolia.json"));
const BLOCK = {
  number: "0x10", hash: `0x${"11".repeat(32)}`, parentHash: `0x${"22".repeat(32)}`, timestamp: "0x68000000",
  nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x1", gasUsed: "0x0", miner: `0x${"00".repeat(20)}`,
  extraData: "0x", logsBloom: `0x${"00".repeat(256)}`, transactions: [], uncles: [], size: "0x1",
  stateRoot: `0x${"00".repeat(32)}`, receiptsRoot: `0x${"00".repeat(32)}`, transactionsRoot: `0x${"00".repeat(32)}`,
  sha3Uncles: `0x${"00".repeat(32)}`, mixHash: `0x${"00".repeat(32)}`, baseFeePerGas: "0x1", totalDifficulty: null,
};

/** A client whose eth_call always fails at the transport layer (HTTP 429). */
function rateLimitedClient() {
  return createPublicClient({
    transport: custom(
      {
        async request({ method }: { method: string }) {
          if (method === "eth_getBlockByNumber") return BLOCK;
          if (method === "eth_chainId") return "0xaa36a7";
          throw new HttpRequestError({ url: "http://rpc.test", status: 429, body: { method }, details: "Too Many Requests" });
        },
      },
      { retryCount: 0 },
    ),
  });
}

describe("transport errors reject instead of producing a verdict", () => {
  it("HTTP 429 on eth_call -> verify() rejects (no false black/red)", async () => {
    await expect(verify(rateLimitedClient(), "mia.support.shopa.eth", { deployment })).rejects.toThrow();
  });
  it("invalid names still resolve to black without touching the transport", async () => {
    const r = await verify(rateLimitedClient(), "mia..eth", { deployment });
    expect(r.verdict).toBe("black");
  });
});

describe("isContractRevert", () => {
  const abi = parseAbi(["function f()"]);
  it("true for a contract revert", () => {
    const reverted = new ContractFunctionRevertedError({ abi, functionName: "f", data: "0x" });
    const wrapped = new ContractFunctionExecutionError(reverted, { abi, functionName: "f", contractAddress: "0x0000000000000000000000000000000000000001" });
    expect(isContractRevert(wrapped)).toBe(true);
  });
  it("false for transport errors, even wrapped as call errors", () => {
    const http = new HttpRequestError({ url: "http://rpc.test", status: 429 });
    expect(isContractRevert(http)).toBe(false);
    const call = new CallExecutionError(http as unknown as BaseError, {});
    expect(isContractRevert(new ContractFunctionExecutionError(call, { abi, functionName: "f" }))).toBe(false);
    expect(isContractRevert(new Error("boom"))).toBe(false);
  });
});

describe("capDoorways", () => {
  const many = Array.from({ length: 20 }, (_, i) => `support.p${i}.eth`);
  it("keeps at most 16, always including the typed parent, reports the rest", () => {
    const r = capDoorways(many, "support.p19.eth");
    expect(r.parents).toHaveLength(16);
    expect(r.parents).toContain("support.p19.eth");
    expect(r.skipped).toHaveLength(4);
    expect([...r.parents, ...r.skipped].sort()).toEqual([...many].sort());
  });
  it("no-op under the cap", () => {
    expect(capDoorways(["a.eth", "b.eth"], "b.eth")).toEqual({ parents: ["a.eth", "b.eth"], skipped: [] });
  });
});
