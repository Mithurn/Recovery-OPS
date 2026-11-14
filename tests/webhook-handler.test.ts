import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { WebhookHandler } from "../src/execution/webhook-handler.js";
import type { RazorpayClient } from "../src/execution/razorpay-client.js";
import type { AttemptRepository, CaseRepository, EventLog, NewCase, WebhookInbox } from "../src/domain/ports.js";
import type { AttemptExecutor } from "../src/execution/attempt-executor.js";
import type { Attempt } from "../src/domain/attempt.js";
import type { RecoveryCase } from "../src/domain/case.js";

const MERCHANT = "merchant_a";
const client = { verifyWebhook: () => true } as unknown as RazorpayClient;

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: "a1",
  caseId: "c1",
  attemptNo: 1,
  rootCause: null,
  action: "PAYMENT_LINK",
  reasoning: null,
  idempotencyKey: "c1:1",
  razorpayRef: "plink_1",
  settledPaymentId: null,
  status: "PENDING",
  detail: null,
  clamped: false,
  clampReason: null,
  recoveredPaise: 0,
  createdAt: new Date().toISOString(),
  ...over,
});

const kase = (over: Partial<RecoveryCase> = {}): RecoveryCase => ({
  id: "c1",
  runId: null,
  merchantRef: MERCHANT,
  customerRef: "cust",
  originalPaymentId: "pay_orig",
  amountPaise: 5000,
  currency: "INR",
  failureCode: "X",
  failureReason: "card_declined",
  failedAt: new Date().toISOString(),
  method: "card",
  instrument: null,
  customerHistory: [],
  lane: "STOPPED",
  recoveredPaise: 0,
  ...over,
});

function setup(opts: { fresh?: boolean; attempts?: Record<string, Attempt>; existing?: RecoveryCase | null; caseById?: RecoveryCase | null; createResult?: RecoveryCase } = {}) {
  const recordIfNew = vi.fn(async () => opts.fresh ?? true);
  const created: NewCase[] = [];
  const enqueue = vi.fn(async () => undefined);
  const moveLane = vi.fn(async () => true);
  const settleRecovered = vi.fn(async () => true);
  const handler = new WebhookHandler({
    client,
    inbox: { recordIfNew } as WebhookInbox,
    attempts: { byRazorpayRef: async (ref: string) => opts.attempts?.[ref] ?? null, settleRecovered } as unknown as AttemptRepository,
    cases: {
      byOriginalPaymentId: async () => opts.existing ?? null,
      byId: async () => opts.caseById ?? null,
      create: async (c: NewCase) => {
        created.push(c);
        return opts.createResult ?? { ...kase(), id: c.id, lane: "INCOMING" };
      },
      moveLane,
    } as unknown as CaseRepository,
    events: { append: async () => undefined } as unknown as EventLog,
    executor: { settle: async (a: Attempt) => ({ ...a, status: "RECOVERED" }) } as unknown as AttemptExecutor,
    enqueuer: { enqueue },
    merchantRef: MERCHANT,
  });
  return { handler, recordIfNew, created, enqueue, moveLane, settleRecovered };
}

const send = (handler: WebhookHandler, body: object) => {
  const rawBody = JSON.stringify(body);
  return handler.handle({ rawBody, signature: createHmac("sha256", "s").update(rawBody).digest("hex"), eventId: "evt_1" });
};

const failed = (payment: Record<string, unknown> = {}) => ({
  event: "payment.failed",
  payload: { payment: { entity: { id: "pay_new", amount: 5000, status: "failed", ...payment } } },
});

describe("WebhookHandler ingestion", () => {
  it("scopes the dedupe key by tenant", async () => {
    const { handler, recordIfNew } = setup();
    await send(handler, failed());
    expect(recordIfNew).toHaveBeenCalledWith(`${MERCHANT}:evt_1`, "payment.failed", expect.anything());
  });

  it("ignores a failure on our own recovery order", async () => {
    const { handler, created } = setup({ attempts: { order_1: attempt({ razorpayRef: "order_1" }) } });
    const res = await send(handler, failed({ order_id: "order_1" }));
    expect(res.status).toBe("ignored");
    expect(created).toHaveLength(0);
  });

  it("ignores a failure carrying our case id in its notes", async () => {
    const { handler, created } = setup({ caseById: kase() });
    const res = await send(handler, failed({ notes: { caseId: "c1" } }));
    expect(res.status).toBe("ignored");
    expect(created).toHaveLength(0);
  });

  it("creates and enqueues the case on a redelivery whose first attempt never created it", async () => {
    const { handler, created, enqueue } = setup({ fresh: false });
    const res = await send(handler, failed());
    expect(res.status).toBe("ingested");
    expect(created).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues a redelivered failure whose case never started", async () => {
    const { handler, enqueue } = setup({ fresh: false, existing: kase({ lane: "INCOMING" }) });
    expect((await send(handler, failed())).status).toBe("duplicate");
    expect(enqueue).toHaveBeenCalledWith("c1");
  });

  it("treats a create that returns another case as the already-ingested branch", async () => {
    const { handler, enqueue } = setup({ createResult: kase({ id: "winner", lane: "INCOMING" }) });
    const res = await send(handler, failed());
    expect(res).toEqual({ status: "ingested", caseId: "winner" });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("winner");
  });

  it("reports a conflicting create on a redelivery as duplicate", async () => {
    const { handler } = setup({ fresh: false, createResult: kase({ id: "winner", lane: "ESCALATED" }) });
    expect((await send(handler, failed())).status).toBe("duplicate");
  });

  it("uses the payment's own created_at as failedAt", async () => {
    const { handler, created } = setup();
    await send(handler, failed({ created_at: 1_700_000_000 }));
    expect(created[0]?.failedAt).toBe("2023-11-14T22:13:20.000Z");
  });
});

describe("WebhookHandler settlement", () => {
  const linkPaid = {
    event: "payment_link.paid",
    payload: {
      payment: { entity: { id: "pay_1", order_id: "order_auto", amount: 5000, status: "captured" } },
      payment_link: { entity: { id: "plink_1" } },
    },
  };

  it("matches payment_link.paid on the link id", async () => {
    const { handler } = setup({ attempts: { plink_1: attempt() }, caseById: kase({ lane: "ATTEMPTING" }) });
    expect((await send(handler, linkPaid)).status).toBe("processed");
  });

  it("moves a stopped case to RECOVERED when a late capture is credited", async () => {
    const { handler, moveLane, settleRecovered } = setup({
      attempts: { order_1: attempt({ razorpayRef: "order_1", action: "RETRY_NOW" }) },
      caseById: kase({ lane: "STOPPED" }),
    });
    await send(handler, {
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 5000, status: "captured" } } },
    });
    expect(settleRecovered).toHaveBeenCalled();
    expect(moveLane).toHaveBeenCalledWith("c1", "STOPPED", "RECOVERED");
  });
});
