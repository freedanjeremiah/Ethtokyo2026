"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import type { VerifyApiResponse } from "@/lib/api-types";
import type { FleetScan } from "@/lib/fleet-types";
import { Activity } from "@/components/Activity";
import { Controls } from "@/components/Controls";
import { Coverage } from "@/components/Coverage";
import { FleetMap } from "@/components/FleetMap";
import { Inspector } from "@/components/Inspector";
import { Card, CopyChip, Skeleton, fmtBlock, shortAddr } from "@/components/ui";

const DEFAULT_NAME = "mia.support.shopa.eth";
const BLOCK_POLL_MS = 1000;
const DEBOUNCE_MS = 400;

type ApiError = { error: string };
type Focus = { doorway: string | null; agent: string | null };

function isApiError(x: unknown): x is ApiError {
  return typeof x === "object" && x !== null && "error" in x;
}

function Summary({ scan }: { scan: FleetScan }) {
  const s = scan.stats;
  const names = s.mountsLive === 1 ? "1 name" : `${s.mountsLive} names`;
  return (
    <p className="lede">
      One agent fleet, mounted under <strong>{names}</strong>: <strong className="text-green">{s.endorsed} endorsed</strong>
      {s.counterfeit > 0 && (
        <>
          , <strong className="text-red">{s.counterfeit} counterfeit</strong>
        </>
      )}
      . <strong>{s.agentsActive}</strong> of {s.agentsTotal} agents active.
    </p>
  );
}

export default function Page() {
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
  const [focus, setFocus] = useState<Focus>({ doorway: null, agent: null });

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

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-name">ENF</span>
            <span className="brand-sub">Ethereum Naming Fleet</span>
          </div>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setCommitted(input.trim());
              setErrorVisible(true);
            }}
          >
            <label htmlFor="name-search" className="sr-only">
              Verify an ENS name
            </label>
            <MagnifyingGlass size={18} weight="bold" className="search-icon" aria-hidden />
            <input
              id="name-search"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setErrorVisible(false); // hide a shown error again until the next submit/blur
              }}
              onBlur={() => setErrorVisible(true)}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              placeholder="Verify a name, e.g. kai.support.scam.eth"
              aria-invalid={errorVisible && !!inputError}
              aria-describedby={errorVisible && inputError ? "search-error" : undefined}
            />
            {errorVisible && inputError && (
              <span id="search-error" className="search-error" role="alert">
                {inputError}
              </span>
            )}
          </form>
          <div className={`block-pill${rpcDown ? " down" : ""}`}>
            {rpcDown ? (
              <>
                <WarningCircle size={16} weight="bold" aria-hidden /> RPC unreachable
              </>
            ) : blockNumber ? (
              <>
                <span className="live" aria-hidden /> Block <span className="num">{fmtBlock(blockNumber)}</span>
              </>
            ) : (
              "Connecting"
            )}
          </div>
        </div>
      </header>
      <span className="sr-only" role="status">
        {connMsg}
      </span>

      <main className="page">
        {rpcDown && (
          <p className="notice tone-orange banner" role="alert">
            The chain RPC is not answering. Retrying every second; what you see is from the last block that could be read.
          </p>
        )}

        <div className="title-row">
          <div className="title-text">
            {scan ? (
              <>
                <h1 className="page-title">{scan.canonical ?? "ENF fleet"}</h1>
                <Summary scan={scan} />
              </>
            ) : (
              <div className="stack">
                <Skeleton h={34} w={280} />
                <Skeleton h={20} w={460} />
              </div>
            )}
          </div>
          {scan && (
            <div className="title-chips">
              <CopyChip label="Fleet registry" value={scan.fleetRegistry} display={shortAddr(scan.fleetRegistry)} />
              <span className="chip static">
                <span className="chip-label">Block</span>
                <span className="chip-value num">{fmtBlock(scan.blockNumber)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Flat children (Inspector, .col-main, Controls), in the order mobile wants them shown:
            desktop/tablet places them back into two columns via CSS (see globals.css `.layout`). */}
        <div className="layout">
          <Inspector result={result} loading={loading} verifyingName={committed} scanBlock={scan?.blockNumber ?? null} onSelect={select} />
          <div className="col-main">
            <Card
              id="map-h"
              title="Fleet map"
              aside={
                <span className="legend">
                  <span className="lg endorsed" /> Endorsed <span className="lg counterfeit" /> Counterfeit <span className="lg dead" /> Not live
                </span>
              }
              className="map-card"
            >
              {scan ? (
                <FleetMap scan={scan} focus={focus} onFocus={setFocus} onSelect={select} />
              ) : scanError ? (
                <p className="empty">{scanError}</p>
              ) : (
                <Skeleton h={340} r={14} />
              )}
            </Card>
            <div className="duo">
              {scan ? (
                <>
                  <Coverage scan={scan} selected={result?.normalized ?? null} focus={focus} onFocus={setFocus} onSelect={select} />
                  <Activity scan={scan} />
                </>
              ) : (
                <>
                  <Skeleton h={260} r={16} />
                  <Skeleton h={260} r={16} />
                </>
              )}
            </div>
          </div>
          <Controls scan={scan} onDone={refreshAll} />
        </div>
      </main>
    </>
  );
}
