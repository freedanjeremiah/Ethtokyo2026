// The workflow canvas: playbook nodes you drag, wire and edit in place. The run starts at the trigger and follows the
// wires; a check node branches on "As expected" / "Otherwise". Pan by dragging the background (or scrolling), zoom
// with the buttons or ctrl/cmd + scroll. Nodes also move with the arrow keys and connect from their menu, so the whole
// canvas works without a pointer.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowsOutSimple, DotsThree, Lightning, LinkBreak, Minus, Play, Plus, Trash, TreeStructure, X, Copy } from "@phosphor-icons/react";
import {
  BLOCKS,
  EXPECT_LABEL,
  NODE_W,
  PORT_LABEL,
  type Playbook,
  type Port,
  type Step,
  type StepKind,
  TRIGGER,
  TRIGGER_POS,
  type WNode,
  connect,
  newId,
  portsOf,
  tidy,
  wouldLoop,
} from "@/lib/playbook";
import type { StepRun } from "@/lib/useRunner";
import { BLOCK_MIME, ICON, MenuItem, Popover, StatusIcon } from "./Playbook";
import { CopyChip, VerdictTag, shortAddr } from "./ui";

/** Port positions inside a node, in canvas units from its top-left. The head is a fixed 64 units tall. */
const IN_Y = 32;
const OUT_Y: Record<Port, number> = { next: 32, pass: 22, fail: 46 };
const TRIGGER_W = 212;

export type Selection = { type: "node" | "edge"; id: string } | null;

type View = { x: number; y: number; k: number };

type Props = {
  playbook: Playbook;
  onChange: (p: Playbook) => void;
  runs: Record<string, StepRun>;
  activeId: string | null;
  trail: string[];
  locked: boolean;
  parents: string[];
  agents: string[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Step | null) => void;
  onInspect: (name: string) => void;
  onRunNode: (s: Step) => void;
  /** Adds a block at a canvas point (palette drop). */
  onDropBlock: (k: StepKind, x: number, y: number) => void;
  /** Docked in the corner: the live mini map. */
  corner?: ReactNode;
};

const nodeAt = (p: Playbook, id: string) => (id === TRIGGER ? { x: TRIGGER_POS.x, y: TRIGGER_POS.y, kind: "trigger" as const } : p.nodes.find((n) => n.id === id));

function outPoint(p: Playbook, from: string, port: Port) {
  const n = nodeAt(p, from);
  if (!n) return null;
  return { x: n.x + (from === TRIGGER ? TRIGGER_W : NODE_W), y: n.y + OUT_Y[port] };
}

function wirePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** The fields a node edits in place: the doorway, the agent, or the name and the expected verdict. */
function NodeFields({ node, locked, parents, agents, onChange }: { node: WNode; locked: boolean; parents: string[]; agents: string[]; onChange: (n: WNode) => void }) {
  if (node.kind === "unmount")
    return (
      <label className="field">
        <span className="field-label">Doorway</span>
        <select value={node.target} disabled={locked} onChange={(e) => onChange({ ...node, target: e.target.value })}>
          {[...new Set([...parents, node.target ?? ""])].filter(Boolean).map((p) => (
            <option key={p} value={p}>
              support.{p}.eth
            </option>
          ))}
        </select>
      </label>
    );
  if (node.kind === "fire")
    return (
      <label className="field">
        <span className="field-label">Agent</span>
        <select value={node.target} disabled={locked} onChange={(e) => onChange({ ...node, target: e.target.value })}>
          {[...new Set([...agents, node.target ?? ""])].filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
    );
  if (node.kind === "check")
    return (
      <>
        <label className="field grow">
          <span className="field-label">Name</span>
          <input
            value={node.name ?? ""}
            disabled={locked}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            placeholder="kai.support.scam.eth"
            onChange={(e) => onChange({ ...node, name: e.target.value })}
          />
        </label>
        <label className="field grow">
          <span className="field-label">Expect</span>
          <select value={node.expect ?? "any"} disabled={locked} onChange={(e) => onChange({ ...node, expect: e.target.value as Step["expect"] })}>
            {(["any", "green", "red", "orange", "black"] as const).map((v) => (
              <option key={v} value={v}>
                {EXPECT_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  return null;
}

export function WorkflowCanvas({ playbook, onChange, runs, activeId, trail, locked, parents, agents, selection, onSelect, onHover, onInspect, onRunNode, onDropBlock, corner }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [draft, setDraft] = useState<{ from: string; port: Port; x: number; y: number; over: string | null; blocked: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2800);
    return () => clearTimeout(t);
  }, [note]);
  const [dropHint, setDropHint] = useState(false);
  const pbRef = useRef(playbook);
  pbRef.current = playbook;
  const viewRef = useRef(view);
  viewRef.current = view;

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const r = viewport.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  }, []);

  /** Frames every node in the viewport. */
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const p = pbRef.current;
    const pts = [{ x: TRIGGER_POS.x, y: TRIGGER_POS.y, w: TRIGGER_W, h: 90 }, ...p.nodes.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: 190 }))];
    const minX = Math.min(...pts.map((q) => q.x)) - 40;
    const minY = Math.min(...pts.map((q) => q.y)) - 40;
    const maxX = Math.max(...pts.map((q) => q.x + q.w)) + 90;
    const maxY = Math.max(...pts.map((q) => q.y + q.h)) + 40;
    const { width, height } = el.getBoundingClientRect();
    // Never shrink below a readable 70%: a long workflow starts at the trigger and pans from there.
    const k = Math.max(0.7, Math.min(1.1, Math.min(width / (maxX - minX), height / (maxY - minY))));
    const fitsX = (maxX - minX) * k <= width;
    const fitsY = (maxY - minY) * k <= height;
    setView({
      k,
      x: fitsX ? (width - (maxX - minX) * k) / 2 - minX * k : 24 - minX * k,
      y: fitsY ? (height - (maxY - minY) * k) / 2 - minY * k : 24 - minY * k,
    });
  }, []);

  // Frame a newly loaded playbook.
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
  }, [playbook.id, fit]);

  // Follow the run: bring the running node into view (clear of the tools and the docked map) when it is not.
  useEffect(() => {
    if (!activeId) return;
    const el = viewport.current;
    const n = pbRef.current.nodes.find((x) => x.id === activeId);
    if (!el || !n) return;
    const { width, height } = el.getBoundingClientRect();
    const v = viewRef.current;
    const left = n.x * v.k + v.x;
    const top = n.y * v.k + v.y;
    const w = NODE_W * v.k;
    const h = 200 * v.k;
    const safeRight = width - (corner ? 330 : 24);
    if (left >= 24 && top >= 24 && left + w <= safeRight && top + h <= height - 70) return;
    // Centre it in the free area between the left edge and the docked map.
    setView((cur) => ({ ...cur, x: (24 + safeRight - w) / 2 - n.x * cur.k, y: (height - 70 - h) / 2 - n.y * cur.k }));
  }, [activeId, corner]);

  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const el = viewport.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    setView((v) => {
      const k = Math.max(0.35, Math.min(1.6, v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };

  // Scroll pans; ctrl/cmd + scroll (and trackpad pinch) zooms around the pointer. Non-passive, so it must be native.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".canvas-corner, .pop-panel, select")) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Delete removes the selection; Escape clears it. Arrow keys nudge a selected node (shift for bigger steps).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        setDraft(null);
        onSelect(null);
        return;
      }
      if (!selection || locked) return;
      const p = pbRef.current;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selection.type === "edge") onChange({ ...p, edges: p.edges.filter((x) => x.id !== selection.id) });
        else onChange({ ...p, nodes: p.nodes.filter((n) => n.id !== selection.id), edges: p.edges.filter((x) => x.from !== selection.id && x.to !== selection.id) });
        onSelect(null);
        return;
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d && selection.type === "node" && (e.target as HTMLElement).closest(".wnode")) {
        e.preventDefault();
        const step = e.shiftKey ? 64 : 16;
        onChange({ ...p, nodes: p.nodes.map((n) => (n.id === selection.id ? { ...n, x: n.x + d[0]! * step, y: n.y + d[1]! * step } : n)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, locked, onChange, onSelect]);

  // ---------------------------------------------------------------- pointer: pan, drag, wire

  function startPan(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    onSelect(null);
    const start = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startDrag(e: ReactPointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, .port")) return;
    e.preventDefault();
    onSelect({ type: "node", id });
    if (locked) return;
    const node = pbRef.current.nodes.find((n) => n.id === id);
    if (!node) return;
    const start = toCanvas(e.clientX, e.clientY);
    const origin = { x: node.x, y: node.y };
    const move = (ev: PointerEvent) => {
      const at = toCanvas(ev.clientX, ev.clientY);
      const snap = (v: number) => Math.round(v / 8) * 8;
      const p = pbRef.current;
      onChange({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, x: snap(origin.x + at.x - start.x), y: snap(origin.y + at.y - start.y) } : n)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startWire(e: ReactPointerEvent, from: string, port: Port) {
    if (e.button !== 0 || locked) return;
    e.preventDefault();
    e.stopPropagation();
    const at = toCanvas(e.clientX, e.clientY);
    setDraft({ from, port, x: at.x, y: at.y, over: null, blocked: null });
    /** The node under the pointer, and whether a wire to it is allowed (no wire into the trigger, no loops). */
    const targetAt = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const id = el?.closest<HTMLElement>("[data-node]")?.dataset.node ?? null;
      if (!id || id === TRIGGER) return { ok: null, blocked: null };
      return wouldLoop(pbRef.current, from, id) ? { ok: null, blocked: id } : { ok: id, blocked: null };
    };
    const move = (ev: PointerEvent) => {
      const p = toCanvas(ev.clientX, ev.clientY);
      const t = targetAt(ev);
      setDraft({ from, port, x: p.x, y: p.y, over: t.ok, blocked: t.blocked });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const t = targetAt(ev);
      setDraft(null);
      if (t.ok) onChange(connect(pbRef.current, from, port, t.ok));
      else if (t.blocked) setNote(t.blocked === from ? "A node can't lead to itself." : "That wire would loop back to an earlier step, so the run could never end.");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---------------------------------------------------------------- render

  const p = playbook;
  const taken = new Set(trail);
  const selEdge = selection?.type === "edge" ? p.edges.find((e) => e.id === selection.id) : null;

  const outPorts = (id: string, kind: StepKind | "trigger") =>
    portsOf(kind).map((port) => {
      const wired = p.edges.some((e) => e.from === id && e.port === port);
      return (
        <span key={port} className={`port-wrap port-${port}`} style={{ top: OUT_Y[port] }}>
          <button
            type="button"
            className={`port out${wired ? " wired" : ""}`}
            onPointerDown={(e) => startWire(e, id, port)}
            disabled={locked}
            aria-label={`${PORT_LABEL[port]}: drag to a node to connect`}
            title={`${PORT_LABEL[port]}: drag to a node`}
          />
          {kind === "check" && <span className="port-label">{PORT_LABEL[port]}</span>}
        </span>
      );
    });

  const connectItems = (id: string, kind: StepKind, close: () => void) =>
    portsOf(kind).flatMap((port) => {
      const targets = p.nodes.filter((n) => n.id !== id && !wouldLoop(p, id, n.id));
      const wired = p.edges.find((e) => e.from === id && e.port === port);
      return [
        <p key={`h-${port}`} className="menu-heading">
          {PORT_LABEL[port]}: connect to
        </p>,
        ...targets.map((t) => (
          <MenuItem key={`${port}-${t.id}`} icon={TreeStructure} onClick={() => (onChange(connect(p, id, port, t.id)), close())}>
            {p.nodes.indexOf(t) + 1}. {BLOCKS[t.kind].title}
            {wired?.to === t.id ? " (connected)" : ""}
          </MenuItem>
        )),
        ...(wired
          ? [
              <MenuItem key={`d-${port}`} icon={LinkBreak} onClick={() => (onChange({ ...p, edges: p.edges.filter((e) => e.id !== wired.id) }), close())}>
                Disconnect {PORT_LABEL[port].toLowerCase()}
              </MenuItem>,
            ]
          : []),
      ];
    });

  const draftFrom = draft ? outPoint(p, draft.from, draft.port) : null;

  return (
    <div
      ref={viewport}
      className={`canvas${dropHint ? " drop" : ""}${draft ? " wiring" : ""}`}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px` }}
      onPointerDown={(e) => e.target === e.currentTarget && startPan(e)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(BLOCK_MIME) || locked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropHint(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropHint(false)}
      onDrop={(e) => {
        setDropHint(false);
        const kind = e.dataTransfer.getData(BLOCK_MIME) as StepKind;
        if (!kind || locked) return;
        e.preventDefault();
        const at = toCanvas(e.clientX, e.clientY);
        onDropBlock(kind, Math.round((at.x - NODE_W / 2) / 8) * 8, Math.round((at.y - 32) / 8) * 8);
      }}
      role="application"
      aria-label="Workflow canvas. Drag the background to pan, drag nodes to move them, drag from an output dot to an input to connect."
    >
      <div className="canvas-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="wires" width="1" height="1" aria-hidden>
          {p.edges.map((e) => {
            const a = outPoint(p, e.from, e.port);
            const b = nodeAt(p, e.to);
            if (!a || !b) return null;
            const d = wirePath(a.x, a.y, b.x, b.y + IN_Y);
            const cls = `wire port-${e.port}${taken.has(`${e.from}:${e.port}`) ? " taken" : ""}${selEdge?.id === e.id ? " selected" : ""}`;
            return (
              <g key={e.id}>
                <path d={d} className="wire-hit" onPointerDown={(ev) => (ev.stopPropagation(), onSelect({ type: "edge", id: e.id }))} />
                <path d={d} className={cls} />
              </g>
            );
          })}
          {draft && draftFrom && <path d={wirePath(draftFrom.x, draftFrom.y, draft.x, draft.y)} className={`wire draft port-${draft.port}`} />}
        </svg>

        {selEdge &&
          (() => {
            const a = outPoint(p, selEdge.from, selEdge.port);
            const b = nodeAt(p, selEdge.to);
            if (!a || !b) return null;
            return (
              <button
                type="button"
                className="wire-delete"
                style={{ left: (a.x + b.x) / 2, top: (a.y + b.y + IN_Y) / 2 }}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => (onChange({ ...p, edges: p.edges.filter((x) => x.id !== selEdge.id) }), onSelect(null))}
                aria-label="Remove this connection"
                title="Remove this connection (Delete)"
              >
                <X size={14} weight="bold" aria-hidden />
              </button>
            );
          })()}

        <div className="wnode trigger" data-node={TRIGGER} style={{ left: TRIGGER_POS.x, top: TRIGGER_POS.y, width: TRIGGER_W }}>
          <div className="wnode-head">
            <span className="step-icon tile-blue">
              <Lightning size={18} weight="fill" aria-hidden />
            </span>
            <div className="step-titles">
              <h3 className="step-title">When you press Run</h3>
              <p className="step-signer">Start</p>
            </div>
          </div>
          {outPorts(TRIGGER, "trigger")}
        </div>

        {p.nodes.map((n, i) => {
          const run = runs[n.id];
          const { I, tone } = ICON[n.kind];
          const b = BLOCKS[n.kind];
          const sel = selection?.type === "node" && selection.id === n.id;
          const fields = NodeFields({ node: n, locked, parents, agents, onChange: (nn) => onChange({ ...p, nodes: p.nodes.map((x) => (x.id === nn.id ? nn : x)) }) });
          return (
            <div
              key={n.id}
              data-node={n.id}
              className={`wnode status-${run?.status ?? "idle"}${sel ? " selected" : ""}${activeId === n.id ? " active" : ""}${draft?.over === n.id ? " target" : ""}${draft?.blocked === n.id ? " blocked" : ""}`}
              style={{ left: n.x, top: n.y, width: NODE_W }}
              onPointerDown={(e) => startDrag(e, n.id)}
              onMouseEnter={() => onHover(n)}
              onMouseLeave={() => onHover(null)}
              onFocus={(e) => {
                onHover(n);
                if (e.target === e.currentTarget) onSelect({ type: "node", id: n.id });
              }}
              onBlur={() => onHover(null)}
              tabIndex={0}
              role="group"
              aria-label={`Node ${i + 1}: ${b.title}. Arrow keys move it; Delete removes it.`}
            >
              <span className="port in" aria-hidden />
              <div className="wnode-head">
                <span className={`step-icon tile-${tone}`}>
                  <I size={18} weight="bold" aria-hidden />
                </span>
                <div className="step-titles">
                  <h3 className="step-title">{b.title}</h3>
                  <p className="step-signer">{b.chain ? `Signed by ${b.signer.toLowerCase()}` : "Read only"}</p>
                </div>
                <StatusIcon run={run} />
                <Popover label={<span className="sr-only">Node {i + 1} options</span>} icon={DotsThree} className="step-menu" disabled={locked}>
                  {(close) => (
                    <>
                      <MenuItem icon={Play} onClick={() => (onRunNode(n), close())}>
                        Run only this node
                      </MenuItem>
                      <MenuItem
                        icon={Copy}
                        onClick={() => {
                          const copy = { ...n, id: newId(), x: n.x + 32, y: n.y + 32 };
                          onChange({ ...p, nodes: [...p.nodes, copy] });
                          onSelect({ type: "node", id: copy.id });
                          close();
                        }}
                      >
                        Duplicate
                      </MenuItem>
                      {connectItems(n.id, n.kind, close)}
                      <div className="menu-sep" />
                      <MenuItem
                        icon={Trash}
                        tone="red"
                        onClick={() => {
                          onChange({ ...p, nodes: p.nodes.filter((x) => x.id !== n.id), edges: p.edges.filter((x) => x.from !== n.id && x.to !== n.id) });
                          onSelect(null);
                          close();
                        }}
                      >
                        Remove node
                      </MenuItem>
                    </>
                  )}
                </Popover>
              </div>
              {fields && <div className="wnode-fields">{fields}</div>}
              {run && run.status !== "idle" && run.status !== "queued" && (
                <div className={`step-result status-${run.status}`}>
                  {run.verdict && (
                    <div className="step-verdict">
                      <button type="button" className="verdict-link" onClick={() => n.name && onInspect(n.name)} title="Show the evidence in the verifier">
                        <VerdictTag verdict={run.verdict} />
                      </button>
                      {n.expect && n.expect !== "any" && <span className={`expect ${run.pass ? "text-green" : "text-red"}`}>{run.pass ? "As expected" : `Expected ${EXPECT_LABEL[n.expect]}`}</span>}
                    </div>
                  )}
                  {run.message && <p className="step-message">{run.message}</p>}
                  {run.txs.length > 0 && (
                    <div className="chips">
                      {run.txs.slice(-2).map((t) => (
                        <CopyChip key={t.hash} label="Tx" value={t.hash} display={shortAddr(t.hash)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {outPorts(n.id, n.kind)}
            </div>
          );
        })}
      </div>

      {note && (
        <p className="canvas-note" role="status">
          {note}
        </p>
      )}

      {p.nodes.length === 0 && (
        <p className="canvas-empty">Drag a block from the left onto the canvas, then wire the trigger&apos;s dot to it.</p>
      )}

      <div className="canvas-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out">
          <Minus size={16} weight="bold" aria-hidden />
        </button>
        <span className="zoom num">{Math.round(view.k * 100)}%</span>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
          <Plus size={16} weight="bold" aria-hidden />
        </button>
        <button type="button" className="icon-btn" onClick={fit} aria-label="Fit the workflow" title="Fit the workflow">
          <ArrowsOutSimple size={16} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={locked}
          onClick={() => {
            onChange(tidy(p));
            setTimeout(fit, 30);
          }}
          title="Lay nodes out along the wires"
        >
          <TreeStructure size={16} weight="bold" aria-hidden />
          Tidy
        </button>
      </div>

      {corner && (
        <div className="canvas-corner" onPointerDown={(e) => e.stopPropagation()}>
          {corner}
        </div>
      )}
    </div>
  );
}
