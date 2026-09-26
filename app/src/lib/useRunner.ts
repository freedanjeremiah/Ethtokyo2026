// app/src/lib/useRunner.ts — runs playbook steps. Client only.
//
// Chain steps: /api/actions plans the unsigned transactions (the server holds no keys), the browser wallet signs
// each one from the account that owns the name, and the step waits for its receipt. Every owner is connected to the
// page once, so each transaction is sent from its owner without switching; a wallet that only sends from the
// selected account falls back to asking the viewer to switch. Check steps: /api/verify at a
// block no older than the last transaction this run sent, so a check never reads the chain from before it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { Verdict } from "@fns/verifier";
import type { VerifyApiResponse } from "./api-types";
import type { ActionPlan, TxStep } from "./fleet-types";
import { type Step, actionOf } from "./playbook";
import { connect, connectedAccounts, pickAccount, sendStep, useWallet, waitForReceipt } from "./wallet";

export type RunStatus = "idle" | "queued" | "running" | "done" | "failed" | "cancelled";

export type StepRun = {
  status: RunStatus;
  /** What the step is waiting on right now, or how it ended. */
  message?: string;
  txs: { what: string; hash: string }[];
  /** check steps: the verdict the verifier returned, and whether it matched the expectation. */
  verdict?: Verdict;
  pass?: boolean;
};

/** A step is waiting for the viewer to connect the owners it signs with, or to switch to the one that must sign it. */
export type Need = { kind: "connect"; signers: string[] } | { kind: "switch"; signer: string; from: Address } | null;

const sameAddr = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

/** Wallet errors -> one plain line. 4001 is the EIP-1193 "user rejected" code, -32002 "request already open". */
export function walletError(err: unknown): string {
  const e = err as { code?: number; shortMessage?: string; message?: string };
  if (e.code === 4001) return "Rejected in the wallet.";
  if (e.code === -32002) return "Your wallet already has a request open. Click the wallet icon in the browser toolbar to approve or reject it, then run again.";
  return (e.shortMessage ?? e.message ?? String(err)).split("\n")[0]!;
}

class Cancelled extends Error {}

async function currentBlock(): Promise<bigint | null> {
  try {
    const res = await fetch("/api/block", { cache: "no-store" });
    const body = (await res.json()) as { blockNumber?: string };
    return body.blockNumber ? BigInt(body.blockNumber) : null;
  } catch {
    return null;
  }
}

export function useRunner({ onChainChange, onChecked }: { onChainChange: () => void; onChecked: (name: string) => void }) {
  const { account } = useWallet();
  const [runs, setRuns] = useState<Record<string, StepRun>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [need, setNeed] = useState<Need>(null);
  const [trail, setTrail] = useState<string[]>([]);

  const accountRef = useRef<Address | null>(null);
  accountRef.current = account;
  const waitRef = useRef<{ from: Address; resolve: () => void } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  /** The newest block a transaction in this run landed in; later checks read at or after it. */
  const minBlock = useRef<bigint | null>(null);

  // Switching to the account a waiting step needs (in the wallet, the top bar or the prompt) lets it continue.
  useEffect(() => {
    const w = waitRef.current;
    if (w && sameAddr(account, w.from)) {
      waitRef.current = null;
      setNeed(null);
      w.resolve();
    }
  }, [account]);

  const patch = useCallback((id: string, p: Partial<StepRun>) => {
    setRuns((r) => ({ ...r, [id]: { ...(r[id] ?? { status: "idle", txs: [] }), ...p } }));
  }, []);

  function waitForAccount(from: Address, signer: string): Promise<void> {
    if (sameAddr(accountRef.current, from)) return Promise.resolve();
    setNeed({ kind: "switch", signer, from });
    return new Promise((resolve) => {
      waitRef.current = { from, resolve };
    });
  }

  /** Asks the viewer, once, to connect every owner this plan signs with that is not connected yet. Not fatal: an owner
   * left out is switched to when its transaction comes up. */
  async function connectSigners(plan: Extract<ActionPlan, { ok: true }>, wait: <T>(message: string, p: Promise<T>) => Promise<T>) {
    const connected = await wait("Preparing the transactions.", connectedAccounts());
    const missing = plan.steps.filter((tx) => !connected.some((a) => sameAddr(a, tx.from)));
    if (missing.length === 0) return;
    const signers = [...new Set(missing.map((tx) => tx.signer))];
    setNeed({ kind: "connect", signers });
    try {
      await wait(`Tick the ${signers.join(", ")} in your wallet (and keep the others ticked), then Connect.`, pickAccount());
    } catch (err) {
      if (err instanceof Cancelled) throw err;
      // Rejected or unsupported: fall back to switching per transaction.
    } finally {
      setNeed(null);
    }
  }

  /** Sends `tx` from its owner: straight away when the owner is connected, else (or if the wallet only sends from the
   * selected account) once the viewer switches to it. */
  async function sendAs(tx: TxStep, n: string, wait: <T>(message: string, p: Promise<T>) => Promise<T>) {
    const connected = await wait(`${n}${tx.what}.`, connectedAccounts());
    if (connected.some((a) => sameAddr(a, tx.from))) {
      try {
        return await wait(`${n}${tx.what}. Confirm it in your wallet as the ${tx.signer}.`, sendStep(tx));
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (err instanceof Cancelled || code === 4001 || code === -32002 || sameAddr(accountRef.current, tx.from)) throw err;
        // This wallet only sends from the selected account.
      }
    }
    await wait(`${n}switch your wallet to the ${tx.signer}.`, waitForAccount(tx.from, tx.signer));
    return wait(`${n}${tx.what}. Confirm it in your wallet.`, sendStep(tx));
  }

  async function runChainStep(step: Step, wait: <T>(message: string, p: Promise<T>) => Promise<T>) {
    const action = actionOf(step)!;
    if (!accountRef.current) accountRef.current = await wait("Approve the connection in your wallet. No window? Click the wallet icon in the browser toolbar.", connect());
    const res = await wait("Preparing the transactions.", fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, target: step.target }),
    }));
    const plan = (await res.json()) as ActionPlan;
    if (!plan.ok) throw new Error(plan.error);
    if (plan.steps.length === 0) return "Already done. No transaction needed.";
    await connectSigners(plan, wait);
    const txs: StepRun["txs"] = [];
    for (const [i, tx] of plan.steps.entries()) {
      const n = plan.steps.length > 1 ? `Transaction ${i + 1} of ${plan.steps.length}: ` : "";
      const hash = await sendAs(tx, n, wait);
      txs.push({ what: tx.what, hash });
      patch(step.id, { txs: [...txs] });
      const block = await wait(`${n}${tx.what}. Sent; waiting for it to be mined.`, waitForReceipt(tx, hash));
      if (minBlock.current === null || block > minBlock.current) minBlock.current = block;
    }
    onChainChange();
    return `${plan.steps.length === 1 ? plan.steps[0]!.what : `${plan.steps.length} transactions`}. Done.`;
  }

  async function runCheck(step: Step, wait: <T>(message: string, p: Promise<T>) => Promise<T>) {
    const name = (step.name ?? "").trim();
    if (!name) throw new Error("Type a name to check.");
    // Read at a block that includes this run's transactions; the read RPC can trail the wallet's by a block.
    let block: bigint | null = null;
    let caughtUp = false;
    for (let i = 0; i < 20; i++) {
      block = await wait("Waiting for the chain to catch up.", currentBlock());
      caughtUp = minBlock.current === null || (block !== null && block >= minBlock.current);
      if (caughtUp) break;
      await wait("Waiting for the chain to catch up.", new Promise((r) => setTimeout(r, 1500)));
    }
    // A verdict from before this run's transactions would be a false result, pass or fail.
    if (!caughtUp) throw new Error(`The chain has not reached block ${minBlock.current} after 30s, so ${name} can't be checked yet. Run the check again.`);
    const qs = new URLSearchParams({ name });
    if (block !== null) qs.set("block", block.toString());
    const res = await wait(`Checking ${name}.`, fetch(`/api/verify?${qs}`, { cache: "no-store" }));
    const body = (await res.json()) as VerifyApiResponse | { error: string };
    if ("error" in body) throw new Error(body.error);
    onChecked(body.normalized ?? name);
    const expect = step.expect ?? "any";
    const pass = expect === "any" || body.verdict === expect;
    return { verdict: body.verdict, pass, message: body.summary };
  }

  /** Runs from `first`, asking `after` which step comes next given how each one ended. A failed or cancelled
   * transaction stops the run: later steps assumed it happened. A check that does not match is not a failure of the
   * run; it takes its "otherwise" path. */
  async function runFlow(first: Step | null, after: (s: Step, outcome: "next" | "pass" | "fail") => Step | null) {
    if (activeId || !first) return;
    minBlock.current = null;
    setRuns({});
    setTrail([]);
    const cancelled = new Promise<never>((_, reject) => {
      cancelRef.current = () => reject(new Cancelled("Cancelled. If your wallet still shows a request, reject it there."));
    });
    cancelled.catch(() => {});
    let step: Step | null = first;
    for (let count = 0; step && count < 60; count++) {
      const current: Step = step;
      setActiveId(current.id);
      const wait = <T,>(message: string, p: Promise<T>) => {
        patch(current.id, { status: "running", message });
        return Promise.race([p, cancelled]);
      };
      let outcome: "next" | "pass" | "fail" | null = null;
      try {
        if (current.kind === "check") {
          const r = await runCheck(current, wait);
          patch(current.id, { status: r.pass ? "done" : "failed", verdict: r.verdict, pass: r.pass, message: r.message });
          outcome = r.pass ? "pass" : "fail";
        } else {
          patch(current.id, { status: "done", message: await runChainStep(current, wait) });
          outcome = "next";
        }
      } catch (err) {
        const isCancel = err instanceof Cancelled;
        patch(current.id, { status: isCancel ? "cancelled" : "failed", message: isCancel ? err.message : walletError(err) });
      } finally {
        waitRef.current = null;
        setNeed(null);
      }
      if (!outcome) break;
      const next = after(current, outcome);
      if (next) setTrail((t) => [...t, `${current.id}:${outcome}`]);
      step = next;
    }
    cancelRef.current = null;
    setActiveId(null);
  }

  return {
    runs,
    activeId,
    running: activeId !== null,
    need,
    /** Runs a list in order (used for "run only this node"). */
    run: (steps: Step[]) => void runFlow(steps[0] ?? null, (st) => steps[steps.indexOf(st) + 1] ?? null),
    runFlow: (first: Step | null, after: (s: Step, outcome: "next" | "pass" | "fail") => Step | null) => void runFlow(first, after),
    /** Wires the current run has followed, as "nodeId:port". */
    trail,
    cancel: () => cancelRef.current?.(),
    switchAccount: () => void pickAccount().catch(() => {}),
    clear: () => setRuns({}),
  };
}
