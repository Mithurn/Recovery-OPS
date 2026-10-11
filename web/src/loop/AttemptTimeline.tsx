import { useState } from "react";
import type { Attempt } from "../types.js";
import { ChevronRight, ChevronDown } from "../ui/icons.js";

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

const STATUS_CLASS: Record<string, string> = {
  RECOVERED: "tl__status--clear",
  FAILED: "tl__status--deny",
  PENDING: "tl__status--wait",
  AWAITING_RECONCILIATION: "tl__status--wait",
  SKIPPED: "tl__status--muted",
};

const STATUS_LABEL: Record<string, string> = {
  RECOVERED: "recovered",
  FAILED: "failed",
  PENDING: "pending",
  AWAITING_RECONCILIATION: "awaiting settlement",
  SKIPPED: "skipped",
};

const ACTION_LABEL: Record<string, string> = {
  RETRY_NOW: "retried the charge",
  RETRY_SCHEDULED: "scheduled a retry",
  PAYMENT_LINK: "sent a payment link",
  ESCALATE: "escalated to a human",
  WRITE_OFF: "wrote the payment off",
};

function refLabel(ref: string): string {
  if (ref.startsWith("plink_")) return "link";
  if (ref.startsWith("order_")) return "order";
  return "ref";
}

export function AttemptTimeline({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) return null;
  const rows = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);

  return (
    <section className="attempts" aria-label="Attempts">
      <h4 className="attempts__head" title="Each attempt runs exactly once under a unique idempotency key, so a retry can never double charge.">
        Attempts
      </h4>
      <ul className="attempts__list">
        {rows.map((a) => (
          <AttemptRow key={a.id} attempt={a} />
        ))}
      </ul>
    </section>
  );
}

function AttemptRow({ attempt: a }: { attempt: Attempt }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const action = ACTION_LABEL[a.action] ?? a.action.replace(/_/g, " ").toLowerCase();
  return (
    <li className="attempt">
      <button className="attempt__line" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="attempt__no tnum">{a.attemptNo}</span>
        <span className="attempt__main">
          <span className="attempt__action">{action.charAt(0).toUpperCase() + action.slice(1)}</span>
          {a.recoveredPaise > 0 && <span className="attempt__sub tnum">{rupees(a.recoveredPaise)} captured</span>}
        </span>
        <span className={"attempt__status " + (STATUS_CLASS[a.status] ?? "tl__status--muted")}>{STATUS_LABEL[a.status] ?? a.status}</span>
        <Chevron size={13} className="attempt__chev" />
      </button>
      {open && (
        <dl className="detail attempt__ids">
          <div className="detail__row">
            <dt>idempotency key</dt>
            <dd className="mono">{a.idempotencyKey}</dd>
          </div>
          {a.razorpayRef && (
            <div className="detail__row">
              <dt>razorpay {refLabel(a.razorpayRef)}</dt>
              <dd className="mono">{a.razorpayRef}</dd>
            </div>
          )}
          {a.settledPaymentId && (
            <div className="detail__row">
              <dt>settled payment</dt>
              <dd className="mono">{a.settledPaymentId}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}
