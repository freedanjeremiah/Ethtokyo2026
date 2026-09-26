// Kill switches (fork only). Each button runs the matching fork-tested scripts/demo-*.ts on the server.
import { useEffect, useState } from "react";
import { ArrowCounterClockwise, CircleNotch, LinkBreak, UserMinus, Wallet, WarningCircle, type Icon } from "@phosphor-icons/react";
import type { ActionName, ActionResult, ActionsInfo, FleetScan } from "@/lib/fleet-types";
import { Card, CopyChip, Tag, doorwayShort, shortAddr } from "./ui";

type Pending = { action: ActionName; target?: string } | null;
type Outcome = { ok: boolean; summary: string; txs: { what: string; hash: string }[] };

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
}: {
  icon: Icon;
  tone: "danger" | "warn" | "neutral";
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    // Kill switches are ENS secondary actions (blue); only the icon carries the destructive cue.
    <button type="button" className={`btn ${tone === "neutral" ? "btn-neutral" : "btn-action"}`} disabled={disabled} onClick={onClick} aria-busy={busy}>
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

  // Re-check availability whenever a new scan lands, so the panel recovers after an RPC outage.
  const scanBlock = scan?.blockNumber;
  useEffect(() => {
    fetch("/api/actions", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: ActionsInfo) => setInfo(b))
      .catch(() => setInfo({ enabled: false, reason: "Could not reach the server.", parents: [], agents: [], chain: null }));
  }, [scanBlock]);

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

  const live = !!info?.enabled;
  const locked = !live || !!pending;
  const is = (a: ActionName, t?: string) => pending?.action === a && pending?.target === t;
  const mounted = (scan?.doorways ?? []).filter((d) => d.mounted && d.name && info?.parents.includes(doorwayShort(d.name)));
  const active = (scan?.agents ?? []).filter((a) => a.active && info?.agents.includes(a.label));
  const dirty = scan?.settlement.screen === "flagged";

  return (
    <Card id="controls-h" title="Kill switches" aside={info && (live ? <Tag tone="blue">{info.chain === "live" ? "Sepolia" : "Local fork"}</Tag> : <Tag>Read only</Tag>)} className="controls">
      {info && !live ? (
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
                return (
                  <Action key={p} icon={LinkBreak} tone="danger" busy={is("unmount", p)} disabled={locked} onClick={() => run("unmount", p)}>
                    {`Unmount ${p}`}
                  </Action>
                );
              })}
            </div>
          </div>
          <div className="group">
            <h3 className="label">Vendor fires an agent</h3>
            <p className="hint">One transaction from the vendor. The agent goes dark under every doorway.</p>
            <div className="btn-row">
              {active.length === 0 && <span className="hint">No active agents.</span>}
              {active.map((a) => (
                <Action key={a.label} icon={UserMinus} tone="danger" busy={is("fire", a.label)} disabled={locked} onClick={() => run("fire", a.label)}>
                  {`Fire ${a.label}`}
                </Action>
              ))}
            </div>
          </div>
          <div className="group">
            <h3 className="label">Settlement address</h3>
            <p className="hint">
              Currently <span className="mono">{shortAddr(scan?.settlement.address)}</span>, {dirty ? "flagged" : scan?.settlement.screen ?? "unknown"}.
            </p>
            <div className="btn-row">
              {dirty ? (
                <Action icon={Wallet} tone="neutral" busy={is("clean")} disabled={locked} onClick={() => run("clean")}>
                  Restore clean address
                </Action>
              ) : (
                <Action icon={WarningCircle} tone="warn" busy={is("dirty")} disabled={locked} onClick={() => run("dirty")}>
                  Use a sanctioned address
                </Action>
              )}
            </div>
          </div>
          <div className="group group-last">
            <Action icon={ArrowCounterClockwise} tone="neutral" busy={is("reset")} disabled={locked} onClick={() => run("reset")}>
              Reset the demo
            </Action>
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
