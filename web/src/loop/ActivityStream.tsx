import { useState } from "react";
import { AgentLoader } from "../agentic/AgentLoader.js";
import { ACTIVITY_ICON, Check, ChevronDown, ChevronRight, X } from "../ui/icons.js";
import { StreamingText } from "../ui/motion.js";
import { activityDurationMs, fmtDuration, type Activity, type DetailRow, type ToolEntry } from "./activities.js";
import { resultFields } from "./toolLine.js";

const LIVE_LABEL: Record<Activity["kind"], string> = {
  investigate: "Investigating",
  propose: "Proposing",
  gate: "Checking limits",
  execute: "Executing",
  nudge: "Queuing outreach",
  outcome: "Wrapping up",
};

const rowValue = (rows: DetailRow[], label: string) => rows.find((r) => r.label === label)?.value;

export function ActivityStream({
  activities,
  liveNarration,
  liveStepStatus,
}: {
  activities: Activity[];
  liveNarration: string;
  liveStepStatus: { step: number; budget: number; elapsedMs: number } | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (activities.length === 0) return <p className="muted small">Nothing has happened on this case yet.</p>;

  return (
    <ol className="trace">
      {activities.map((a) => (
        <Block
          key={a.id}
          activity={a}
          open={a.status === "active" || expanded.has(a.id)}
          onToggle={() => toggle(a.id)}
          narration={a.status === "active" && a.kind === "investigate" ? liveNarration : ""}
          step={a.status === "active" && a.kind === "investigate" ? liveStepStatus : null}
        />
      ))}
    </ol>
  );
}

function Glyph({ activity: a }: { activity: Activity }) {
  if (a.status === "active") return <span className="trace__ring" aria-hidden />;
  if (a.tone === "deny") return <span className="trace__badge trace__badge--deny"><X size={11} /></span>;
  if (a.tone === "clear") return <span className="trace__badge trace__badge--ok"><Check size={11} /></span>;
  const Icon = ACTIVITY_ICON[a.kind];
  return <span className="trace__badge"><Icon size={11} /></span>;
}

function Block({
  activity: a,
  open,
  onToggle,
  narration,
  step,
}: {
  activity: Activity;
  open: boolean;
  onToggle: () => void;
  narration: string;
  step: { step: number; budget: number; elapsedMs: number } | null;
}) {
  const duration = activityDurationMs(a);
  const done = a.status === "done";
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={`trace__item trace__item--${a.tone}`}>
      <button className="trace__head" onClick={done ? onToggle : undefined} disabled={!done} aria-expanded={open}>
        <Glyph activity={a} />
        <span className="trace__title">{a.title}</span>
        {done && (
          <span className="trace__summary">
            {a.summary}
            {duration !== null && <span className="trace__meta"> · {fmtDuration(duration)}</span>}
          </span>
        )}
        {done && <Chevron size={13} className="trace__chev" />}
      </button>

      {a.status === "active" && (
        <div className="trace__live">
          <AgentLoader label={LIVE_LABEL[a.kind]} elapsedMs={step?.elapsedMs} />
          {step && (
            <span className="trace__step tnum">
              step {step.step} of {step.budget}
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="trace__body">
          {a.tools.length > 0 && (
            <ul className="chips">
              {a.tools.map((t) => (
                <ToolChip key={t.callId || t.name} tool={t} />
              ))}
            </ul>
          )}
          {narration && (
            <p className="trace__narration">
              <StreamingText text={narration} />
            </p>
          )}
          {done && <Detail activity={a} />}
        </div>
      )}
    </li>
  );
}

function ToolChip({ tool }: { tool: ToolEntry }) {
  const [open, setOpen] = useState(false);
  const ready = tool.status === "done";
  return (
    <li>
      <button className="chip-row" onClick={() => ready && setOpen((v) => !v)} aria-expanded={open}>
        <span className="chip-row__mark">{ready ? <Check size={11} /> : <span className="trace__ring trace__ring--sm" aria-hidden />}</span>
        <span className="chip-row__label">{tool.label}</span>
        <span className="chip">{tool.summary ?? "running"}</span>
        {tool.source === "razorpay-live" && <span className="chip chip--live">Razorpay live</span>}
      </button>
      {open && ready && (
        <dl className="detail">
          {resultFields({ type: "tool_result", name: tool.name, source: tool.source ?? "local", raw: tool.raw, ms: 0 }).map((r) => (
            <div key={r.label} className="detail__row">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function Detail({ activity: a }: { activity: Activity }) {
  if (a.kind === "gate") {
    const outcome = rowValue(a.detail, "outcome");
    const proposed = rowValue(a.detail, "proposed");
    const applied = rowValue(a.detail, "applied");
    if (outcome && outcome !== "allow" && proposed) {
      return (
        <div className="diff">
          <div className="diff__line diff__line--del">
            <span>−</span>
            <code>{proposed}</code>
            <small>agent proposed</small>
          </div>
          <div className="diff__line diff__line--add">
            <span>+</span>
            <code>{applied ?? outcome}</code>
            <small>gate applied</small>
          </div>
          <dl className="detail">
            <div className="detail__row"><dt>rule</dt><dd>{rowValue(a.detail, "rule") ?? "-"}</dd></div>
            <div className="detail__row"><dt>detail</dt><dd>{rowValue(a.detail, "detail") ?? "-"}</dd></div>
          </dl>
        </div>
      );
    }
  }
  if (a.kind === "propose") {
    const confidence = Number(rowValue(a.detail, "confidence"));
    const rest = a.detail.filter((r) => r.label !== "confidence");
    return (
      <>
        {Number.isFinite(confidence) && (
          <div className="meter" aria-label={`Confidence ${confidence}`}>
            <span className="meter__label">Confidence</span>
            <span className="meter__bar"><span className="meter__fill" style={{ width: `${Math.round(confidence * 100)}%` }} /></span>
            <span className="meter__value tnum">{Math.round(confidence * 100)}%</span>
          </div>
        )}
        <Rows rows={rest} />
      </>
    );
  }
  return <Rows rows={a.detail} />;
}

function Rows({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="detail">
      {rows.map((r) => (
        <div className="detail__row" key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
