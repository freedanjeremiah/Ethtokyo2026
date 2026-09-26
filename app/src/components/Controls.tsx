// Kill switches (fork only). Each button runs the matching fork-tested scripts/demo-*.ts on the server.
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CircleNotch, LinkBreak, UserMinus, Wallet, WarningCircle, type Icon } from "@phosphor-icons/react";
import type { ActionName, ActionResult, ActionsInfo, FleetScan } from "@/lib/fleet-types";
import { Card, CopyChip, Skeleton, Tag, doorwayShort, shortAddr } from "./ui";

type Pending = { action: ActionName; target?: string } | null;
type Outcome = { ok: boolean; summary: string; txs: { what: string; hash: string }[] };

const armedKey = (a: ActionName, t?: string) => `${a}:${t ?? ""}`;

/** Script output -> the tx hashes it sent plus its last human line. */
function parseOutput(ok: boolean, text: string): Outcome {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const txs: Outcome["txs"] = [];
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^tx (.+): (0x[0-9a-fA-F]{64})/.exec(l);
    if (m) txs.push({ what: m[1]!, hash: m[2]! });
    else rest.push(l);
  }
  const summary = rest[rest.length - 1] ?? (ok ? "Done" : "Failed");
  return { ok, summary: summary.charAt(0).toUpperCase() + summary.slice(1), txs };
}

const LABEL: Record<ActionName, string> = {
  unmount: "Unmounting",
  fire: "Firing",
  dirty: "Pointing settlement at a sanctioned address",
  clean: "Restoring the clean settlement address",
  counterfeit: "Mounting the counterfeit",
  reset: "Resetting",
};

function Action({
  icon: I,
  tone,
  busy,
  disabled,
  onClick,
  children,
  innerRef,
}: {
  icon: Icon;
  tone: "danger" | "warn" | "neutral";
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
  innerRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    // Kill switches are ENS secondary actions (blue); only the icon carries the destructive cue.
    <button ref={innerRef} type="button" className={`btn ${tone === "neutral" ? "btn-neutral" : "btn-action"}`} disabled={disabled} onClick={onClick} aria-busy={busy}>
      {busy ? (
        <CircleNotch size={18} weight="bold" className="spin" aria-hidden />
      ) : (
        <I size={18} weight="bold" className={tone === "danger" ? "text-red" : tone === "warn" ? "text-orange" : undefined} aria-hidden />
      )}
      {children}
    </button>
  );
}

export function Controls({ scan, onDone }: { scan: FleetScan | null; onDone: () => void }) {
  const [info, setInfo] = useState<ActionsInfo | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [armed, setArmed] = useState<Pending>(null);

  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastArmedKey = useRef<string | null>(null);

  // Re-check availability whenever a new scan lands, so the panel recovers after an RPC outage.
  const scanBlock = scan?.blockNumber;
  useEffect(() => {
    fetch("/api/actions", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: ActionsInfo) => setInfo(b))
      .catch(() => setInfo({ enabled: false, reason: "Could not reach the server.", parents: [], agents: [], chain: null }));
  }, [scanBlock]);

  // Move focus to the Confirm button when an action arms, and back to the original button on disarm.
  useEffect(() => {
    if (armed) {
      lastArmedKey.current = armedKey(armed.action, armed.target);
      btnRefs.current.get(lastArmedKey.current)?.focus();
    } else if (lastArmedKey.current) {
      btnRefs.current.get(lastArmedKey.current)?.focus();
      lastArmedKey.current = null;
    }
  }, [armed]);

  // Escape disarms whichever action is currently armed.
  useEffect(() => {
    if (!armed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setArmed(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  async function run(action: ActionName, target?: string) {
    setPending({ action, target });
    setOutcome(null);
    try {
      const res = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, target }) });
      const body = (await res.json()) as ActionResult;
      setOutcome(body.ok ? parseOutput(true, body.output) : parseOutput(false, `${body.output ?? ""}\n${body.error}`));
    } catch (err) {
      setOutcome({ ok: false, summary: (err as Error).message, txs: [] });
    } finally {
      setPending(null);
      onDone();
    }
  }

  // On the live chain a click arms the action instead of sending; a second click on the same
  // button (now labelled "Confirm: ...") sends it. The anvil fork sends on the first click.
  function trigger(action: ActionName, target?: string) {
    if (info?.chain === "live") {
      if (armed && armed.action === action && armed.target === target) {
        setArmed(null);
        void run(action, target);
      } else {
        setArmed({ action, target });
      }
    } else {
      void run(action, target);
    }
  }

  const setBtnRef = (action: ActionName, target: string | undefined) => (el: HTMLButtonElement | null) => {
    const key = armedKey(action, target);
    if (el) btnRefs.current.set(key, el);
    else btnRefs.current.delete(key);
  };

  const live = !!info?.enabled;
  const locked = !live || !!pending;
  const is = (a: ActionName, t?: string) => pending?.action === a && pending?.target === t;
  const isArmed = (a: ActionName, t?: string) => armed?.action === a && armed?.target === t;
  const mounted = (scan?.doorways ?? []).filter((d) => d.mounted && d.name && info?.parents.includes(doorwayShort(d.name)));
  const active = (scan?.agents ?? []).filter((a) => a.active && info?.agents.includes(a.label));
  const dirty = scan?.settlement.screen === "flagged";
  const settlementAction: ActionName = dirty ? "clean" : "dirty";

  return (
    <Card id="controls-h" title="Kill switches" aside={info && (live ? <Tag tone="blue">{info.chain === "live" ? "Sepolia" : "Local fork"}</Tag> : <Tag>Read only</Tag>)} className="controls">
      {!scan || !info ? (
        <div className="groups">
          <div className="group">
            <h3 className="label">Merchant drops the fleet</h3>
            <div className="btn-row">
              <Skeleton h={42} w={140} r={999} />
            </div>
          </div>
          <div className="group">
            <h3 className="label">Vendor fires an agent</h3>
            <div className="btn-row">
              <Skeleton h={42} w={140} r={999} />
            </div>
          </div>
          <div className="group">
            <h3 className="label">Settlement address</h3>
            <div className="btn-row">
              <Skeleton h={42} w={180} r={999} />
            </div>
          </div>
          <div className="group group-last">
            <div className="btn-row">
              <Skeleton h={42} w={140} r={999} />
            </div>
          </div>
          <p className="hint">Reading the fleet from chain…</p>
        </div>
      ) : !live ? (
        <p className="empty">{info.reason}</p>
      ) : (
        <div className="groups">
          <div className="group">
            <h3 className="label">Merchant drops the fleet</h3>
            <p className="hint">One transaction from the merchant. Only its doorway goes dark.</p>
            <div className="btn-row">
              {mounted.length === 0 && <span className="hint">Nothing is mounted.</span>}
              {mounted.map((d) => {
                const p = doorwayShort(d.name!);
                const a = isArmed("unmount", p);
                return (
                  <Fragment key={p}>
                    <Action
                      icon={LinkBreak}
                      tone="danger"
                      busy={is("unmount", p)}
                      disabled={locked}
                      onClick={() => trigger("unmount", p)}
                      innerRef={setBtnRef("unmount", p)}
                    >
                      {a ? `Confirm: Unmount ${p}` : `Unmount ${p}`}
                    </Action>
                    {a && (
                      <button type="button" className="btn btn-neutral" onClick={() => setArmed(null)}>
                        Cancel
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </div>
            {mounted.some((d) => isArmed("unmount", doorwayShort(d.name!))) && <p className="hint">This sends a real Sepolia transaction.</p>}
          </div>
          <div className="group">
            <h3 className="label">Vendor fires an agent</h3>
            <p className="hint">One transaction from the vendor. The agent goes dark under every doorway.</p>
            <div className="btn-row">
              {active.length === 0 && <span className="hint">No active agents.</span>}
              {active.map((ag) => {
                const a = isArmed("fire", ag.label);
                return (
                  <Fragment key={ag.label}>
                    <Action icon={UserMinus} tone="danger" busy={is("fire", ag.label)} disabled={locked} onClick={() => trigger("fire", ag.label)} innerRef={setBtnRef("fire", ag.label)}>
                      {a ? `Confirm: Fire ${ag.label}` : `Fire ${ag.label}`}
                    </Action>
                    {a && (
                      <button type="button" className="btn btn-neutral" onClick={() => setArmed(null)}>
                        Cancel
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </div>
            {active.some((ag) => isArmed("fire", ag.label)) && <p className="hint">This sends a real Sepolia transaction.</p>}
          </div>
          <div className="group">
            <h3 className="label">Settlement address</h3>
            <p className="hint">
              Currently <span className="mono">{shortAddr(scan?.settlement.address)}</span>, {dirty ? "flagged" : scan?.settlement.screen ?? "unknown"}.
            </p>
            <div className="btn-row">
              {dirty ? (
                <Action icon={Wallet} tone="neutral" busy={is("clean")} disabled={locked} onClick={() => trigger("clean")} innerRef={setBtnRef("clean", undefined)}>
                  {isArmed("clean") ? "Confirm: Restore clean address" : "Restore clean address"}
                </Action>
              ) : (
                <Action icon={WarningCircle} tone="warn" busy={is("dirty")} disabled={locked} onClick={() => trigger("dirty")} innerRef={setBtnRef("dirty", undefined)}>
                  {isArmed("dirty") ? "Confirm: Use a sanctioned address" : "Use a sanctioned address"}
                </Action>
              )}
              {isArmed(settlementAction) && (
                <button type="button" className="btn btn-neutral" onClick={() => setArmed(null)}>
                  Cancel
                </button>
              )}
            </div>
            {isArmed(settlementAction) && <p className="hint">This sends a real Sepolia transaction.</p>}
          </div>
          <div className="group group-last">
            <div className="btn-row">
              <Action icon={ArrowCounterClockwise} tone="neutral" busy={is("reset")} disabled={locked} onClick={() => trigger("reset")} innerRef={setBtnRef("reset", undefined)}>
                {isArmed("reset") ? "Confirm: Reset the demo" : "Reset the demo"}
              </Action>
              {isArmed("reset") && (
                <button type="button" className="btn btn-neutral" onClick={() => setArmed(null)}>
                  Cancel
                </button>
              )}
            </div>
            {isArmed("reset") && <p className="hint">This sends a real Sepolia transaction.</p>}
          </div>
          <div className="outcome" aria-live="polite">
            {pending ? (
              <p className="outcome-line pending">
                {LABEL[pending.action]}
                {pending.target ? ` ${pending.target}` : ""}. Waiting for the receipt.
              </p>
            ) : outcome ? (
              <>
                <p className={`outcome-line ${outcome.ok ? "ok" : "bad"}`}>{outcome.summary}</p>
                {outcome.txs.length > 0 && (
                  <div className="chips">
                    {outcome.txs.slice(-3).map((t) => (
                      <CopyChip key={t.hash} label="Tx" value={t.hash} display={shortAddr(t.hash)} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
