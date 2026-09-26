// The playbook column: the workflow's name, its library (demo playbooks, saved ones, share link), the block palette
// you drag or click onto the canvas, and Run. Collapses to a rail. Chain blocks are signed in the browser wallet.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowCounterClockwise,
  CaretLineLeft,
  CaretLineRight,
  CheckCircle,
  CircleNotch,
  Detective,
  FloppyDisk,
  FolderOpen,
  Lightning,
  LinkBreak,
  LinkSimple,
  MagnifyingGlass,
  MinusCircle,
  Play,
  Plus,
  Stop,
  Trash,
  UserMinus,
  Wallet,
  WarningCircle,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  BLOCKS,
  BLOCK_ORDER,
  type Playbook as PlaybookData,
  type StepKind,
  TRIGGER,
  deleteSaved,
  encodePlaybook,
  loadSaved,
  newId,
  presets,
  reachable,
  savePlaybook,
} from "@/lib/playbook";
import type { Need, StepRun } from "@/lib/useRunner";
import { shortAddr, type Tone } from "./ui";

export const ICON: Record<StepKind, { I: Icon; tone: Tone | "neutral" }> = {
  check: { I: MagnifyingGlass, tone: "blue" },
  unmount: { I: LinkBreak, tone: "red" },
  fire: { I: UserMinus, tone: "red" },
  dirty: { I: WarningCircle, tone: "orange" },
  clean: { I: Wallet, tone: "neutral" },
  counterfeit: { I: Detective, tone: "red" },
  reset: { I: ArrowCounterClockwise, tone: "neutral" },
};

/** Drag payload type for palette blocks dropped on the canvas. */
export const BLOCK_MIME = "application/x-enf-block";

/** A small popover anchored to its trigger. It is positioned against the viewport (fixed), so the scrolling step
 * list cannot clip it, opens upward when there is more room above, and follows its trigger on scroll. Closes on Escape,
 * outside click, or a choice. */
export function Popover({ label, icon: I, children, className = "", disabled = false }: { label: ReactNode; icon: Icon; children: (close: () => void) => ReactNode; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function placement(): CSSProperties {
    const r = trigger.current!.getBoundingClientRect();
    const centered = className.includes("insert");
    const width = centered ? Math.min(350, window.innerWidth - 24) : undefined;
    // Stay clear of the sticky top bar: the step column's stacking context sits beneath it.
    const topSafe = (document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0) + 8;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - topSafe - 6;
    const up = above > below;
    const style: CSSProperties = { position: "fixed", maxHeight: Math.max(160, Math.min(520, up ? above : below)) };
    if (up) style.bottom = window.innerHeight - r.top + 6;
    else style.top = r.bottom + 6;
    if (centered) {
      style.width = width;
      style.left = Math.max(12, Math.min(window.innerWidth - width! - 12, r.left + r.width / 2 - width! / 2));
    } else if (className.includes("tool")) {
      style.left = Math.max(12, r.left);
    } else {
      style.right = Math.max(12, window.innerWidth - r.right);
    }
    return style;
  }

  function toggle() {
    if (open) return setOpen(false);
    setPlace(placement());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Follow the trigger when the list or page scrolls; close once it leaves the viewport.
    const onMove = (e: Event) => {
      if (ref.current?.querySelector(".pop-panel")?.contains(e.target as Node)) return;
      const r = trigger.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return setOpen(false);
      setPlace(placement());
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);
  return (
    <div className={`pop ${className}`} ref={ref}>
      <button ref={trigger} type="button" className="pop-trigger" aria-expanded={open} aria-haspopup="menu" disabled={disabled} onClick={toggle}>
        <I size={18} weight="bold" aria-hidden />
        {label}
      </button>
      {open && (
        <div className="pop-panel" role="menu" style={place}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: I, children, onClick, tone, disabled }: { icon: Icon; children: ReactNode; onClick: () => void; tone?: Tone | "neutral"; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onClick} disabled={disabled}>
      <I size={18} weight="bold" className={tone && tone !== "neutral" ? `text-${tone}` : undefined} aria-hidden />
      <span>{children}</span>
    </button>
  );
}

export function StatusIcon({ run }: { run?: StepRun }) {
  switch (run?.status) {
    case "running":
      return <CircleNotch size={20} weight="bold" className="spin text-blue" aria-label="Running" />;
    case "done":
      return <CheckCircle size={20} weight="fill" className="text-green" aria-label="Done" />;
    case "failed":
      return <XCircle size={20} weight="fill" className="text-red" aria-label="Failed" />;
    case "cancelled":
      return <MinusCircle size={20} weight="fill" className="text-grey" aria-label="Not run" />;
    case "queued":
      return <span className="queued-dot" aria-label="Queued" />;
    default:
      return null;
  }
}


type Props = {
  playbook: PlaybookData;
  onChange: (p: PlaybookData) => void;
  runs: Record<string, StepRun>;
  running: boolean;
  need: Need;
  account: string | null;
  onRun: () => void;
  onCancel: () => void;
  onSwitchAccount: () => void;
  /** Adds a block next to the selected node (or at the end of the flow). */
  onAdd: (k: StepKind) => void;
  collapsed: boolean;
  onToggle: () => void;
};

/** One palette block: drag it onto the canvas, or press it to add it after the selected node. */
function Block({ kind, onAdd, disabled, compact = false }: { kind: StepKind; onAdd: (k: StepKind) => void; disabled: boolean; compact?: boolean }) {
  const { I, tone } = ICON[kind];
  const b = BLOCKS[kind];
  return (
    <button
      type="button"
      className={compact ? "rail-step" : "block-choice palette-block"}
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(BLOCK_MIME, kind);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onAdd(kind)}
      title={compact ? `Add: ${b.title}` : undefined}
      aria-label={compact ? `Add ${b.title}` : undefined}
    >
      <span className={`step-icon tile-${tone}`}>
        <I size={18} weight="bold" aria-hidden />
      </span>
      {!compact && (
        <span className="block-text">
          <span className="block-title">{b.title}</span>
          <span className="block-blurb">{b.chain ? `${b.signer} signs.` : "Read only."} {b.blurb}</span>
        </span>
      )}
    </button>
  );
}

function Rail({ running, onRun, onCancel, onToggle, onAdd, playbook }: Props) {
  const runnable = playbook.edges.some((e) => e.from === TRIGGER);
  return (
    <aside className="playbook rail" aria-label={`Playbook: ${playbook.title} (collapsed)`}>
      <button type="button" className="rail-btn" onClick={onToggle} aria-label="Expand the playbook" title="Expand the playbook ( [ )">
        <CaretLineRight size={18} weight="bold" aria-hidden />
      </button>
      <div className="rail-steps" aria-label="Blocks">
        {BLOCK_ORDER.map((k) => (
          <Block key={k} kind={k} onAdd={onAdd} disabled={running} compact />
        ))}
      </div>
      {running ? (
        <button type="button" className="rail-run rail-cancel" onClick={onCancel} aria-label="Cancel run" title="Cancel run">
          <Stop size={18} weight="fill" aria-hidden />
        </button>
      ) : (
        <button type="button" className="rail-run" disabled={!runnable} onClick={onRun} aria-label="Run playbook" title="Run playbook">
          <Play size={18} weight="fill" aria-hidden />
        </button>
      )}
    </aside>
  );
}

export function Playbook(props: Props) {
  return props.collapsed ? <Rail {...props} /> : <PlaybookPanel {...props} />;
}

function PlaybookPanel({ playbook, onChange, running, need, account, onRun, onCancel, onSwitchAccount, onAdd, onToggle }: Props) {
  const [saved, setSaved] = useState<PlaybookData[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => setSaved(loadSaved()), []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(t);
  }, [note]);

  const load = (p: PlaybookData) => {
    // Fresh node ids so a loaded copy never shares run state with the one on screen.
    const ids = new Map(p.nodes.map((n) => [n.id, newId()]));
    onChange({
      id: p.id.startsWith("preset-") ? newId() : p.id,
      title: p.title,
      nodes: p.nodes.map((n) => ({ ...n, id: ids.get(n.id)! })),
      edges: p.edges.map((e) => ({ ...e, id: newId(), from: e.from === TRIGGER ? TRIGGER : ids.get(e.from)!, to: ids.get(e.to)! })),
    });
  };

  async function share() {
    const url = new URL(window.location.href);
    url.searchParams.set("playbook", encodePlaybook(playbook));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNote("Link copied. Anyone with it opens this playbook.");
    } catch {
      setNote("The link is in the address bar. Copy it from there.");
    }
  }

  const live = reachable(playbook);
  const chainCount = playbook.nodes.filter((n) => live.has(n.id) && BLOCKS[n.kind].chain).length;
  const checkCount = playbook.nodes.filter((n) => live.has(n.id) && !BLOCKS[n.kind].chain).length;
  const loose = playbook.nodes.length - live.size;

  return (
    <aside className="playbook" aria-label="Playbook">
      <div className="pb-head">
        <div className="pb-title-row">
          <label htmlFor="pb-title" className="sr-only">
            Playbook name
          </label>
          <input id="pb-title" className="pb-title" value={playbook.title} disabled={running} onChange={(e) => onChange({ ...playbook, title: e.target.value })} />
          <button type="button" className="icon-btn collapse-btn" onClick={onToggle} aria-label="Collapse the playbook" title="Collapse the playbook ( [ )">
            <CaretLineLeft size={18} weight="bold" aria-hidden />
          </button>
        </div>
        <div className="pb-tools">
          <Popover label="Playbooks" icon={FolderOpen} className="tool" disabled={running}>
            {(close) => (
              <div className="pb-library">
                <p className="menu-heading">Demo playbooks</p>
                {presets().map((p) => (
                  <MenuItem key={p.id} icon={Lightning} onClick={() => (load(p), close())}>
                    {p.title}
                  </MenuItem>
                ))}
                <p className="menu-heading">Saved in this browser</p>
                {saved.length === 0 && <p className="menu-empty">Nothing saved yet.</p>}
                {saved.map((p) => (
                  <div key={p.id} className="saved-row">
                    <MenuItem icon={FloppyDisk} onClick={() => (load(p), close())}>
                      {p.title}
                    </MenuItem>
                    <button type="button" className="icon-btn" aria-label={`Delete ${p.title}`} onClick={() => setSaved(deleteSaved(p.id))}>
                      <Trash size={16} weight="bold" aria-hidden />
                    </button>
                  </div>
                ))}
                <div className="menu-sep" />
                <MenuItem icon={Plus} onClick={() => (onChange({ id: newId(), title: "Untitled playbook", nodes: [], edges: [] }), close())}>
                  New empty playbook
                </MenuItem>
              </div>
            )}
          </Popover>
          <button type="button" className="tool-btn" disabled={running} onClick={() => (setSaved(savePlaybook(playbook)), setNote("Saved in this browser."))}>
            <FloppyDisk size={18} weight="bold" aria-hidden />
            Save
          </button>
          <button type="button" className="tool-btn" onClick={() => void share()}>
            <LinkSimple size={18} weight="bold" aria-hidden />
            Share
          </button>
        </div>
        <p className="pb-note" aria-live="polite">
          {note}
        </p>
      </div>

      <div className="pb-steps palette">
        <p className="palette-hint">Drag a block onto the canvas, or press it to add it after the selected node. Wire an output to an input to set what runs next.</p>
        {BLOCK_ORDER.map((k) => (
          <Block key={k} kind={k} onAdd={onAdd} disabled={running} />
        ))}
      </div>

      <div className="pb-foot">
        {need && (
          <div className="need" role="status">
            <p>
              Switch your wallet to the {need.signer} (<span className="mono">{shortAddr(need.from)}</span>) to sign the next transaction.
            </p>
            <button type="button" className="btn btn-action" onClick={onSwitchAccount}>
              <Wallet size={18} weight="bold" aria-hidden />
              Switch account
            </button>
          </div>
        )}
        {running ? (
          <button type="button" className="btn btn-neutral run-btn" onClick={onCancel}>
            <Stop size={18} weight="fill" aria-hidden />
            Cancel run
          </button>
        ) : (
          <button type="button" className="btn run-btn run-primary" disabled={live.size === 0} onClick={onRun}>
            <Play size={18} weight="fill" aria-hidden />
            Run playbook
          </button>
        )}
        <p className="pb-foot-hint">
          {live.size === 0
            ? "Wire a block to the trigger to run it."
            : `${live.size} ${live.size === 1 ? "node" : "nodes"} on the run path: ${chainCount} signed in your wallet, ${checkCount} checks.${loose ? ` ${loose} not wired in.` : ""}`}
          {account ? "" : " Transactions are signed in your browser wallet."}
        </p>
      </div>
    </aside>
  );
}
