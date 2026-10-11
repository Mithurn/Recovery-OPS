import { useState } from "react";
import { AgentLoader } from "../agentic/AgentLoader.js";
import { DESKS } from "../floor/layout";
import { Check, ChevronDown, X } from "../ui/icons.js";
import { STATUS_LABEL, type Run, type RunStatus } from "./runs";

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const accentOf = (agent: string) => toHex(DESKS.find((d) => d.agent === agent)?.accent ?? 0x888888);

function Marker({ status }: { status: RunStatus }) {
  if (status === "running") return <span className="run__ring" aria-hidden />;
  if (status === "done") return <span className="run__badge run__badge--ok"><Check size={12} /></span>;
  if (status === "attention") return <span className="run__badge run__badge--warn">!</span>;
  if (status === "closed") return <span className="run__badge run__badge--bad"><X size={11} /></span>;
  return <span className="run__ring run__ring--idle" aria-hidden />;
}

export function RunsPanel({ runs, onOpenCase }: { runs: Run[]; onOpenCase: (id: string) => void }) {
  const [manual, setManual] = useState<Record<string, boolean>>({});

  if (runs.length === 0) {
    return <p className="muted small">Agent runs appear here as failed payments arrive. Each one shows every tool the agents call.</p>;
  }

  return (
    <ul className="runs">
      {runs.map((run, index) => {
        const open = manual[run.caseId] ?? (run.status === "running" || run.status === "attention");
        return (
          <li key={run.caseId} className="run" style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}>
            <button className="run__head" aria-expanded={open} onClick={() => setManual((m) => ({ ...m, [run.caseId]: !open }))}>
              <Marker status={run.status} />
              <span className="run__main">
                <span className="run__title">{run.title}</span>
                <span className="run__sub">{run.subtitle}</span>
              </span>
              <span className={`run__pill run__pill--${run.status}`}>{STATUS_LABEL[run.status]}</span>
              <ChevronDown size={14} className="run__chev" style={{ transform: open ? "rotate(180deg)" : undefined }} />
            </button>

            {open && (
              <div className="run__body">
                <ul className="steps">
                  {run.steps.map((s) => (
                    <li key={s.id} className="step" style={{ ["--agent" as string]: accentOf(s.agent) }}>
                      <span className="step__agent" aria-hidden />
                      <span className="step__fn">{s.fn}</span>
                      <span className={`chip chip--${s.tone}`}>{s.detail || "done"}</span>
                    </li>
                  ))}
                </ul>
                {run.status === "running" && <AgentLoader label="Working" />}
                <button className="run__open" onClick={() => onOpenCase(run.caseId)}>
                  Open the full story
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
