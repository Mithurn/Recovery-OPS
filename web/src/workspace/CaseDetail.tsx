import { useEffect, useState } from "react";
import { caseDetail, recover, simulateCapture, stopCase, verifyAudit, type AuditVerify, type RuntimeConfig } from "../api.js";
import { ActivityStream } from "../loop/ActivityStream.js";
import { AttemptTimeline } from "../loop/AttemptTimeline.js";
import { AuditLog } from "../loop/AuditLog.js";
import { deriveActivities, type RawEvent } from "../loop/activities.js";
import { deriveLoopState } from "../loop/useCaseLoopState.js";
import { useLiveRun } from "../loop/useLiveRun.js";
import { CustomerPanel } from "../room/CustomerPanel.js";
import { RazorpayCheckout } from "../room/RazorpayCheckout.js";
import { RESOLVED_LANES, type CaseDetail as CaseDetailData } from "../types.js";
import { bankName, customerLabel, rupees } from "../ui/format.js";
import { Check, Square, X } from "../ui/icons.js";
import { PixelGrid } from "../agentic/AgentLoader.js";
import { Spinner } from "../ui/motion.js";

const POLL_MS = 1500;
const ELAPSED_TICK_MS = 400;
const DEFAULT_LIMITS = { maxAttempts: 4, maxExposurePaise: 500000, cooldownHours: 6 };

type Tab = "story" | "audit" | "customer";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "story", label: "Story" },
  { id: "audit", label: "Audit log" },
  { id: "customer", label: "Customer" },
];

const toRaw = (events: CaseDetailData["events"]): RawEvent[] => events.map((e) => ({ type: e.type, payload: e.payload, at: e.createdAt }));

export function CaseDetail({
  caseId,
  cfg,
  keyId,
  onError,
}: {
  caseId: string;
  cfg: RuntimeConfig | null;
  keyId: string | null;
  onError: (message: string) => void;
}) {
  const [detail, setDetail] = useState<CaseDetailData | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const run = useLiveRun(caseId);
  const limits = cfg?.limits ?? DEFAULT_LIMITS;

  useEffect(() => {
    setTab("story");
    setConfirmingStop(false);
    setDetail(null);
  }, [caseId]);

  useEffect(() => {
    const load = () => caseDetail(caseId).then(setDetail).catch(() => undefined);
    void load();
    const poll = setInterval(load, POLL_MS);
    return () => clearInterval(poll);
  }, [caseId]);

  const auditLen = run.audit.length;
  useEffect(() => {
    if (auditLen > 0) caseDetail(caseId).then(setDetail).catch(() => undefined);
  }, [auditLen, caseId]);

  useEffect(() => {
    if (!run.live || !run.startedAt) {
      setElapsedMs(0);
      return;
    }
    const startedAt = run.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const t = setInterval(tick, ELAPSED_TICK_MS);
    return () => clearInterval(t);
  }, [run.live, run.startedAt]);

  const guarded = (fn: () => Promise<void>) => () => fn().catch((err) => onError(err instanceof Error ? err.message : "request failed"));

  const kase = detail?.case;
  const events = detail?.events ?? [];
  const attempt = detail?.attempts.at(-1);
  const open = kase ? !RESOLVED_LANES.includes(kase.lane) : false;

  const loopState = deriveLoopState(events, {
    running: run.live,
    reasoning: run.reasoning,
    tools: run.tools,
    toolResultCount: run.toolResults.length,
    proposalKind: run.proposal?.action ?? null,
    degraded: run.proposal?.degraded ?? false,
    doneLane: run.doneLane,
  });
  const activities = deriveActivities(toRaw(events));
  const liveStepStatus = run.live ? { step: run.tools.length + (run.proposal ? 1 : 0), budget: cfg?.stepBudget ?? 6, elapsedMs } : null;

  if (!kase) {
    return (
      <div className="stack">
        <p className="muted small">Loading case…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="case__head">
        <span className="eyebrow">Customer</span>
        <h3 className="case__name">
          {run.live && <PixelGrid />}
          {customerLabel(kase.customerRef)}
        </h3>
        <p className="muted small">
          {rupees(kase.amountPaise)} · {kase.failureReason.replace(/_/g, " ")} ·{" "}
          <span title={kase.instrument?.issuer ? bankName(kase.instrument.issuer) : undefined}>{kase.instrument?.issuer ?? kase.method ?? "card"}</span> ·{" "}
          {kase.customerHistory.filter((h) => h.status === "captured").length}/{kase.customerHistory.length} clean payments
        </p>
      </header>

      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>{kase.lane.charAt(0) + kase.lane.slice(1).replace(/_/g, " ").toLowerCase()}</dd>
        </div>
        <div>
          <dt>Attempt</dt>
          <dd className="tnum">
            {attempt?.attemptNo ?? 0} of {limits.maxAttempts}
          </dd>
        </div>
        <div>
          <dt>Exposure</dt>
          <dd className="tnum">
            {rupees(kase.amountPaise)} of {rupees(limits.maxExposurePaise)}
          </dd>
        </div>
      </dl>

      <div className="actions">
        {kase.lane === "INCOMING" && (
          <button className="btn btn--primary btn--sm" onClick={guarded(() => recover(caseId))}>
            Work this case now
          </button>
        )}
        {kase.lane === "ATTEMPTING" && attempt?.status === "PENDING" && attempt.razorpayRef && keyId && (
          <>
            <RazorpayCheckout caseId={caseId} keyId={keyId} customerRef={kase.customerRef} onPaid={() => caseDetail(caseId).then(setDetail).catch(() => undefined)} />
            <button className="btn btn--sm" onClick={guarded(() => simulateCapture(caseId))}>
              Simulate payment
            </button>
          </>
        )}
        {open && !confirmingStop && (
          <button className="btn btn--sm btn--quiet-danger" onClick={() => setConfirmingStop(true)}>
            <Square size={12} /> Stop case
          </button>
        )}
        {open && confirmingStop && (
          <span className="confirm">
            Stop permanently?
            <button
              className="btn btn--sm btn--danger"
              onClick={() => {
                setConfirmingStop(false);
                void guarded(() => stopCase(caseId))();
              }}
            >
              Stop
            </button>
            <button className="btn btn--sm" onClick={() => setConfirmingStop(false)} aria-label="Cancel">
              <X size={12} />
            </button>
          </span>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "story" && (
        <>
          <ActivityStream activities={activities} liveNarration={loopState.reasoningHead} liveStepStatus={liveStepStatus} />
          <AttemptTimeline attempts={detail?.attempts ?? []} />
        </>
      )}
      {tab === "audit" && (
        <>
          <AuditLog events={events} />
          <VerifyAudit caseId={caseId} />
        </>
      )}
      {tab === "customer" && <CustomerPanel kase={kase} />}
    </div>
  );
}

function VerifyAudit({ caseId }: { caseId: string }) {
  const [result, setResult] = useState<AuditVerify | "pending" | null>(null);
  const run = async () => {
    setResult("pending");
    try {
      setResult(await verifyAudit(caseId));
    } catch {
      setResult(null);
    }
  };
  return (
    <div className="verify">
      <button
        className="btn btn--sm"
        onClick={() => void run()}
        disabled={result === "pending"}
        title="Connects to Postgres as the app's own restricted role and tries to UPDATE the event log. The database refuses: the role has SELECT and INSERT only."
      >
        {result === "pending" && <Spinner size={12} />} Verify the log cannot be edited
      </button>
      {result && result !== "pending" && (
        <span className={"verify__result " + (result.enforced ? "verify__result--ok" : "verify__result--bad")}>
          {result.enforced ? <Check size={13} /> : <X size={13} />}
          {result.enforced ? "The app role was refused: select and insert only" : (result.error ?? "not enforced")}
        </span>
      )}
    </div>
  );
}
