// Shared primitives for the ENF dashboard, in the ENS Manager app's vocabulary:
// white rounded surfaces, bold grey section labels, record chips, pill tags.
import { useState, type ReactNode } from "react";
import { CheckCircle, Copy, MinusCircle, Warning, XCircle, type Icon } from "@phosphor-icons/react";
import type { Verdict } from "@enf/verifier";

export type Tone = "green" | "red" | "orange" | "grey" | "blue";

export const VERDICT: Record<Verdict, { label: string; tone: Tone; Icon: Icon }> = {
  green: { label: "Verified", tone: "green", Icon: CheckCircle },
  red: { label: "Counterfeit", tone: "red", Icon: XCircle },
  orange: { label: "Flagged", tone: "orange", Icon: Warning },
  black: { label: "Not live", tone: "grey", Icon: MinusCircle },
};

export function Tag({ tone = "grey", children, icon: I }: { tone?: Tone; children: ReactNode; icon?: Icon }) {
  return (
    <span className={`tag tone-${tone}`}>
      {I && <I size={14} weight="bold" aria-hidden />}
      {children}
    </span>
  );
}

export function VerdictTag({ verdict, size = "md" }: { verdict: Verdict; size?: "md" | "lg" }) {
  const v = VERDICT[verdict];
  return (
    <span className={`tag tone-${v.tone} tag-${size}`}>
      <v.Icon size={size === "lg" ? 18 : 14} weight="fill" aria-hidden />
      {v.label}
    </span>
  );
}

// ENS-style default avatars: two-stop gradients, picked by label so each agent keeps its own colours.
const AVATARS: [string, string][] = [
  ["#44bcf0", "#7298f8"],
  ["#f58ab1", "#a37af5"],
  ["#3fd8a2", "#2fa5d6"],
  ["#ffa361", "#f25f8f"],
  ["#8e7bf6", "#4c6bf5"],
  ["#f7c55a", "#f2855c"],
  ["#5ad1d8", "#4f86f7"],
];

export function avatarColors(label: string): [string, string] {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

export function Avatar({ label, size = 28, dim = false }: { label: string; size?: number; dim?: boolean }) {
  const [a, b] = avatarColors(label);
  return (
    <span
      className={`avatar${dim ? " dim" : ""}`}
      style={{ width: size, height: size, backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden
    />
  );
}

export function Card({ title, aside, children, className = "", id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      {(title || aside) && (
        <header className="card-head">
          {title && (
            <h2 id={id} className="card-title">
              {title}
            </h2>
          )}
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function CopyChip({ label, value, display }: { label?: string; value: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      title={`Copy ${value}`}
    >
      {label && <span className="chip-label">{label}</span>}
      <span className="chip-value mono">{display ?? value}</span>
      {done ? <CheckCircle size={14} weight="fill" className="chip-icon ok" aria-label="Copied" /> : <Copy size={14} weight="bold" className="chip-icon" aria-hidden />}
    </button>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export const shortAddr = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "none");

/** "support.shopa.eth" -> "shopa" */
export function doorwayShort(name: string): string {
  const parts = name.split(".");
  return parts.length >= 3 ? parts[1]! : name;
}

export const fmtBlock = (b: string | number | null | undefined) => (b === null || b === undefined ? "" : Number(b).toLocaleString("en-US"));
