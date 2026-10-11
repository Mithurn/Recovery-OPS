import { ApprovalCard, type ApprovalOption } from "../agentic/ApprovalCard";
import { decide } from "../api.js";
import type { RecoveryCase } from "../types.js";
import { customerLabel, rupees } from "../ui/format.js";
import { humanize } from "./cases";

const OPTIONS: Array<ApprovalOption & { decision: "approve" | "redirect"; redirectTo?: string }> = [
  { id: "retry", label: "Retry the charge", decision: "approve" },
  { id: "link", label: "Send a payment link", decision: "redirect", redirectTo: "PAYMENT_LINK" },
  { id: "nudge", label: "Nudge the customer", decision: "redirect", redirectTo: "CUSTOMER_NUDGE" },
];

const WHY: Record<string, string> = {
  payment_risk_check_failed: "The original payment carries a risk hold, so the gate will not retry it automatically.",
};

export function NeedsPage({ escalations, onDone, onOpen, onError }: { escalations: RecoveryCase[]; onDone: () => void; onOpen: (id: string) => void; onError: (m: string) => void }) {
  const run = async (id: string, body: Parameters<typeof decide>[1]) => {
    try {
      await decide(id, body);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "request failed");
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Needs you</h2>
          <p className="muted small">Cases the safety gate would not let the agents finish alone.</p>
        </div>
      </header>
      {escalations.length === 0 ? (
        <div className="card empty empty--inline">
          <h3>Nothing is waiting on you</h3>
          <p>Cases that need a human decision show up here, with the reason the gate stopped them.</p>
        </div>
      ) : (
        <ul className="needs">
          {escalations.map((c) => (
            <li key={c.id} className="needs__item">
              <div className="needs__top">
                <div>
                  <strong>{customerLabel(c.customerRef)}</strong>
                  <p className="muted small">
                    {humanize(c.failureReason)} · {c.instrument?.issuer ?? c.method ?? "card"}
                  </p>
                  <p className="muted small">{WHY[c.failureReason] ?? "The gate escalated this after the agent's proposal."}</p>
                </div>
                <span className="needs__amount tnum">{rupees(c.amountPaise)}</span>
              </div>
              <ApprovalCard
                question="How should we recover this?"
                options={OPTIONS}
                confirmLabel="Approve"
                notePlaceholder="Note for the audit log (optional)"
                secondary={
                  <>
                    <button className="btn btn--sm btn--ghost" onClick={() => onOpen(c.id)}>
                      See the story
                    </button>
                    <button className="btn btn--sm btn--quiet-danger" onClick={() => void run(c.id, { decision: "write_off" })}>
                      Write off
                    </button>
                  </>
                }
                onConfirm={(id, note) => {
                  const o = OPTIONS.find((x) => x.id === id)!;
                  return run(c.id, { decision: o.decision, redirectTo: o.redirectTo, note: note || undefined });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
