// Agent x doorway coverage: one verify() per cell, all at the same block.
import { useEffect, useRef } from "react";
import type { Verdict } from "@enf/verifier";
import type { FleetScan } from "@/lib/fleet-types";
import { Avatar, Card, VERDICT, doorwayShort } from "./ui";

/** Coverage aside: per-verdict counts from scan.cells, only non-zero, in this order. */
const SUMMARY_ORDER: { key: Verdict; label: string }[] = [
  { key: "green", label: "verified" },
  { key: "orange", label: "flagged" },
  { key: "red", label: "counterfeit" },
  { key: "black", label: "not live" },
];

export function Coverage({
  scan,
  selected,
  focus,
  onFocus,
  onSelect,
}: {
  scan: FleetScan;
  selected: string | null;
  focus: { doorway: string | null; agent: string | null };
  onFocus: (f: { doorway: string | null; agent: string | null }) => void;
  onSelect: (name: string) => void;
}) {
  // Cells whose verdict changed since the previous block get one highlight.
  const prev = useRef<Map<string, string> | null>(null);
  const changed = new Set<string>();
  if (prev.current) for (const c of scan.cells) if (prev.current.has(c.name) && prev.current.get(c.name) !== c.verdict) changed.add(c.name);
  useEffect(() => {
    prev.current = new Map(scan.cells.map((c) => [c.name, c.verdict]));
  }, [scan]);

  const doors = scan.doorways.filter((d): d is typeof d & { name: string } => !!d.name);
  const cell = (agent: string, door: string) => scan.cells.find((c) => c.agent === agent && c.doorway === door);

  const counts: Record<Verdict, number> = { green: 0, orange: 0, red: 0, black: 0 };
  for (const c of scan.cells) counts[c.verdict]++;
  const summary = SUMMARY_ORDER.filter((v) => counts[v.key] > 0);

  return (
    <Card
      id="coverage-h"
      title="Coverage"
      aside={
        <span className="muted">
          {summary.map((v, i) => (
            <span key={v.key}>
              {i > 0 && " · "}
              <strong className="num">{counts[v.key]}</strong> {v.label}
            </span>
          ))}
        </span>
      }
    >
      <div className="table-scroll">
        <table className="coverage">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Agent
              </th>
              {doors.map((d) => (
                <th
                  key={d.name}
                  scope="col"
                  title={`${d.name}: ${d.declared ? "Endorsed" : "Counterfeit"}`}
                  className={focus.doorway === d.name ? "focus" : ""}
                >
                  <span className={!d.declared ? "text-red" : ""}>{doorwayShort(d.name)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scan.agents.map((a) => (
              <tr key={a.label}>
                <th scope="row" className={focus.agent === a.label ? "focus" : ""}>
                  <span className="agent-cell">
                    <Avatar label={a.label} size={24} dim={!a.active} />
                    <span>{a.label}</span>
                  </span>
                </th>
                {doors.map((d) => {
                  const c = cell(a.label, d.name);
                  if (!c) return <td key={d.name} />;
                  const v = VERDICT[c.verdict];
                  return (
                    <td key={d.name}>
                      <button
                        type="button"
                        className={`cell tone-${v.tone}${selected === c.name ? " selected" : ""}${changed.has(c.name) ? " changed" : ""}`}
                        onClick={() => onSelect(c.name)}
                        onMouseEnter={() => onFocus({ doorway: d.name, agent: a.label })}
                        onMouseLeave={() => onFocus({ doorway: null, agent: null })}
                        onFocus={() => onFocus({ doorway: d.name, agent: a.label })}
                        onBlur={() => onFocus({ doorway: null, agent: null })}
                        aria-label={`${c.name}: ${v.label}`}
                        title={c.name}
                      >
                        <v.Icon size={18} weight="fill" aria-hidden />
                        <span>{v.label}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
