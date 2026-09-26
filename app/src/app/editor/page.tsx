"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowsOutSimple, MagnifyingGlass, MapTrifold, TreeStructure, WarningCircle, X } from "@phosphor-icons/react";
import type { FleetScan } from "@/lib/fleet-types";
import {
  COL,
  NODE_W,
  type Playbook as PlaybookData,
  type Port,
  type Edge,
  type Step,
  type StepKind,
  TRIGGER,
  type WNode,
  TRIGGER_POS,
  connect,
  decodePlaybook,
  makeStep,
  nextOf,
  portsOf,
  presets,
  stepTouches,
} from "@/lib/playbook";
import { useFleetData } from "@/lib/useFleetData";
import { useRunner } from "@/lib/useRunner";
import { useWallet } from "@/lib/wallet";
import { Activity } from "@/components/Activity";
import { Coverage } from "@/components/Coverage";
import { DetailsPanel, type DetailsTab } from "@/components/DetailsPanel";
import { FleetMap } from "@/components/FleetMap";
import { Inspector } from "@/components/Inspector";
import { Playbook } from "@/components/Playbook";
import { type Selection, WorkflowCanvas } from "@/components/WorkflowCanvas";
import { Card, CopyChip, Skeleton, fmtBlock, shortAddr } from "@/components/ui";
import { WalletButton } from "@/components/WalletButton";

type Focus = { doorway: string | null; agent: string | null };

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

/** A side panel's collapsed state: remembered in this browser (a convenience, fine to lose) and toggled by a key. */
function usePanel(storageKey: string, key: string) {
  const [collapsed, setCollapsedState] = useState(false);
  useEffect(() => {
    try {
      setCollapsedState(localStorage.getItem(storageKey) === "1");
    } catch {
      // storage unavailable
    }
  }, [storageKey]);
  const set = useCallback(
    (v: boolean) => {
      setCollapsedState(v);
      try {
        localStorage.setItem(storageKey, v ? "1" : "0");
      } catch {
        // storage unavailable
      }
    },
    [storageKey],
  );
  const toggle = useCallback(() => {
    setCollapsedState((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !c;
    });
  }, [storageKey]);
  // The key toggles the panel, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, toggle]);
  return { collapsed, set, toggle };
}

const doorLabel = (name: string | null) => /^support\.([^.]+)\.eth$/.exec(name ?? "")?.[1] ?? null;

export default function EditorPage() {
  const d = useFleetData();
  const { account } = useWallet();
  const [focus, setFocus] = useState<Focus>({ doorway: null, agent: null });
  const [playbook, setPlaybook] = useState<PlaybookData>(() => presets()[0]!);
  const [hovered, setHovered] = useState<Step | null>(null);
  const inspectRef = useRef<(name: string) => void>(() => {});
  const runner = useRunner({ onChainChange: d.refreshAll, onChecked: (name) => inspectRef.current(name) });
  const left = usePanel("fns.playbook.collapsed", "[");
  const right = usePanel("fns.details.collapsed", "]");
  const collapsed = left.collapsed;
  const setCollapsed = left.set;
  const toggle = left.toggle;
  const [tab, setTab] = useState<DetailsTab>("verifier");

  // Picking a name anywhere (map node, coverage cell, check result) shows its evidence in the verifier.
  const inspect = useCallback(
    (name: string) => {
      d.select(name);
      setTab("verifier");
      right.set(false);
    },
    [d.select, right.set],
  );

  inspectRef.current = inspect;

  // A step waiting for an account switch needs the prompt, which lives in the expanded column.
  useEffect(() => {
    if (runner.need && collapsed) setCollapsed(false);
  }, [runner.need, collapsed, setCollapsed]);

  // A shared ?playbook= link opens that playbook instead of the default demo; a broken one says so.
  const [badShareLink, setBadShareLink] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("playbook");
    const shared = code ? decodePlaybook(code) : null;
    if (shared) setPlaybook(shared);
    else if (code) setBadShareLink(true);
  }, []);

  const parents = useMemo(() => {
    const fromScan = (d.scan?.doorways ?? []).map((x) => doorLabel(x.name)).filter((x): x is string => !!x);
    return fromScan.length ? fromScan : ["vendor", "shopa", "shopb", "scam"];
  }, [d.scan]);
  const agents = useMemo(() => (d.scan?.agents.length ? d.scan.agents.map((a) => a.label) : ["mia", "kai", "rin"]), [d.scan]);

  const pointed = hovered ?? playbook.nodes.find((s) => s.id === runner.activeId) ?? null;
  const highlight = pointed ? stepTouches(pointed) : null;
  const [view, setView] = useState<"workflow" | "map">("workflow");
  const [selection, setSelection] = useState<Selection>(null);
  const [miniOpen, setMiniOpen] = useState(true);

  /** Places a new node without covering another one. */
  const freeSpot = (p: PlaybookData, x: number, y: number) => {
    let yy = y;
    while (p.nodes.some((n) => Math.abs(n.x - x) < NODE_W && Math.abs(n.y - yy) < 180)) yy += 200;
    return { x, y: yy };
  };

  /** Palette click: add after the selected node (or at the end of the main path) and wire it in. */
  const addAfter = (kind: StepKind) => {
    const p = playbook;
    let from: string = selection?.type === "node" && p.nodes.some((n) => n.id === selection.id) ? selection.id : TRIGGER;
    if (from === TRIGGER) {
      // Walk the main path from the trigger to its last node.
      for (let i = 0; i < 60; i++) {
        const at: string = from;
        const cur: WNode | undefined = p.nodes.find((n) => n.id === at);
        const port: Port = cur?.kind === "check" ? "pass" : "next";
        const e: Edge | undefined = p.edges.find((x) => x.from === at && x.port === port);
        if (!e) break;
        from = e.to;
      }
    }
    const srcNode = p.nodes.find((n) => n.id === from);
    const src = srcNode ?? { x: TRIGGER_POS.x, y: TRIGGER_POS.y, kind: "trigger" as const };
    const base = srcNode ? { x: srcNode.x + COL, y: srcNode.y } : { x: TRIGGER_POS.x + COL, y: TRIGGER_POS.y };
    const node = { ...makeStep(kind, { parent: parents.find((x) => x !== "vendor") ?? parents[0], agent: agents[0] }), ...freeSpot(p, base.x, base.y) };
    const free = portsOf(src.kind).find((port) => !p.edges.some((e) => e.from === from && e.port === port));
    let next: PlaybookData = { ...p, nodes: [...p.nodes, node] };
    if (free) next = connect(next, from, free, node.id);
    else {
      // Every output is taken: splice the new node into the main one (from → new → what came next).
      const main: Port = src.kind === "check" ? "pass" : "next";
      const old = p.edges.find((e) => e.from === from && e.port === main)!;
      next = connect(next, from, main, node.id);
      next = connect(next, node.id, kind === "check" ? "pass" : "next", old.to);
      // Make room: shift everything right of the insertion point one column over.
      next = { ...next, nodes: next.nodes.map((n) => (n.id !== node.id && n.x >= base.x - 8 ? { ...n, x: n.x + COL } : n)) };
      node.x = base.x;
      node.y = base.y;
      next = { ...next, nodes: next.nodes.map((n) => (n.id === node.id ? { ...n, x: base.x, y: base.y } : n)) };
    }
    setPlaybook(next);
    setSelection({ type: "node", id: node.id });
    setView("workflow");
  };

  const dropBlock = (kind: StepKind, x: number, y: number) => {
    const node = { ...makeStep(kind, { parent: parents.find((v) => v !== "vendor") ?? parents[0], agent: agents[0] }), x, y };
    setPlaybook((p) => ({ ...p, nodes: [...p.nodes, node] }));
    setSelection({ type: "node", id: node.id });
  };

  const runAll = () => {
    const p = playbook;
    const start = nextOf(p, TRIGGER, "next");
    runner.runFlow(start, (st, outcome) => nextOf(p, st.id, outcome));
  };

  const miniMap = d.scan ? (
    miniOpen ? (
      <div className="mini-live">
        <div className="mini-live-head">
          <span>Live fleet</span>
          <button type="button" className="icon-btn" onClick={() => setView("map")} aria-label="Open the fleet map" title="Open the fleet map">
            <ArrowsOutSimple size={14} weight="bold" aria-hidden />
          </button>
          <button type="button" className="icon-btn" onClick={() => setMiniOpen(false)} aria-label="Hide the live fleet" title="Hide">
            <X size={14} weight="bold" aria-hidden />
          </button>
        </div>
        <FleetMap scan={d.scan} focus={{ doorway: null, agent: null }} onFocus={() => {}} onSelect={inspect} highlight={highlight} />
      </div>
    ) : (
      <button type="button" className="tool-btn" onClick={() => setMiniOpen(true)}>
        <MapTrifold size={16} weight="bold" aria-hidden />
        Live fleet
      </button>
    )
  ) : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="FNS home">
            <span className="brand-name">FNS</span>
            <span className="brand-sub">Playbook editor</span>
          </Link>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              d.setCommitted(d.input.trim());
              d.setErrorVisible(true);
              setTab("verifier");
            }}
          >
            <label htmlFor="name-search" className="sr-only">
              Verify an ENS name
            </label>
            <MagnifyingGlass size={18} weight="bold" className="search-icon" aria-hidden />
            <input
              id="name-search"
              value={d.input}
              onChange={(e) => {
                d.setInput(e.target.value);
                d.setErrorVisible(false);
              }}
              onBlur={() => d.setErrorVisible(true)}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              placeholder="Verify a name, e.g. kai.support.scam.eth"
              aria-invalid={d.errorVisible && !!d.inputError}
              aria-describedby={d.errorVisible && d.inputError ? "search-error" : undefined}
            />
            {d.errorVisible && d.inputError && (
              <span id="search-error" className="search-error" role="alert">
                {d.inputError}
              </span>
            )}
          </form>
          <div className="topbar-end">
            <WalletButton />
            <div className={`block-pill${d.rpcDown ? " down" : ""}`}>
              {d.rpcDown ? (
                <>
                  <WarningCircle size={16} weight="bold" aria-hidden /> RPC unreachable
                </>
              ) : d.blockNumber ? (
                <>
                  <span className="live" aria-hidden /> <span className="block-word">Block</span> <span className="num">{fmtBlock(d.blockNumber)}</span>
                </>
              ) : (
                "Connecting"
              )}
            </div>
          </div>
        </div>
      </header>
      <span className="sr-only" role="status">
        {d.connMsg}
      </span>

      <main className={`editor${collapsed ? " collapsed" : ""}${right.collapsed ? " details-collapsed" : ""}`}>
        <Playbook
          playbook={playbook}
          onChange={setPlaybook}
          runs={runner.runs}
          running={runner.running}
          need={runner.need}
          account={account}
          onRun={runAll}
          onCancel={runner.cancel}
          onSwitchAccount={runner.switchAccount}
          onAdd={addAfter}
          collapsed={collapsed}
          onToggle={toggle}
        />

        <div className="workspace stage">
          {d.rpcDown && (
            <p className="notice tone-orange banner" role="alert">
              RPC not answering. Retrying; showing the last block read.
            </p>
          )}

          {badShareLink && (
            <p className="notice tone-orange banner" role="alert">
              This share link is broken or incomplete, so the demo playbook is open instead.
            </p>
          )}

          {d.scan && d.scan.doorways.some((x) => x.name === d.scan!.canonical && !x.mounted) && (
            <p className="notice tone-orange banner" role="status">
              {d.scan.canonical} is unmounted. Run &ldquo;Reset the demo&rdquo; to remount.
            </p>
          )}

          <div className="title-row">
            <div className="title-text">
              {d.scan ? (
                <>
                  <h1 className="page-title">{d.scan.canonical ?? "FNS fleet"}</h1>
                  <Summary scan={d.scan} />
                </>
              ) : (
                <div className="stack">
                  <Skeleton h={34} w={280} />
                  <Skeleton h={20} w="min(460px, 100%)" />
                </div>
              )}
            </div>
            {d.scan && (
              <div className="title-chips">
                <CopyChip label="Fleet registry" value={d.scan.fleetRegistry} display={shortAddr(d.scan.fleetRegistry)} />
              </div>
            )}
          </div>

          <section className="card map-card canvas-card" aria-label={view === "workflow" ? "Workflow" : "Fleet map"}>
            <header className="card-head">
              <div className="tabs view-tabs" role="tablist" aria-label="Canvas">
                <button type="button" role="tab" aria-selected={view === "workflow"} className="tab" onClick={() => setView("workflow")}>
                  <TreeStructure size={16} weight="bold" aria-hidden />
                  Workflow
                </button>
                <button type="button" role="tab" aria-selected={view === "map"} className="tab" onClick={() => setView("map")}>
                  <MapTrifold size={16} weight="bold" aria-hidden />
                  Fleet map
                </button>
              </div>
              {view === "map" ? (
                <span className="legend">
                  <span className="lg endorsed" /> Endorsed <span className="lg counterfeit" /> Counterfeit <span className="lg dead" /> Unmounted
                </span>
              ) : (
                <span className="canvas-legend">
                  <span className="lg-wire next" /> Then <span className="lg-wire pass" /> As expected <span className="lg-wire fail" /> Otherwise
                </span>
              )}
            </header>
            {view === "workflow" ? (
              <WorkflowCanvas
                playbook={playbook}
                onChange={setPlaybook}
                runs={runner.runs}
                activeId={runner.activeId}
                trail={runner.trail}
                locked={runner.running}
                parents={parents}
                agents={agents}
                selection={selection}
                onSelect={setSelection}
                onHover={setHovered}
                onInspect={inspect}
                onRunNode={(n) => runner.run([n])}
                onDropBlock={dropBlock}
                corner={miniMap}
              />
            ) : d.scan ? (
              <FleetMap scan={d.scan} focus={focus} onFocus={setFocus} onSelect={inspect} highlight={highlight} />
            ) : d.scanError ? (
              <p className="empty">{d.scanError}</p>
            ) : (
              <Skeleton h={340} r={14} />
            )}
          </section>
        </div>

        <DetailsPanel
          tab={tab}
          onTab={setTab}
          collapsed={right.collapsed}
          onToggle={right.toggle}
          panels={{
            verifier: <Inspector result={d.result} loading={d.loading} verifyingName={d.committed} scanBlock={d.scan?.blockNumber ?? null} onSelect={inspect} />,
            coverage: d.scan ? <Coverage scan={d.scan} selected={d.result?.normalized ?? null} focus={focus} onFocus={setFocus} onSelect={inspect} /> : <Skeleton h={260} r={16} />,
            activity: d.scan ? <Activity scan={d.scan} /> : <Skeleton h={200} r={16} />,
          }}
        />
      </main>
    </>
  );
}
