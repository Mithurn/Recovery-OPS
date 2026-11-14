import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AttemptRepository,
  CaseEnqueuer,
  CaseRepository,
  EventLog,
  NewCase,
  WebhookInbox,
} from "../domain/ports.js";
import type { AttemptExecutor } from "./attempt-executor.js";
import type { RazorpayClient } from "./razorpay-client.js";
import { reconstructAction } from "./action-codec.js";
import type { RecoveryCase } from "../domain/case.js";
import { amountMismatchDetail, type Attempt } from "../domain/attempt.js";
import { TERMINAL_LANES } from "../domain/case.js";
import { isSimulatedPaymentId } from "../domain/simulated-payment.js";

const paymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  amount: z.number(),
  status: z.string(),
  created_at: z.number().optional(),
  notes: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
  method: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_reason: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  card: z.object({ issuer: z.string().nullable().optional() }).nullable().optional(),
});

const eventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: paymentEntity }).optional(),
    payment_link: z.object({ entity: z.object({ id: z.string() }) }).optional(),
    order: z.object({ entity: z.object({ id: z.string() }) }).optional(),
  }),
});

export type WebhookResult =
  | { status: "invalid_signature" }
  | { status: "malformed" }
  | { status: "duplicate" }
  | { status: "ignored"; event: string }
  | { status: "unmatched"; ref: string }
  | { status: "processed"; attemptStatus: string }
  | { status: "ingested"; caseId: string };

const SETTLING_EVENTS = new Set(["payment.captured", "payment_link.paid", "order.paid"]);
const INGESTION_EVENTS = new Set(["payment.failed"]);
const MS_PER_SECOND = 1000;

function instrumentOf(p: z.infer<typeof paymentEntity>): Record<string, string> | null {
  if (p.card?.issuer) return { issuer: p.card.issuer };
  if (p.bank) return { bank: p.bank };
  if (p.vpa) return { vpa_handle: p.vpa };
  return null;
}

function settlementRefs(parsed: z.infer<typeof eventSchema>): string[] {
  const { payment, payment_link: link, order } = parsed.payload;
  const candidates =
    parsed.event === "payment_link.paid"
      ? [link?.entity.id, payment?.entity.order_id, order?.entity.id]
      : [payment?.entity.order_id, link?.entity.id, order?.entity.id];
  return [...new Set(candidates.filter((r): r is string => typeof r === "string" && r.length > 0))];
}

function failedAtOf(p: z.infer<typeof paymentEntity>): string {
  return new Date(p.created_at ? p.created_at * MS_PER_SECOND : Date.now()).toISOString();
}

function caseIdFromNotes(p: z.infer<typeof paymentEntity>): string | null {
  const notes = p.notes;
  if (!notes || Array.isArray(notes)) return null;
  return typeof notes.caseId === "string" ? notes.caseId : null;
}

function caseFromFailedPayment(p: z.infer<typeof paymentEntity>, merchantRef: string): NewCase {
  return {
    id: randomUUID(),
    runId: null,
    merchantRef,
    customerRef: p.email ?? p.contact ?? `razorpay_${p.id}`,
    originalPaymentId: p.id,
    amountPaise: p.amount,
    currency: "INR",
    failureCode: p.error_code ?? "UNKNOWN",
    failureReason: p.error_reason ?? p.error_description ?? "payment_failed",
    failedAt: failedAtOf(p),
    method: p.method ?? null,
    instrument: instrumentOf(p),
    customerHistory: [],
  };
}

export type WebhookHandlerDeps = {
  client: RazorpayClient;
  inbox: WebhookInbox;
  attempts: AttemptRepository;
  cases: CaseRepository;
  events: EventLog;
  executor: AttemptExecutor;
  enqueuer: CaseEnqueuer;
  merchantRef: string;
};

export class WebhookHandler {
  constructor(private readonly deps: WebhookHandlerDeps) {}

  async handle(input: { rawBody: string; signature: string; eventId: string }): Promise<WebhookResult> {
    if (!this.deps.client.verifyWebhook(input.rawBody, input.signature)) return { status: "invalid_signature" };

    let raw: unknown;
    let parsed: z.infer<typeof eventSchema>;
    try {
      raw = JSON.parse(input.rawBody);
      parsed = eventSchema.parse(raw);
    } catch {
      return { status: "malformed" };
    }

    const fresh = await this.deps.inbox.recordIfNew(`${this.deps.merchantRef}:${input.eventId}`, parsed.event, raw);

    if (INGESTION_EVENTS.has(parsed.event)) return this.ingestFailedPayment(parsed, fresh);

    if (!SETTLING_EVENTS.has(parsed.event)) return fresh ? { status: "ignored", event: parsed.event } : { status: "duplicate" };

    const refs = settlementRefs(parsed);
    if (refs.length === 0) return { status: "malformed" };

    let ref = refs[0]!;
    let attempt: Attempt | null = null;
    for (const candidate of refs) {
      attempt = await this.deps.attempts.byRazorpayRef(candidate);
      if (attempt) {
        ref = candidate;
        break;
      }
    }
    if (!attempt) return { status: "unmatched", ref };

    const kase = await this.deps.cases.byId(attempt.caseId);
    if (!kase) return { status: "unmatched", ref };

    const captured = parsed.payload.payment?.entity;
    const simulated = captured?.id ? isSimulatedPaymentId(captured.id) : false;

    if (fresh) {
      await this.deps.events.append({
        caseId: attempt.caseId,
        type: "ATTEMPT_OUTCOME",
        payload: { via: "webhook", event: parsed.event, ref, simulated, activity: "execute" },
      });
    }

    // A non-RECOVERED terminal attempt (FAILED/COMPLETED/SKIPPED) must never be flipped to
    // RECOVERED by a stale redelivery.
    if (!fresh && attempt.status !== "PENDING" && attempt.status !== "AWAITING_RECONCILIATION") {
      if (attempt.status === "RECOVERED") await this.moveToRecovered(kase, simulated);
      return { status: "duplicate" };
    }

    let status: string;
    if (parsed.event === "payment.captured" && captured?.status === "captured") {
      if (captured.amount !== kase.amountPaise) {
        await this.deps.attempts.resolve(attempt.id, {
          status: "AWAITING_RECONCILIATION",
          detail: amountMismatchDetail(captured.amount, kase.amountPaise),
        });
        status = "AWAITING_RECONCILIATION";
      } else {
        const credited = await this.deps.attempts.settleRecovered(attempt.id, captured.amount, captured.id);
        status = credited || attempt.status === "RECOVERED" ? "RECOVERED" : attempt.status;
      }
    } else {
      status = (await this.deps.executor.settle(attempt, kase, reconstructAction(attempt.action))).status;
    }

    if (status === "RECOVERED") await this.moveToRecovered(kase, simulated);
    return { status: "processed", attemptStatus: status };
  }

  private async ingestFailedPayment(parsed: z.infer<typeof eventSchema>, fresh: boolean): Promise<WebhookResult> {
    const payment = parsed.payload.payment?.entity;
    if (!payment) return { status: "malformed" };

    if (await this.isRecoveryPayment(payment)) return { status: "ignored", event: parsed.event };

    const existing = await this.deps.cases.byOriginalPaymentId(payment.id);
    if (existing) {
      if (existing.lane === "INCOMING") await this.deps.enqueuer.enqueue(existing.id);
      return fresh ? { status: "ingested", caseId: existing.id } : { status: "duplicate" };
    }
    const kase = await this.deps.cases.create(caseFromFailedPayment(payment, this.deps.merchantRef));
    await this.deps.enqueuer.enqueue(kase.id);
    return { status: "ingested", caseId: kase.id };
  }

  private async isRecoveryPayment(payment: z.infer<typeof paymentEntity>): Promise<boolean> {
    if (payment.order_id && (await this.deps.attempts.byRazorpayRef(payment.order_id))) return true;
    const noteCaseId = caseIdFromNotes(payment);
    if (noteCaseId === null) return false;
    const owner = await this.deps.cases.byId(noteCaseId);
    return owner?.merchantRef === this.deps.merchantRef;
  }

  private async moveToRecovered(
    kase: RecoveryCase,
    simulated: boolean,
  ): Promise<void> {
    if (kase.lane === "RECOVERED") return;
    const moved = await this.deps.cases.moveLane(kase.id, kase.lane, "RECOVERED");
    if (moved) {
      await this.deps.events.append({
        caseId: kase.id,
        type: "CASE_RESOLVED",
        payload: {
          lane: "RECOVERED",
          via: "webhook",
          simulated,
          ...(TERMINAL_LANES.includes(kase.lane) ? { late: true, previousLane: kase.lane } : {}),
          activity: "outcome",
        },
      });
    }
  }
}
