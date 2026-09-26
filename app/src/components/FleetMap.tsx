// The fleet map: every doorway found on chain -> the one fleet registry -> its agents -> the shared resolver.
// Wide screens get the SVG diagram; phones get the same topology as a stacked list (no hidden scroll box).
import { ArrowDown } from "@phosphor-icons/react";
import type { FleetScan } from "@/lib/fleet-types";
import { Avatar, Tag, type Tone, avatarColors, shortAddr } from "./ui";

// SVG user units. The map renders at roughly 0.83x on a 1440 screen, so type is sized in units
// that land at >= 15px for labels and >= 14px for tags.
const W = 1000;
const ROW = 108;
const PAD = 10;
const DOOR = { x: 2, w: 296, h: 86 };
const FLEET = { x: 370, w: 226, h: 184 };
const AGENT = { x: 640, w: 172, h: 72 };
const RES = { x: 830, w: 168, h: 184 };

type Door = FleetScan["doorways"][number];
type Mount = "endorsed" | "counterfeit" | "dead";

const mountOf = (d: Door): Mount => (!d.mounted ? "dead" : d.declared ? "endorsed" : "counterfeit");

function doorTag(d: Door): { text: string; tone: Tone } {
  if (!d.discovered) return { text: "Unmounted", tone: "grey" };
  if (!d.mounted) return { text: "Unmounted", tone: "grey" };
  if (!d.declared) return { text: "Counterfeit", tone: "red" };
  return d.canonical ? { text: "Canonical", tone: "blue" } : { text: "Endorsed", tone: "green" };
}

function settleTag(scan: FleetScan): { text: string; tone: Tone } {
  const s = scan.settlement.screen;
  if (s === "clean") return { text: "Clean", tone: "green" };
  if (s === "flagged") return { text: "Flagged", tone: "orange" };
  if (s === "unknown") return { text: "Unknown", tone: "grey" };
  return { text: "Not screened", tone: "grey" };
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(36, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function spread(i: number, n: number, center: number, span: number) {
  return n <= 1 ? center : center - span / 2 + (i * span) / (n - 1);
}

/** An SVG pill tag; width estimated from the label (Satoshi bold at 17 units ~ 9.4 per char). */
function SvgTag({ x, y, text, tone }: { x: number; y: number; text: string; tone: Tone }) {
  const w = Math.round(text.length * 9.4 + 24);
  return (
    <g className={`svg-tag tone-${tone}`} transform={`translate(${x} ${y})`}>
      <rect width={w} height={28} rx={14} />
      <text x={w / 2} y={19.5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

type Props = {
  scan: FleetScan;
  focus: { doorway: string | null; agent: string | null };
  onFocus: (f: { doorway: string | null; agent: string | null }) => void;
  onSelect: (name: string) => void;
};

function MapSvg({ scan, focus, onFocus, onSelect }: Props) {
  const doors = scan.doorways;
  const agents = scan.agents;
  const rows = Math.max(doors.length, agents.length, 3);
  const H = rows * ROW + PAD * 2;
  const cy = H / 2;
  const rowY = (i: number, n: number) => PAD + ((i + 0.5) * (H - PAD * 2)) / n;
  const firstActive = agents.find((a) => a.active)?.label ?? agents[0]?.label;
  const focused = !!(focus.doorway || focus.agent);
  const doorDim = (d: Door) => focused && !!focus.doorway && focus.doorway !== d.name;
  const agentDim = (label: string) => focused && !!focus.agent && focus.agent !== label;
  const st = settleTag(scan);

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fleet map: doorways, the fleet registry, agents and the shared resolver">
      <defs>
        {(["endorsed", "counterfeit", "dead"] as const).map((m) => (
          <marker key={m} id={`arrow-${m}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={`arrow ${m}`} />
          </marker>
        ))}
        {agents.map((a) => {
          const [c1, c2] = avatarColors(a.label);
          return (
            <linearGradient key={a.label} id={`av-${a.label}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c1} />
              <stop offset="1" stopColor={c2} />
            </linearGradient>
          );
        })}
      </defs>

      {doors.map((d, i) => {
        const m = mountOf(d);
        return (
          <path
            key={`e-${d.name ?? d.registry}`}
            className={`edge ${m}${doorDim(d) || (focus.agent && !focus.doorway) ? " dim" : ""}`}
            d={curve(DOOR.x + DOOR.w, rowY(i, doors.length), FLEET.x - 4, spread(i, doors.length, cy, FLEET.h - 44))}
            markerEnd={`url(#arrow-${m})`}
          />
        );
      })}
      {agents.map((a, i) => {
        const y = rowY(i, agents.length);
        const dim = agentDim(a.label) || (!!focus.doorway && !focus.agent) ? " dim" : "";
        return (
          <g key={`e-a-${a.label}`}>
            <path className={`edge ${a.active ? "endorsed" : "dead"}${dim}`} d={curve(FLEET.x + FLEET.w, spread(i, agents.length, cy, FLEET.h - 56), AGENT.x, y)} />
            <path className={`edge thin ${a.active ? "" : "dead"}${dim}`} d={curve(AGENT.x + AGENT.w, y, RES.x, spread(i, agents.length, cy, RES.h - 56))} />
          </g>
        );
      })}

      {doors.map((d, i) => {
        const y = rowY(i, doors.length);
        const tag = doorTag(d);
        const target = d.name && firstActive ? `${firstActive}.${d.name}` : null;
        return (
          <g
            key={`n-${d.name ?? d.registry}`}
            className={`node door ${mountOf(d)}${doorDim(d) ? " dim" : ""}`}
            transform={`translate(${DOOR.x} ${y - DOOR.h / 2})`}
            onMouseEnter={() => onFocus({ doorway: d.name, agent: null })}
            onMouseLeave={() => onFocus({ doorway: null, agent: null })}
            onFocus={() => onFocus({ doorway: d.name, agent: null })}
            onBlur={() => onFocus({ doorway: null, agent: null })}
            onClick={() => target && onSelect(target)}
            onKeyDown={(e) => e.key === "Enter" && target && onSelect(target)}
            tabIndex={0}
            role="button"
            aria-label={`${d.name ?? d.registry}: ${tag.text}. Inspect ${target ?? ""}`}
          >
            <rect width={DOOR.w} height={DOOR.h} rx={16} />
            <text x={18} y={34} className="n-name">
              {d.name ?? `${d.label} @ ${shortAddr(d.registry)}`}
            </text>
            <SvgTag x={18} y={46} text={tag.text} tone={tag.tone} />
          </g>
        );
      })}

      <g className="node fleet" transform={`translate(${FLEET.x} ${cy - FLEET.h / 2})`}>
        <rect width={FLEET.w} height={FLEET.h} rx={18} />
        <text x={20} y={40} className="n-label">
          Fleet registry
        </text>
        <text x={20} y={72} className="n-name mono">
          {shortAddr(scan.fleetRegistry)}
        </text>
        <text x={20} y={120} className="n-label">
          Canonical name
        </text>
        <text x={20} y={150} className="n-sub">
          {scan.canonical ?? "not set"}
        </text>
      </g>

      {agents.map((a, i) => {
        const y = rowY(i, agents.length);
        const target = scan.canonical ? `${a.label}.${scan.canonical}` : null;
        return (
          <g
            key={`n-a-${a.label}`}
            className={`node agent${a.active ? "" : " fired"}${agentDim(a.label) ? " dim" : ""}`}
            transform={`translate(${AGENT.x} ${y - AGENT.h / 2})`}
            onMouseEnter={() => onFocus({ doorway: null, agent: a.label })}
            onMouseLeave={() => onFocus({ doorway: null, agent: null })}
            onFocus={() => onFocus({ doorway: null, agent: a.label })}
            onBlur={() => onFocus({ doorway: null, agent: null })}
            onClick={() => target && onSelect(target)}
            onKeyDown={(e) => e.key === "Enter" && target && onSelect(target)}
            tabIndex={0}
            role="button"
            aria-label={`Agent ${a.label}: ${a.active ? "active" : "fired"}`}
          >
            <rect width={AGENT.w} height={AGENT.h} rx={36} />
            <circle cx={36} cy={AGENT.h / 2} r={21} fill={`url(#av-${a.label})`} className="n-avatar" />
            <text x={68} y={32} className="n-name">
              {a.label}
            </text>
            <text x={68} y={55} className="n-sub">
              {a.active ? "Active" : "Fired"}
            </text>
          </g>
        );
      })}

      <g className="node resolver" transform={`translate(${RES.x} ${cy - RES.h / 2})`}>
        <rect width={RES.w} height={RES.h} rx={18} />
        <text x={16} y={40} className="n-label">
          Shared resolver
        </text>
        <text x={16} y={86} className="n-label">
          Settlement
        </text>
        <text x={16} y={114} className="n-sub mono">
          {shortAddr(scan.settlement.address)}
        </text>
        <SvgTag x={16} y={132} text={st.text} tone={st.tone} />
      </g>
    </svg>
  );
}

function MapStack({ scan, onSelect }: Props) {
  const firstActive = scan.agents.find((a) => a.active)?.label ?? scan.agents[0]?.label;
  const st = settleTag(scan);
  return (
    <div className="map-stack">
      <ul className="stack-list">
        {scan.doorways.map((d) => {
          const t = doorTag(d);
          const target = d.name && firstActive ? `${firstActive}.${d.name}` : null;
          return (
            <li key={d.name ?? d.registry}>
              <button type="button" className={`stack-item ${mountOf(d)}`} onClick={() => target && onSelect(target)}>
                <span className="stack-name">{d.name ?? shortAddr(d.registry)}</span>
                <Tag tone={t.tone}>{t.text}</Tag>
              </button>
            </li>
          );
        })}
      </ul>
      <ArrowDown size={20} weight="bold" className="stack-arrow" aria-hidden />
      <div className="stack-item fleet">
        <span className="stack-label">Fleet registry</span>
        <span className="stack-name mono">{shortAddr(scan.fleetRegistry)}</span>
        <span className="stack-label">Canonical: {scan.canonical ?? "not set"}</span>
      </div>
      <ArrowDown size={20} weight="bold" className="stack-arrow" aria-hidden />
      <ul className="stack-list agents">
        {scan.agents.map((a) => (
          <li key={a.label}>
            <button
              type="button"
              className={`stack-item agent${a.active ? "" : " fired"}`}
              onClick={() => scan.canonical && onSelect(`${a.label}.${scan.canonical}`)}
            >
              <Avatar label={a.label} size={28} dim={!a.active} />
              <span className="stack-name">{a.label}</span>
              <Tag tone={a.active ? "green" : "grey"}>{a.active ? "Active" : "Fired"}</Tag>
            </button>
          </li>
        ))}
      </ul>
      <div className="stack-item resolver">
        <span className="stack-label">Settles to</span>
        <span className="stack-name mono">{shortAddr(scan.settlement.address)}</span>
        <Tag tone={st.tone}>{st.text}</Tag>
      </div>
    </div>
  );
}

export function FleetMap(props: Props) {
  return (
    <>
      <MapSvg {...props} />
      <MapStack {...props} />
    </>
  );
}
