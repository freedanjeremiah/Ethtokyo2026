// app/src/lib/playbook.ts — playbooks: the demo as an editable, runnable workflow of nodes and wires. Client only.
//
// A playbook is plain data (so it saves in this browser and travels in a share link): nodes placed on a canvas and
// wires between their ports. The run starts at the trigger and follows the wires. Chain nodes become one or more
// wallet-signed transactions planned by /api/actions and continue on "next" when they succeed; a check node reads
// /api/verify and continues on "pass" when the verdict is the one it expects, or on "fail" otherwise.

import type { Verdict } from "@enf/verifier";
import type { ActionName } from "./fleet-types";

export type StepKind = "unmount" | "fire" | "dirty" | "clean" | "counterfeit" | "reset" | "check";

export type Step = {
  id: string;
  kind: StepKind;
  /** unmount: parent label (shopb); fire: agent label (mia). */
  target?: string;
  /** check: the name to verify. */
  name?: string;
  /** check: the verdict the step expects; "any" only reports it. */
  expect?: Verdict | "any";
};

/** A step placed on the canvas; x/y are canvas units (top-left of the node). */
export type WNode = Step & { x: number; y: number };

/** Output ports: chain nodes and the trigger have "next"; check nodes have "pass" (as expected) and "fail" (otherwise). */
export type Port = "next" | "pass" | "fail";

/** A wire from one output port to a node's input. `from` is a node id or "trigger". Each output holds one wire. */
export type Edge = { id: string; from: string; port: Port; to: string };

export type Playbook = { id: string; title: string; nodes: WNode[]; edges: Edge[] };

export const TRIGGER = "trigger";

export function portsOf(kind: StepKind | "trigger"): Port[] {
  return kind === "check" ? ["pass", "fail"] : ["next"];
}

export const PORT_LABEL: Record<Port, string> = { next: "Then", pass: "As expected", fail: "Otherwise" };

/** What each block is called, who signs it, and what it does, in the product's own words. */
export const BLOCKS: Record<StepKind, { title: string; signer: string; blurb: string; chain: boolean }> = {
  unmount: { title: "Unmount a doorway", signer: "The merchant", blurb: "One transaction from the merchant. Only its doorway goes dark.", chain: true },
  fire: { title: "Fire an agent", signer: "The vendor", blurb: "One transaction from the vendor. The agent goes dark under every doorway.", chain: true },
  dirty: { title: "Use a sanctioned settlement address", signer: "The operator", blurb: "Points the fleet's default addr(60) at an OFAC-listed address. Endorsed doorways turn flagged.", chain: true },
  clean: { title: "Restore the clean settlement address", signer: "The operator", blurb: "Points the default addr(60) back at the fleet's own settlement address.", chain: true },
  counterfeit: { title: "Mount the counterfeit doorway", signer: "scam.eth's owner", blurb: "Mounts the fleet under support.scam.eth without the fleet's consent.", chain: true },
  reset: { title: "Reset the demo", signer: "Each owner in turn", blurb: "Remounts every doorway, rehires every agent and restores the clean address.", chain: true },
  check: { title: "Check a name", signer: "No signature", blurb: "Resolves the name through ENS and runs the verifier's checks.", chain: false },
};

/** The order blocks appear in the + menu. */
export const BLOCK_ORDER: StepKind[] = ["check", "unmount", "fire", "dirty", "clean", "counterfeit", "reset"];

export const EXPECT_LABEL: Record<Verdict | "any", string> = {
  any: "Any verdict",
  green: "Verified",
  red: "Counterfeit",
  orange: "Flagged",
  black: "Not live",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export function makeStep(kind: StepKind, defaults: { parent?: string; agent?: string } = {}): Step {
  const step: Step = { id: newId(), kind };
  if (kind === "unmount") step.target = defaults.parent ?? "shopb";
  if (kind === "fire") step.target = defaults.agent ?? "mia";
  if (kind === "check") {
    step.name = `${defaults.agent ?? "mia"}.support.${defaults.parent ?? "shopa"}.eth`;
    step.expect = "any";
  }
  return step;
}

export function actionOf(step: Step): ActionName | null {
  return step.kind === "check" ? null : step.kind;
}

/** One line naming what the step does to which target, for cards, logs and screen readers. */
export function stepSummary(step: Step): string {
  switch (step.kind) {
    case "unmount":
      return `Unmount support.${step.target}.eth`;
    case "fire":
      return `Fire ${step.target}`;
    case "check":
      return `Check ${step.name || "a name"}`;
    default:
      return BLOCKS[step.kind].title;
  }
}

/** The part of the fleet map a step acts on, so hovering a step can point at it. */
export function stepTouches(step: Step): { doorway: string | null; agent: string | null; resolver: boolean } {
  switch (step.kind) {
    case "unmount":
      return { doorway: `support.${step.target}.eth`, agent: null, resolver: false };
    case "counterfeit":
      return { doorway: "support.scam.eth", agent: null, resolver: false };
    case "fire":
      return { doorway: null, agent: step.target ?? null, resolver: false };
    case "dirty":
    case "clean":
      return { doorway: null, agent: null, resolver: true };
    case "check": {
      const m = /^([^.]+)\.(support\.[^.]+\.eth)$/.exec(step.name ?? "");
      return { doorway: m?.[2] ?? null, agent: m?.[1] ?? null, resolver: false };
    }
    default:
      return { doorway: null, agent: null, resolver: false };
  }
}

// ---------------------------------------------------------------- graph helpers

/** The node a port's wire leads to, if any. */
export function nextOf(p: Playbook, from: string, port: Port): WNode | null {
  const e = p.edges.find((x) => x.from === from && x.port === port);
  return e ? (p.nodes.find((n) => n.id === e.to) ?? null) : null;
}

/** True when a wire from `from` to `to` would close a loop (so the run could never end). */
export function wouldLoop(p: Playbook, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of p.edges) if (e.from === id) stack.push(e.to);
  }
  return false;
}

/** Connects (or reconnects) an output port; returns the playbook unchanged when the wire is not allowed. */
export function connect(p: Playbook, from: string, port: Port, to: string): Playbook {
  if (to === TRIGGER || wouldLoop(p, from, to)) return p;
  const edges = p.edges.filter((e) => !(e.from === from && e.port === port));
  return { ...p, edges: [...edges, { id: newId(), from, port, to }] };
}

/** Nodes the run can reach from the trigger, in run order along the first path (for hints and the rail). */
export function reachable(p: Playbook): Set<string> {
  const out = new Set<string>();
  const stack = p.edges.filter((e) => e.from === TRIGGER).map((e) => e.to);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const e of p.edges) if (e.from === id) stack.push(e.to);
  }
  return out;
}

export const NODE_W = 272;
export const COL = 392;
export const ROW = 236;
export const TRIGGER_POS = { x: 40, y: 120 };

/** Tidy layout: each node one column right of the node that leads to it; branches stack below. */
export function tidy(p: Playbook): Playbook {
  const pos = new Map<string, { x: number; y: number }>();
  let row = 0;
  const place = (id: string, col: number, r: number) => {
    if (pos.has(id)) return;
    pos.set(id, { x: TRIGGER_POS.x + col * COL, y: TRIGGER_POS.y + r * ROW });
    const outs = p.edges.filter((e) => e.from === id).sort((a, b) => (a.port === "fail" ? 1 : 0) - (b.port === "fail" ? 1 : 0));
    outs.forEach((e, i) => {
      if (i > 0) row += 1;
      place(e.to, col + 1, i === 0 ? r : row);
    });
  };
  for (const e of p.edges.filter((x) => x.from === TRIGGER)) place(e.to, 1, row);
  let loose = row + 1;
  const nodes = p.nodes.map((n) => {
    const at = pos.get(n.id);
    if (at) return { ...n, ...at };
    const x = TRIGGER_POS.x + COL;
    const y = TRIGGER_POS.y + loose++ * ROW;
    return { ...n, x, y };
  });
  return { ...p, nodes };
}

/** A straight line of steps: trigger → 1 → 2 …, checks continuing on "As expected". */
export function linear(id: string, title: string, steps: Step[], branches: Edge[] = []): Playbook {
  const nodes: WNode[] = steps.map((st, i) => ({ ...st, id: st.id || `${id}-${i}`, x: 0, y: 0 }));
  const edges: Edge[] = [];
  let prev = TRIGGER;
  let port: Port = "next";
  nodes.forEach((n, i) => {
    edges.push({ id: `${id}-e${i}`, from: prev, port, to: n.id });
    prev = n.id;
    port = n.kind === "check" ? "pass" : "next";
  });
  return tidy({ id, title, nodes, edges: [...edges, ...branches] });
}

// ---------------------------------------------------------------- presets (the demo script)

const s = (kind: StepKind, extra: Partial<Step> = {}): Step => ({ id: "", kind, ...extra });

/** Node ids are derived from the preset, not random, so the server and the browser render the same markup. */
export function presets(): Playbook[] {
  const branchy = (() => {
    const id = "preset-branch";
    const steps: Step[] = [
      s("check", { id: `${id}-0`, name: "mia.support.shopb.eth", expect: "green" }),
      s("unmount", { id: `${id}-1`, target: "shopb" }),
      s("check", { id: `${id}-2`, name: "mia.support.shopb.eth", expect: "black" }),
    ];
    const reset: Step = s("reset", { id: `${id}-3` });
    const p = linear(id, "Unmount shopb, resetting first if needed", steps);
    const withReset: Playbook = { ...p, nodes: [...p.nodes, { ...reset, x: 0, y: 0 }] };
    return tidy({
      ...withReset,
      edges: [...withReset.edges, { id: `${id}-f`, from: `${id}-0`, port: "fail", to: `${id}-3` }, { id: `${id}-r`, from: `${id}-3`, port: "next", to: `${id}-1` }],
    });
  })();
  return [
    linear("preset-demo", "The full demo", [
      s("check", { name: "mia.support.shopa.eth", expect: "green" }),
      s("unmount", { target: "shopb" }),
      s("check", { name: "mia.support.shopb.eth", expect: "black" }),
      s("fire", { target: "mia" }),
      s("check", { name: "mia.support.shopa.eth", expect: "black" }),
      s("check", { name: "kai.support.scam.eth", expect: "red" }),
    ]),
    linear("preset-merchant", "A merchant fires the vendor", [
      s("unmount", { target: "shopb" }),
      s("check", { name: "kai.support.shopb.eth", expect: "black" }),
      s("check", { name: "kai.support.shopa.eth", expect: "green" }),
    ]),
    linear("preset-vendor", "The vendor fires one agent everywhere", [
      s("fire", { target: "mia" }),
      s("check", { name: "mia.support.shopa.eth", expect: "black" }),
      s("check", { name: "mia.support.vendor.eth", expect: "black" }),
    ]),
    linear("preset-counterfeit", "A counterfeit doorway gets caught", [
      s("check", { name: "kai.support.scam.eth", expect: "red" }),
      s("check", { name: "kai.support.shopa.eth", expect: "green" }),
    ]),
    linear("preset-screening", "A dirty settlement address", [
      s("dirty"),
      s("check", { name: "rin.support.shopa.eth", expect: "orange" }),
      s("clean"),
      s("check", { name: "rin.support.shopa.eth", expect: "green" }),
    ]),
    branchy,
    linear("preset-reset", "Reset the demo", [s("reset"), s("check", { name: "mia.support.shopb.eth", expect: "green" })]),
  ];
}

// ---------------------------------------------------------------- saving and sharing

const STORE = "enf.playbooks.v2";
const KINDS = new Set<StepKind>(["unmount", "fire", "dirty", "clean", "counterfeit", "reset", "check"]);
const VERDICTS = new Set(["green", "red", "orange", "black", "any"]);
const PORTS = new Set<Port>(["next", "pass", "fail"]);
const LABEL = /^[a-z0-9-]{1,63}$/;

function cleanStep(x: unknown): Step | null {
  const k = (x as { kind?: unknown })?.kind;
  if (typeof k !== "string" || !KINDS.has(k as StepKind)) return null;
  const step: Step = { id: newId(), kind: k as StepKind };
  const t = (x as { target?: unknown }).target;
  if ((k === "unmount" || k === "fire") && typeof t === "string" && LABEL.test(t)) step.target = t;
  if (k === "check") {
    const n = (x as { name?: unknown }).name;
    const e = (x as { expect?: unknown }).expect;
    step.name = typeof n === "string" ? n.slice(0, 255) : "";
    step.expect = typeof e === "string" && VERDICTS.has(e) ? (e as Step["expect"]) : "any";
  }
  if ((k === "unmount" || k === "fire") && !step.target) return null;
  return step;
}

/** Accepts only well-formed nodes and wires, so a hand-edited link or stale storage can never produce a bad request.
 * The older list format ({ steps }) still opens, laid out as a straight line. */
function clean(raw: unknown): Playbook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { id?: unknown; title?: unknown; steps?: unknown; nodes?: unknown; edges?: unknown };
  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 80) : "Untitled playbook";
  const id = typeof r.id === "string" ? r.id.slice(0, 40) : newId();
  if (Array.isArray(r.steps)) {
    const steps = r.steps.slice(0, 40).map(cleanStep).filter((x): x is Step => !!x);
    return { ...linear(newId(), title, steps.map((st) => ({ ...st, id: newId() }))), id };
  }
  if (!Array.isArray(r.nodes)) return null;
  const idMap = new Map<string, string>();
  const nodes: WNode[] = [];
  for (const x of r.nodes.slice(0, 60)) {
    const st = cleanStep(x);
    const oldId = (x as { id?: unknown }).id;
    if (!st || typeof oldId !== "string") continue;
    const nx = Number((x as { x?: unknown }).x);
    const ny = Number((x as { y?: unknown }).y);
    idMap.set(oldId, st.id);
    nodes.push({ ...st, x: Number.isFinite(nx) ? Math.max(-4000, Math.min(8000, nx)) : 0, y: Number.isFinite(ny) ? Math.max(-4000, Math.min(8000, ny)) : 0 });
  }
  let p: Playbook = { id, title, nodes, edges: [] };
  for (const e of Array.isArray(r.edges) ? r.edges.slice(0, 120) : []) {
    const from = (e as { from?: unknown }).from;
    const to = (e as { to?: unknown }).to;
    const port = (e as { port?: unknown }).port;
    if (typeof from !== "string" || typeof to !== "string" || typeof port !== "string" || !PORTS.has(port as Port)) continue;
    const f = from === TRIGGER ? TRIGGER : idMap.get(from);
    const t = idMap.get(to);
    if (!f || !t) continue;
    const fromNode = nodes.find((n) => n.id === f);
    if (!portsOf(fromNode ? fromNode.kind : "trigger").includes(port as Port)) continue;
    p = connect(p, f, port as Port, t);
  }
  return p;
}

/** Short ids keep share links compact. */
const strip = (p: Playbook) => {
  const short = new Map(p.nodes.map((n, i) => [n.id, `n${i}`]));
  return {
    title: p.title,
    nodes: p.nodes.map(({ id, x, y, ...rest }) => ({ id: short.get(id), x: Math.round(x), y: Math.round(y), ...rest })),
    edges: p.edges.map((e) => ({ from: e.from === TRIGGER ? TRIGGER : short.get(e.from), port: e.port, to: short.get(e.to) })),
  };
};

export function encodePlaybook(p: Playbook): string {
  const bytes = new TextEncoder().encode(JSON.stringify(strip(p)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlaybook(code: string): Playbook | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const p = clean(JSON.parse(json));
    return p ? { ...p, id: newId() } : null;
  } catch {
    return null;
  }
}

function write(list: Playbook[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.map((x) => ({ id: x.id, ...strip(x) }))));
  } catch {
    // Storage is off (private window): the share link still carries the playbook.
  }
}

export function loadSaved(): Playbook[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.map(clean).filter((p): p is Playbook => !!p) : [];
  } catch {
    return [];
  }
}

export function savePlaybook(p: Playbook): Playbook[] {
  const next = [{ ...p }, ...loadSaved().filter((x) => x.id !== p.id)].slice(0, 20);
  write(next);
  return next;
}

export function deleteSaved(id: string): Playbook[] {
  const next = loadSaved().filter((x) => x.id !== id);
  write(next);
  return next;
}
