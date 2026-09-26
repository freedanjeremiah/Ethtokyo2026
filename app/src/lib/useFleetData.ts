// app/src/lib/useFleetData.ts — the editor's live chain state. Client only.
//
// Polls the block number every second; each new block re-scans the fleet and re-verifies the committed name at the
// scan's block, so the map, coverage and verifier always read the same chain state. Keeps ?name= in the URL.

import { useCallback, useEffect, useRef, useState } from "react";
import type { VerifyApiResponse } from "./api-types";
import type { FleetScan } from "./fleet-types";

const DEFAULT_NAME = "mia.support.shopa.eth";
const BLOCK_POLL_MS = 1000;
const DEBOUNCE_MS = 400;

type ApiError = { error: string };

function isApiError(x: unknown): x is ApiError {
  return typeof x === "object" && x !== null && "error" in x;
}

/** Live chain state for the editor: block polling, the fleet scan, and the verifier for the committed name. */
export function useFleetData() {
  const [input, setInput] = useState(DEFAULT_NAME);
  const [committed, setCommitted] = useState(DEFAULT_NAME);
  const [result, setResult] = useState<VerifyApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);
  // A debounced (typing) commit computes inputError but must not surface it until an explicit
  // submit, blur, or select() — otherwise it fires mid-keystroke. Editing hides it again.
  const [errorVisible, setErrorVisible] = useState(false);
  const [rpcDown, setRpcDown] = useState(false);
  const [connMsg, setConnMsg] = useState("");
  const prevRpcDown = useRef(false);
  const [blockNumber, setBlockNumber] = useState<string | null>(null);
  const [scan, setScan] = useState<FleetScan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const lastBlockRef = useRef<string | null>(null);
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const scanRef = useRef(scan);
  scanRef.current = scan;
  const verifySeq = useRef(0);
  const scanSeq = useRef(0);
  // On a live chain a scan or lookup can outlast a block. A new block must not restart work that is still
  // running for the same target, or the result would never land.
  const verifyInFlight = useRef<string | null>(null);
  const scanInFlight = useRef(false);

  // block: pin the verdict to the fleet scan's block, so the Inspector reads the same chain
  // state as the map/Coverage; undefined (no scan yet) verifies at latest.
  const runVerify = useCallback(async (name: string, block: string | undefined, fromBlockTick = false) => {
    if (fromBlockTick && verifyInFlight.current === name) return;
    const seq = ++verifySeq.current;
    verifyInFlight.current = name;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ name });
      if (block) qs.set("block", block);
      const res = await fetch(`/api/verify?${qs}`, { cache: "no-store" });
      const body: unknown = await res.json();
      if (seq !== verifySeq.current) return; // superseded by a newer request
      if (res.status === 502) {
        setRpcDown(true);
        return;
      }
      if (!res.ok || isApiError(body)) {
        setInputError(isApiError(body) ? body.error : `Request failed (${res.status})`);
        setResult(null);
        setRpcDown(false);
        return;
      }
      setRpcDown(false);
      setInputError(null);
      setResult(body as VerifyApiResponse);
    } catch {
      if (seq === verifySeq.current) setRpcDown(true);
    } finally {
      if (seq === verifySeq.current) {
        setLoading(false);
        verifyInFlight.current = null;
      }
    }
  }, []);

  const runScan = useCallback(async () => {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    const seq = ++scanSeq.current;
    try {
      const res = await fetch("/api/fleet", { cache: "no-store" });
      const body: unknown = await res.json();
      if (seq !== scanSeq.current) return;
      if (!res.ok || isApiError(body)) {
        setScanError(isApiError(body) ? body.error : `Request failed (${res.status})`);
        return;
      }
      setScanError(null);
      const nextScan = body as FleetScan;
      setScan(nextScan);
      // The scan landed at a new block: re-verify the committed name there so the Inspector
      // and the map/Coverage agree on which block they're reading.
      if (committedRef.current) void runVerify(committedRef.current, nextScan.blockNumber, true);
    } catch (err) {
      if (seq === scanSeq.current) setScanError((err as Error).message);
    } finally {
      scanInFlight.current = false;
    }
  }, [runVerify]);

  const refreshAll = useCallback(() => {
    void runScan();
  }, [runScan]);

  // Debounce typing before committing a name to verify.
  useEffect(() => {
    const trimmed = input.trim();
    const t = setTimeout(() => setCommitted(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Poll the block number every ~1s; re-scan and re-verify whenever it changes.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/block", { cache: "no-store" });
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok || isApiError(body)) {
          setRpcDown(true);
          return;
        }
        const bn = (body as { blockNumber: string }).blockNumber;
        setRpcDown(false);
        setBlockNumber(bn);
        if (lastBlockRef.current !== bn) refreshAll();
        lastBlockRef.current = bn;
      } catch {
        if (!cancelled) setRpcDown(true);
      }
    }
    void poll();
    const id = setInterval(poll, BLOCK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshAll]);

  const select = useCallback((name: string) => {
    setInput(name);
    setCommitted(name);
    setErrorVisible(true); // an explicit selection (cell/chip/node/URL), same as submit/blur
  }, []);

  // Announce connection transitions only — not the steady "up" state, and never on first connect.
  useEffect(() => {
    if (rpcDown === prevRpcDown.current) return;
    if (rpcDown) setConnMsg("Chain connection lost. Retrying.");
    else if (prevRpcDown.current) setConnMsg("Chain connection restored.");
    prevRpcDown.current = rpcDown;
  }, [rpcDown]);

  // A shareable `?name=` on first load counts as an explicit selection, same as clicking a cell.
  // Holds the name until `committed` actually reflects it, so the verify/sync effect below can
  // tell "still waiting for the URL name to land" from "nothing pending" without a boolean flag
  // that a Strict Mode double-invoke (same render, same stale `committed` closure) would trip.
  const pendingUrlName = useRef<string | null>(null);

  useEffect(() => {
    const urlName = new URLSearchParams(window.location.search).get("name");
    if (urlName) {
      pendingUrlName.current = urlName;
      select(urlName);
    }
  }, [select]);

  // Verify whenever the committed name changes, and keep the address bar in sync so the URL
  // stays shareable. Skips its body while a `?name=` adoption above is still in flight, so a cold
  // load with `?name=` never wastes a lookup (or overwrites the URL) with DEFAULT_NAME.
  useEffect(() => {
    if (pendingUrlName.current && pendingUrlName.current !== committed) return;
    pendingUrlName.current = null;

    const url = new URL(window.location.href);
    if (committed) url.searchParams.set("name", committed);
    else url.searchParams.delete("name");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    if (!committed) {
      setResult(null);
      setInputError(null);
      setErrorVisible(false);
      return;
    }
    void runVerify(committed, scanRef.current?.blockNumber);
  }, [committed, runVerify]);

  return {
    input,
    setInput,
    committed,
    setCommitted,
    result,
    loading,
    inputError,
    errorVisible,
    setErrorVisible,
    rpcDown,
    connMsg,
    blockNumber,
    scan,
    scanError,
    refreshAll,
    select,
  };
}
