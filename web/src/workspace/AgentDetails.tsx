import { useState } from "react";
import type { RecoveryCase } from "../types.js";
import { customerLabel, rupees } from "../ui/format.js";
import { RotateCw } from "../ui/icons.js";
import { Spinner } from "../ui/motion.js";
import { AGENT_INFO, casesAtAgent, RETRYABLE_LANES } from "../floor/agents";
import { DESKS } from "../floor/layout";
import type { AgentId } from "../floor/sprites";
import { FeedList } from "./FeedList";
import type { FeedEntry } from "./feed";

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const RECENT_LIMIT = 8;

export function AgentDetails({
  agent,
  feed,
  cases,
  onRetry,
  onOpenCase,
}: {
  agent: AgentId;
  feed: FeedEntry[];
  cases: RecoveryCase[];
  onRetry: (caseId: string) => Promise<void>;
  onOpenCase: (caseId: string) => void;
}) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const desk = DESKS.find((d) => d.agent === agent)!;
  const info = AGENT_INFO[agent];
  const atDesk = casesAtAgent(cases, agent);
  const mine = feed.filter((f) => f.agent === agent).slice(0, RECENT_LIMIT);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await onRetry(id);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="stack">
      <div className="agent__title">
        <span className="agent__swatch" style={{ background: toHex(desk.accent) }} />
        <h3>{info.role}</h3>
      </div>
      <p className="muted">{info.duty}</p>
      <dl className="kv">
        <dt>Uses</dt>
        <dd>{info.tools}</dd>
      </dl>

      <h4 className="eyebrow">At this desk</h4>
      {atDesk.length === 0 ? (
        <p className="muted small">Nothing waiting here.</p>
      ) : (
        <ul className="list">
          {atDesk.map((c) => (
            <li key={c.id} className="row">
              <button className="row__main" onClick={() => onOpenCase(c.id)}>
                <span className="row__title">{customerLabel(c.customerRef)}</span>
                <span className="row__sub">
                  {rupees(c.amountPaise)} · {c.lane.replace(/_/g, " ").toLowerCase()}
                </span>
              </button>
              {RETRYABLE_LANES.includes(c.lane) && (
                <button className="btn btn--sm" disabled={retrying === c.id} onClick={() => void retry(c.id)}>
                  {retrying === c.id ? <Spinner size={12} /> : <RotateCw size={12} />} Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h4 className="eyebrow">Recent</h4>
      <FeedList entries={mine} empty="Nothing yet this session." />
    </div>
  );
}
