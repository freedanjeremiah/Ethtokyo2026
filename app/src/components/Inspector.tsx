// The single-name verifier: verdict, the five checks (detail on demand), and the same agent under its other doorways.
import { useState } from "react";
import { CaretDown, CheckCircle, Question, XCircle } from "@phosphor-icons/react";
import type { VerifyApiResponse } from "@/lib/api-types";
import { Card, CopyChip, Skeleton, VERDICT, VerdictTag, doorwayShort, fmtBlock } from "./ui";

type Check = VerifyApiResponse["checks"][number];

const CHECK_TITLE: Record<Check["id"], string> = {
  C1: "Agent token is alive",
  C2: "Served by the canonical registry",
  C3: "Doorway endorsed by the fleet",
  C4: "Doorway name is alive",
  C5: "Settlement address screened",
};

function CheckRow({ check }: { check: Check }) {
  const [open, setOpen] = useState(false);
  const unknown = check.screen === "unknown";
  const I = unknown ? Question : check.pass ? CheckCircle : XCircle;
  const tone = unknown ? "grey" : check.pass ? "green" : "red";
  return (
    <li className="check">
      <button type="button" className="check-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <I size={20} weight="fill" className={`text-${tone}`} aria-hidden />
        <span className="check-title">{CHECK_TITLE[check.id]}</span>
        <span className="check-id">{check.id}</span>
        <CaretDown size={14} weight="bold" className={`caret${open ? " open" : ""}`} aria-hidden />
      </button>
      {open && <p className="check-detail mono">{check.detail}</p>}
    </li>
  );
}

/** One plain sentence built only from the checks that actually failed. */
function explain(r: VerifyApiResponse): string {
  const failed = new Set(r.checks.filter((c) => !c.pass && c.screen !== "unknown").map((c) => c.id));
  switch (r.verdict) {
    case "green":
      return "Endorsed doorway, live agent, all checks pass.";
    case "orange":
      return "Endorsed doorway and live agent, but the settlement address is flagged.";
    case "red": {
      const why = [
        failed.has("C3") ? "the fleet does not list this doorway in enf.parents" : null,
        failed.has("C2") ? "it is not served by the fleet's canonical registry" : null,
      ].filter(Boolean);
      return `It resolves, but ${why.join(" and ")}.`;
    }
    case "black": {
      if (!r.membership.member) return "No resolver is set on this name, so it is not a fleet member here.";
      if (failed.has("C1")) return "The agent's token is not alive under this doorway.";
      if (failed.has("C4")) return "The doorway name itself has expired.";
      return "The name resolves but has no address record.";
    }
  }
}

function Screening({ r }: { r: VerifyApiResponse }) {
  const c5 = r.checks.find((c) => c.id === "C5");
  const addr = r.resolved.address;
  if (!addr) return null;
  if (c5?.screen === "flagged")
    return (
      <p className="notice tone-orange">
        The settlement address is flagged{c5.screenReason ? `: ${c5.screenReason}` : ""}. The doorway is legitimate, but do not pay this fleet.
      </p>
    );
  if (c5?.screen === "unknown") return <p className="notice tone-grey">The settlement address could not be screened. The verdict uses ENS checks only.</p>;
  return null;
}

export function Inspector({ result, loading, onSelect }: { result: VerifyApiResponse | null; loading: boolean; onSelect: (name: string) => void }) {
  if (!result)
    return (
      <Card id="inspector-h" title="Verify a name" className="inspector">
        {loading ? (
          <div className="stack">
            <Skeleton h={28} w="70%" />
            <Skeleton h={22} w={120} r={999} />
            <Skeleton h={120} />
          </div>
        ) : (
          <p className="empty">Search for a name above, or pick a cell in Coverage.</p>
        )}
      </Card>
    );

  const others = result.doorways.filter((d) => !d.isInput);
  return (
    <Card id="inspector-h" className={`inspector${loading ? " is-loading" : ""}`}>
      <div className="insp-head">
        <h2 id="inspector-h" className="insp-name">
          {result.normalized ?? result.input}
        </h2>
        <VerdictTag verdict={result.verdict} size="lg" />
        <p className="insp-summary">{explain(result)}</p>
      </div>

      <Screening r={result} />

      {result.resolved.address && (
        <div className="chips">
          <CopyChip label="Settles to" value={result.resolved.address} display={`${result.resolved.address.slice(0, 6)}…${result.resolved.address.slice(-4)}`} />
          {result.blockNumber && <span className="chip static"><span className="chip-label">Block</span><span className="chip-value num">{fmtBlock(result.blockNumber)}</span></span>}
        </div>
      )}

      {result.checks.length > 0 && (
        <>
          <h3 className="label">Checks</h3>
          <ul className="checks">
            {result.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h3 className="label">Same agent, other doorways</h3>
          <div className="chips">
            {others.map((d) => {
              const dv = VERDICT[d.verdict];
              const name = d.normalized ?? d.input;
              return (
                <button key={name} type="button" className="chip" onClick={() => onSelect(name)} title={name}>
                  <span className="chip-label">{d.parent ? doorwayShort(d.parent) : name}</span>
                  <span className={`chip-value text-${dv.tone}`}>
                    <dv.Icon size={14} weight="fill" aria-hidden /> {dv.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
