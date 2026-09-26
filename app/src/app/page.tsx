"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DoorwayResult, Verdict, VerifyCore } from "@mount/verifier";
import type { VerifyApiResponse } from "@/lib/api-types";

type VerifyResult = VerifyApiResponse;

const DEFAULT_NAME = "mia.support.shopa.eth";
const BLOCK_POLL_MS = 1000;
const DEBOUNCE_MS = 400;

type ApiError = { error: string };

function isApiError(x: unknown): x is ApiError {
  return typeof x === "object" && x !== null && "error" in x;
}

const VERDICT_META: Record<Verdict, { label: string; icon: string; color: string }> = {
  green: { label: "GREEN", icon: "✓", color: "var(--green)" },
  red: { label: "RED", icon: "✗", color: "var(--red)" },
  orange: { label: "ORANGE", icon: "⚠", color: "var(--orange)" },
  black: { label: "BLACK", icon: "✕", color: "var(--black-verdict)" },
};

/** C5 state for one result: from its C5 check, or "off" when no screen is configured. null = not screened (e.g. black, no addr). */
type ScreenState = "clean" | "flagged" | "unknown" | "off" | null;

function screenState(r: VerifyCore, source: string | undefined): ScreenState {
  const c5 = r.checks.find((c) => c.id === "C5");
  if (c5?.screen) return c5.screen;
  if (source === "none") return "off";
  return null;
}

function ScreeningLine({ result }: { result: VerifyResult }) {
  const state = screenState(result, result.screening?.source);
  const c5 = result.checks.find((c) => c.id === "C5");
  const addr = result.resolved.address;
  if (state === "unknown")
    return (
      <div className="screen-badge unavailable" role="status">
        <span className="icon">?</span>
        <span>
          <strong>SCREENING UNAVAILABLE</strong> — counterparty {addr} could not be screened ({c5?.detail}). The verdict above is ENS-only.
        </span>
      </div>
    );
  if (state === "flagged")
    return (
      <div className="screen-badge flagged" role="status">
        <span className="icon">⚠</span>
        <span>
          <strong>Endorsed doorway, flagged counterparty.</strong> The mount is legitimate (C1–C4 pass), but the fleet&apos;s settlement
          address {addr} is flagged: {c5?.detail.replace(`${addr} flagged`, "").replace(/^: /, "") || "flagged"}. Do not pay it.
        </span>
      </div>
    );
  if (state === "clean")
    return (
      <div className="screen-badge clean">
        <span className="icon">✓</span>
        <span>
          counterparty {addr} clean · {result.screening.description}
        </span>
      </div>
    );
  if (state === "off")
    return (
      <div className="screen-badge off">
        <span className="icon">–</span>
        <span>screening off: {result.screening.description}</span>
      </div>
    );
  return null;
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <span className="badge" style={{ color: meta.color }}>
      <span className="icon">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function CheckRow({ check }: { check: VerifyResult["checks"][number] }) {
  const unknown = check.screen === "unknown";
  return (
    <div className="check-row">
      <span className="check-pill">{check.id}</span>
      <span className={`check-status ${unknown ? "unknown" : check.pass ? "pass" : "fail"}`}>{unknown ? "N/A" : check.pass ? "PASS" : "FAIL"}</span>
      <span className="check-body">
        <div className="check-title">{check.title}</div>
        <div className="check-detail">{check.detail}</div>
      </span>
    </div>
  );
}

function DoorwayChip({ doorway, source }: { doorway: DoorwayResult; source: string | undefined }) {
  const meta = VERDICT_META[doorway.verdict];
  const state = screenState(doorway, source);
  return (
    <div className={`doorway-chip${doorway.isInput ? " is-input" : ""}`} style={{ ["--chip-color" as string]: meta.color }}>
      <div className="name">{doorway.normalized ?? doorway.input}</div>
      <div className="status">
        <span className="icon">{meta.icon}</span>
        {meta.label}
        {doorway.isInput ? " (typed)" : ""}
      </div>
      <div className="detail">{doorway.summary}</div>
      {state === "unknown" && <div className="chip-tag unavailable">? screening unavailable</div>}
      {state === "flagged" && <div className="chip-tag flagged">⚠ flagged counterparty</div>}
    </div>
  );
}

export default function Page() {
  const [input, setInput] = useState(DEFAULT_NAME);
  const [committed, setCommitted] = useState(DEFAULT_NAME);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);
  const [rpcDown, setRpcDown] = useState(false);
  const [blockNumber, setBlockNumber] = useState<string | null>(null);

  const lastBlockRef = useRef<string | null>(null);
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const requestSeq = useRef(0);

  const runVerify = useCallback(async (name: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/verify?name=${encodeURIComponent(name)}`, { cache: "no-store" });
      const body: unknown = await res.json();
      if (seq !== requestSeq.current) return; // superseded by a newer request
      if (res.status === 502) {
        setRpcDown(true);
        return;
      }
      if (!res.ok || isApiError(body)) {
        setInputError(isApiError(body) ? body.error : `error ${res.status}`);
        setResult(null);
        setRpcDown(false);
        return;
      }
      setRpcDown(false);
      setInputError(null);
      setResult(body as VerifyResult);
    } catch {
      if (seq === requestSeq.current) setRpcDown(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Debounce typing before committing a name to verify.
  useEffect(() => {
    const trimmed = input.trim();
    const t = setTimeout(() => setCommitted(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Verify whenever the committed name changes.
  useEffect(() => {
    if (!committed) {
      setResult(null);
      setInputError("type an ENS name");
      return;
    }
    void runVerify(committed);
  }, [committed, runVerify]);

  // Poll the block number every ~1s; re-verify the current name whenever it changes.
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
        if (lastBlockRef.current !== null && lastBlockRef.current !== bn && committedRef.current) {
          void runVerify(committedRef.current);
        }
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
  }, [runVerify]);

  const verdictColor = result ? VERDICT_META[result.verdict].color : undefined;

  return (
    <main>
      <div className="top-row">
        <div className="brand">
          MOUNT <span>one fleet, many doorways</span>
        </div>
        <div className={`ticker${rpcDown ? " down" : ""}`}>
          <span className="dot" />
          {rpcDown ? "RPC unavailable — retrying" : blockNumber ? `block ${blockNumber}` : "connecting…"}
          {!rpcDown && result?.blockNumber ? ` · updated at block ${result.blockNumber}` : ""}
        </div>
      </div>

      <div className="input-row">
        <input
          className="name-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-label="ENS name to verify"
        />
        <div className="input-note">{inputError ?? ""}</div>
      </div>

      {rpcDown ? (
        <div className="rpc-card">
          <div className="word">RPC UNAVAILABLE</div>
          <div className="line">Retrying every second — no verdict is shown while the chain is unreachable.</div>
        </div>
      ) : (
        <div className={`verdict-card${loading && !result ? " loading" : ""}`} style={{ ["--card-color" as string]: verdictColor }}>
          {result ? (
            <>
              <VerdictBadge verdict={result.verdict} />
              <div className="summary">{result.summary}</div>
              <div className="subname">{result.normalized ?? result.input}</div>
              <ScreeningLine result={result} />
            </>
          ) : (
            <div className="summary">Verifying…</div>
          )}
        </div>
      )}

      {result && result.checks.length > 0 && (
        <div className="checks">
          <h2>C1 – C5</h2>
          {result.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </div>
      )}

      {result && result.doorways.length > 0 && (
        <div className="doorways">
          <h2>Doorways</h2>
          <div className="doorway-strip">
            {result.doorways.map((d) => (
              <DoorwayChip key={d.normalized ?? d.input} doorway={d} source={result.screening?.source} />
            ))}
          </div>
          {result.doorwaysSkipped.length > 0 && (
            <div className="skipped">not verified (fan-out cap): {result.doorwaysSkipped.join(", ")}</div>
          )}
        </div>
      )}
    </main>
  );
}
