"use client";

// Landing hero: a replay of the demo playbook beside a small copy of the fleet map. It sends nothing; the real
// playbook runs in the editor. Names are the fleet's real names on Sepolia.
import { useEffect, useState } from "react";
import { CheckCircle, CircleNotch, LinkBreak, MagnifyingGlass, Pause, Play, UserMinus, XCircle, type Icon } from "@phosphor-icons/react";
import { avatarColors, type Tone } from "../ui";

type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const DURATION: Record<Phase, number> = { 0: 1500, 1: 1000, 2: 1400, 3: 1000, 4: 1400, 5: 1000, 6: 3600 };

const STEPS: { icon: Icon; tone: Tone; title: string; detail: string; runAt: Phase }[] = [
  { icon: LinkBreak, tone: "red", title: "Unmount", detail: "support.shopb.eth", runAt: 1 },
  { icon: UserMinus, tone: "red", title: "Fire", detail: "mia", runAt: 3 },
  { icon: MagnifyingGlass, tone: "blue", title: "Check", detail: "kai.support.scam.eth", runAt: 5 },
];

const DOORS = [
  { name: "support.vendor.eth", tag: "Canonical", tone: "blue" },
  { name: "support.shopa.eth", tag: "Endorsed", tone: "green" },
  { name: "support.shopb.eth", tag: "Endorsed", tone: "green" },
  { name: "support.scam.eth", tag: "Counterfeit", tone: "red" },
] as const;
const AGENTS = ["mia", "kai", "rin"];

// Mini map geometry, in SVG units.
const W = 640;
const H = 372;
const DOOR = { x: 2, w: 256, h: 64 };
const FLEET = { x: 318, w: 124, h: 150 };
const AGENT = { x: 498, w: 140, h: 58 };
const doorY = (i: number) => 48 + i * 92;
const agentY = (i: number) => 96 + i * 90;
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(30, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

function MiniMap({ phase }: { phase: Phase }) {
  const shopbDead = phase >= 2;
  const miaFired = phase >= 4;
  const checking = phase >= 5;
  const cy = H / 2;
  return (
    <svg className="mini-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fleet map preview: four doorways into one fleet registry with three agents">
      <defs>
        {AGENTS.map((a) => {
          const [c1, c2] = avatarColors(a);
          return (
            <linearGradient key={a} id={`mm-av-${a}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c1} />
              <stop offset="1" stopColor={c2} />
            </linearGradient>
          );
        })}
      </defs>
      {DOORS.map((d, i) => {
        const state = d.tone === "red" ? "counterfeit" : i === 2 && shopbDead ? "dead" : "endorsed";
        return <path key={`e${d.name}`} className={`edge ${state}`} d={curve(DOOR.x + DOOR.w, doorY(i), FLEET.x - 2, cy - 45 + i * 30)} />;
      })}
      {AGENTS.map((a, i) => (
        <path key={`ea${a}`} className={`edge ${a === "mia" && miaFired ? "dead" : "endorsed"}`} d={curve(FLEET.x + FLEET.w, cy - 36 + i * 36, AGENT.x, agentY(i))} />
      ))}
      {DOORS.map((d, i) => {
        const dead = i === 2 && shopbDead;
        const counterfeit = d.tone === "red";
        const tag = dead ? { text: "Unmounted", tone: "grey" } : { text: d.tag, tone: d.tone };
        const tw = tag.text.length * 8.6 + 22;
        return (
          <g
            key={d.name}
            className={`node door${dead ? " dead" : ""}${counterfeit ? " counterfeit" : ""}${counterfeit && checking ? " hl" : ""}`}
            transform={`translate(${DOOR.x} ${doorY(i) - DOOR.h / 2})`}
          >
            <rect width={DOOR.w} height={DOOR.h} rx={14} />
            <text x={16} y={27} className="mm-name">
              {d.name}
            </text>
            <g className={`svg-tag tone-${tag.tone}`} transform="translate(16 35)">
              <rect width={tw} height={22} rx={11} />
              <text x={tw / 2} y={15.5} textAnchor="middle" className="mm-tag">
                {tag.text}
              </text>
            </g>
          </g>
        );
      })}
      <g className="node fleet" transform={`translate(${FLEET.x} ${cy - FLEET.h / 2})`}>
        <rect width={FLEET.w} height={FLEET.h} rx={16} />
        <text x={16} y={34} className="mm-label">
          Fleet
        </text>
        <text x={16} y={56} className="mm-label">
          registry
        </text>
        <text x={16} y={104} className="mm-sub">
          one token
        </text>
        <text x={16} y={126} className="mm-sub">
          per agent
        </text>
      </g>
      {AGENTS.map((a, i) => {
        const fired = a === "mia" && miaFired;
        return (
          <g key={a} className={`node agent${fired ? " fired" : ""}${a === "kai" && checking ? " hl" : ""}`} transform={`translate(${AGENT.x} ${agentY(i) - AGENT.h / 2})`}>
            <rect width={AGENT.w} height={AGENT.h} rx={29} />
            <circle cx={29} cy={AGENT.h / 2} r={17} fill={`url(#mm-av-${a})`} className="n-avatar" />
            <text x={56} y={26} className="mm-name">
              {a}
            </text>
            <text x={56} y={45} className="mm-sub">
              {fired ? "Fired" : "Active"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Phones: the same four doorways, the fleet and three agents as full-size rows instead of a shrunken diagram. */
function MiniStack({ phase }: { phase: Phase }) {
  const shopbDead = phase >= 2;
  const miaFired = phase >= 4;
  const checking = phase >= 5;
  return (
    <div className="mini-stack" aria-hidden>
      <ul className="ms-group">
        {DOORS.map((d, i) => {
          const dead = i === 2 && shopbDead;
          const counterfeit = d.tone === "red";
          const tone = dead ? "grey" : d.tone;
          return (
            <li key={d.name} className={`ms-row${dead ? " dead" : ""}${counterfeit ? " counterfeit" : ""}${counterfeit && checking ? " hl" : ""}`}>
              {d.name}
              <span className={`tag tone-${tone}`}>{dead ? "Unmounted" : d.tag}</span>
            </li>
          );
        })}
      </ul>
      <p className="ms-fleet">Fleet registry: one token per agent</p>
      <ul className="ms-group">
        {AGENTS.map((a) => {
          const fired = a === "mia" && miaFired;
          const [c1, c2] = avatarColors(a);
          return (
            <li key={a} className={`ms-row${fired ? " dead" : ""}`}>
              <span className="ms-agent">
                <span className="avatar" style={{ width: 22, height: 22, backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`, filter: fired ? "grayscale(1)" : undefined }} />
                {a}
              </span>
              <span className={`tag tone-${fired ? "grey" : "green"}`}>{fired ? "Fired" : "Active"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HeroPreview() {
  const [phase, setPhase] = useState<Phase>(0);
  const [playing, setPlaying] = useState(true);

  // Reduced motion: show the finished run and let the viewer replay it on request.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setPhase(6);
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPhase((p) => ((p + 1) % 7) as Phase), DURATION[phase]);
    return () => clearTimeout(t);
  }, [phase, playing]);

  const status = (runAt: Phase) => (phase < runAt ? "idle" : phase === runAt ? "running" : "done");

  return (
    <figure className="preview" aria-label="Preview of a playbook running">
      <div className="preview-bar">
        <span className="preview-title">Preview: the full demo</span>
        <span className="preview-note">A replay. It sends nothing.</span>
        <button type="button" className="icon-btn" aria-pressed={!playing} aria-label={playing ? "Pause the replay" : "Play the replay"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={16} weight="fill" aria-hidden /> : <Play size={16} weight="fill" aria-hidden />}
        </button>
      </div>
      <div className="preview-body">
        <ol className="preview-steps">
          {STEPS.map((s) => {
            const st = status(s.runAt);
            const I = s.icon;
            return (
              <li key={s.title} className={`pstep ${st}`}>
                <span className={`step-icon tile-${s.tone}`}>
                  <I size={16} weight="bold" aria-hidden />
                </span>
                <span className="pstep-text">
                  <span className="pstep-title">{s.title}</span>
                  <span className="pstep-detail" title={s.detail}>
                    {s.detail}
                  </span>
                </span>
                {st === "running" && <CircleNotch size={18} weight="bold" className="spin text-blue" aria-hidden />}
                {st === "done" && s.runAt !== 5 && <CheckCircle size={18} weight="fill" className="text-green" aria-hidden />}
                {st === "done" && s.runAt === 5 && <XCircle size={18} weight="fill" className="text-red" aria-hidden />}
              </li>
            );
          })}
          <li className={`pstep-verdict${phase === 6 ? " shown" : ""}`} aria-hidden={phase !== 6}>
            <span className="tag tone-red">
              <XCircle size={14} weight="fill" aria-hidden />
              Counterfeit
            </span>
            <span className="pstep-why">It resolves, but support.scam.eth is not in the fleet&apos;s enf.parents.</span>
          </li>
        </ol>
        <MiniMap phase={phase} />
        <MiniStack phase={phase} />
      </div>
    </figure>
  );
}
