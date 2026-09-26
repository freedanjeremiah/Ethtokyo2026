// Recent fleet activity, read from registry and resolver logs.
import { LinkBreak, LinkSimple, NotePencil, UserMinus, UserPlus, Wallet, type Icon } from "@phosphor-icons/react";
import type { FleetEvent, FleetScan } from "@/lib/fleet-types";
import { Card, type Tone, fmtBlock } from "./ui";

const KIND: Record<FleetEvent["kind"], { Icon: Icon; tone: Tone }> = {
  hire: { Icon: UserPlus, tone: "green" },
  fire: { Icon: UserMinus, tone: "red" },
  mount: { Icon: LinkSimple, tone: "green" },
  unmount: { Icon: LinkBreak, tone: "red" },
  settlement: { Icon: Wallet, tone: "orange" },
  record: { Icon: NotePencil, tone: "grey" },
};

function ago(now: number, t: number): string {
  if (!t) return "";
  const s = Math.max(0, now - t);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MAX_SHOWN = 10;

/** Newest first, capped, but an undeclared (counterfeit) mount always stays on screen. */
function visibleEvents(events: FleetEvent[]): FleetEvent[] {
  const shown = events.slice(0, MAX_SHOWN);
  const counterfeit = events.filter((e) => e.kind === "mount" && e.text.endsWith("without endorsement") && !shown.includes(e));
  return counterfeit.length ? [...shown.slice(0, MAX_SHOWN - counterfeit.length), ...counterfeit] : shown;
}

export function Activity({ scan }: { scan: FleetScan }) {
  return (
    <Card id="activity-h" title="Activity">
      {scan.events.length === 0 ? (
        <p className="empty">No fleet transactions since block {fmtBlock(scan.scannedFrom)}.</p>
      ) : (
        <ol className="activity">
          {visibleEvents(scan.events).map((e, i) => {
            const k = KIND[e.kind];
            const tone = e.kind === "mount" && e.text.endsWith("without endorsement") ? "red" : k.tone;
            return (
              <li key={`${e.tx}-${i}`}>
                <span className={`act-icon tone-${tone}`} aria-hidden>
                  <k.Icon size={16} weight="bold" />
                </span>
                <span className="act-text">
                  {e.text.split(/(0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4})/).map((part, j) =>
                    j % 2 ? (
                      <span key={j} className="mono">
                        {part}
                      </span>
                    ) : (
                      part
                    ),
                  )}
                </span>
                <span className="act-meta" title={e.tx}>
                  Block <span className="num">{fmtBlock(e.block)}</span>
                  {e.timestamp ? `, ${ago(scan.timestamp, e.timestamp)}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
