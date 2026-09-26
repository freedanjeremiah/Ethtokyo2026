// The editor's right-hand panel: the details that used to sit below the map (verifier, coverage, activity), as tabs
// that scroll on their own so the map canvas stays put. Collapses to a rail like the playbook column.
import type { ReactNode } from "react";
import { CaretLineLeft, CaretLineRight, ClockCounterClockwise, GridFour, SealCheck, type Icon } from "@phosphor-icons/react";

export type DetailsTab = "verifier" | "coverage" | "activity";

const TABS: { id: DetailsTab; label: string; icon: Icon }[] = [
  { id: "verifier", label: "Verifier", icon: SealCheck },
  { id: "coverage", label: "Coverage", icon: GridFour },
  { id: "activity", label: "Activity", icon: ClockCounterClockwise },
];

type Props = {
  tab: DetailsTab;
  onTab: (t: DetailsTab) => void;
  collapsed: boolean;
  onToggle: () => void;
  panels: Record<DetailsTab, ReactNode>;
};

export function DetailsPanel({ tab, onTab, collapsed, onToggle, panels }: Props) {
  if (collapsed)
    return (
      <aside className="details rail" aria-label="Details (collapsed)">
        <button type="button" className="rail-btn" onClick={onToggle} aria-label="Expand the details" title="Expand the details ( ] )">
          <CaretLineLeft size={18} weight="bold" aria-hidden />
        </button>
        <div className="rail-steps">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rail-step${tab === t.id ? " current" : ""}`}
              onClick={() => {
                onTab(t.id);
                onToggle();
              }}
              aria-label={`Open ${t.label}`}
              title={t.label}
            >
              <span className="step-icon tile-neutral">
                <t.icon size={18} weight="bold" aria-hidden />
              </span>
            </button>
          ))}
        </div>
      </aside>
    );

  return (
    <aside className="details" aria-label="Details">
      <div className="details-head">
        <div className="tabs" role="tablist" aria-label="Details">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => onTab(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = TABS.findIndex((x) => x.id === tab);
                const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
                onTab(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }}
            >
              <t.icon size={16} weight="bold" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn collapse-btn" onClick={onToggle} aria-label="Collapse the details" title="Collapse the details ( ] )">
          <CaretLineRight size={18} weight="bold" aria-hidden />
        </button>
      </div>
      {TABS.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} className="details-body" hidden={tab !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </aside>
  );
}
