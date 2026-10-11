import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Queue } from "bullmq";
import type { AttemptRepository, CaseRepository, EventLog } from "../domain/ports.js";
import type { RecoveryCase } from "../domain/case.js";
import { IN_FLIGHT_LANES } from "../domain/case.js";
import type { AuthService } from "../auth/service.js";
import type { CaseEventBus, RoomStreamEvent } from "./event-bus.js";
import type { RecoveryJob } from "../worker/queue.js";
import { enqueueRecovery } from "../worker/queue.js";
import type { AuditVerifyResult } from "../persistence/audit-verify.js";
import type { SafetyLimits } from "../safety/safety-gate.js";
import type { TenantRuntime, TenantRuntimes } from "../tenants/runtime.js";
import { FAILURE_SCENARIOS, scenarioById } from "../tenants/scenarios.js";
import type { RecentActivity } from "../persistence/recent-activity.js";
import { openSse } from "./sse.js";
import { requireUser } from "./session.js";
import { directedAction, SHARED_TOKEN_APPROVER } from "../worker/human-directive.js";

export type RuntimeInfo = {
  model: string;
  deadlineMs: number;
  stepBudget: number;
  limits: SafetyLimits;
};

export type PayInfo =
  | { payable: false }
  | { payable: true; kind: "order"; orderId: string; amountPaise: number; currency: string }
  | { payable: true; kind: "payment_link"; url: string; amountPaise: number };

export type RouteDeps = {
  auth: AuthService;
  runtimes: TenantRuntimes;
  cases: CaseRepository;
  attempts: AttemptRepository;
  events: EventLog;
  activity: RecentActivity;
  queue: Queue<RecoveryJob>;
  bus: CaseEventBus;
  verifyAppendOnly: () => Promise<AuditVerifyResult>;
  runtimeInfo: RuntimeInfo;
  maxCasesPerUser: number;
};

const decisionBody = z.object({
  decision: z.enum(["approve", "redirect", "write_off"]),
  redirectTo: z.enum(["RETRY_NOW", "PAYMENT_LINK", "CUSTOMER_NUDGE"]).optional(),
  note: z.string().max(500).optional(),
});

const stopBody = z.object({ note: z.string().max(500).optional() });
const simulateBody = z.object({ scenario: z.string().min(1) });
const idParams = z.object({ id: z.string().uuid() });
const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(40) });

function parseIdParam(req: FastifyRequest, reply: FastifyReply): string | null {
  const parsed = idParams.safeParse(req.params);
  if (!parsed.success) {
    reply.code(400).send({ error: "invalid id parameter" });
    return null;
  }
  return parsed.data.id;
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const guard = { onRequest: requireUser(deps.auth) };

  async function ownedCase(req: FastifyRequest, reply: FastifyReply): Promise<RecoveryCase | null> {
    const id = parseIdParam(req, reply);
    if (id === null) return null;
    const kase = await deps.cases.byId(id);
    if (!kase || kase.merchantRef !== req.user!.id) {
      reply.code(404).send({ error: "not found" });
      return null;
    }
    return kase;
  }

  async function runtimeFor(req: FastifyRequest, reply: FastifyReply): Promise<TenantRuntime | null> {
    const runtime = await deps.runtimes.forUser(req.user!.id);
    if (!runtime) {
      reply.code(409).send({ error: "connect your Razorpay test keys first" });
      return null;
    }
    return runtime;
  }

  app.get("/config", guard, async () => deps.runtimeInfo);

  app.get("/scenarios", guard, async () => ({
    scenarios: FAILURE_SCENARIOS.map(({ id, label, amountPaise, method, errorReason }) => ({
      id,
      label,
      amountPaise,
      method,
      errorReason,
    })),
  }));

  app.get("/cases", guard, async (req) => ({ cases: await deps.cases.listLive(req.user!.id) }));

  app.get("/activity", guard, async (req, reply) => {
    const query = activityQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid limit" });
    return { events: await deps.activity.forMerchant(req.user!.id, query.data.limit) };
  });

  app.get("/queue", guard, async (req) => ({ cases: await deps.cases.listByLane("ESCALATED", req.user!.id) }));

  app.get("/metrics", guard, async (req) => {
    const runtime = await deps.runtimes.forUser(req.user!.id);
    return { ...(await deps.cases.metrics(req.user!.id)), braked: runtime ? await runtime.pipeline.isBraked() : false };
  });

  app.get("/cases/:id", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    const [attempts, events] = await Promise.all([deps.attempts.listByCase(kase.id), deps.events.forCase(kase.id)]);
    return { case: kase, attempts, events };
  });

  app.get("/cases/:id/pay", guard, async (req, reply): Promise<PayInfo> => {
    const kase = await ownedCase(req, reply);
    if (!kase) return { payable: false };
    const runtime = await deps.runtimes.forUser(req.user!.id);
    const pending = await deps.attempts.payableAttempt(kase.id);
    if (!runtime || !pending?.razorpayRef) return { payable: false };

    if (pending.action === "RETRY_NOW" || pending.action === "RETRY_SCHEDULED") {
      return { payable: true, kind: "order", orderId: pending.razorpayRef, amountPaise: kase.amountPaise, currency: kase.currency };
    }
    if (pending.action === "PAYMENT_LINK") {
      const link = await runtime.razorpay.getPaymentLink(pending.razorpayRef);
      if (!link) return { payable: false };
      return { payable: true, kind: "payment_link", url: link.url, amountPaise: link.amountPaise };
    }
    return { payable: false };
  });

  app.post("/simulate", guard, async (req, reply) => {
    const body = simulateBody.safeParse(req.body);
    const scenario = body.success ? scenarioById(body.data.scenario) : undefined;
    if (!scenario) return reply.code(400).send({ error: "unknown scenario" });
    const runtime = await runtimeFor(req, reply);
    if (!runtime) return;
    if ((await deps.cases.listLive(req.user!.id)).length >= deps.maxCasesPerUser) {
      return reply.code(429).send({ error: `demo limit of ${deps.maxCasesPerUser} cases reached` });
    }

    const rawBody = JSON.stringify({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
            amount: scenario.amountPaise,
            status: "failed",
            method: scenario.method,
            error_code: scenario.errorCode,
            error_reason: scenario.errorReason,
            email: `customer+${randomUUID().slice(0, 6)}@example.com`,
            bank: scenario.bank ?? null,
            vpa: scenario.vpa ?? null,
            card: scenario.issuer ? { issuer: scenario.issuer } : null,
          },
        },
      },
    });
    const signature = createHmac("sha256", runtime.creds.webhookSecret).update(rawBody).digest("hex");
    const result = await runtime.webhookHandler.handle({ rawBody, signature, eventId: `evt_sim_${randomUUID()}` });
    return reply.code(202).send(result);
  });

  app.post("/cases/:id/recover", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    await enqueueRecovery(deps.queue, kase.id, { force: true });
    return reply.code(202).send({ queued: true });
  });

  // Never aborts a call already in flight to Razorpay or the model — see StopRegistry.
  app.post("/cases/:id/stop", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    const body = stopBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.issues });
    const runtime = await runtimeFor(req, reply);
    if (!runtime) return;
    await runtime.pipeline.requestStop(kase.id, { reason: "user_requested", note: body.data.note });
    return { stopped: true };
  });

  app.post("/stop", guard, async (req, reply) => {
    const body = stopBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.issues });
    const runtime = await runtimeFor(req, reply);
    if (!runtime) return;
    const result = await runtime.pipeline.requestStopAll({ reason: "user_requested", note: body.data.note });
    return { stopped: true, ...result };
  });

  app.post("/resume", guard, async (req, reply) => {
    const runtime = await runtimeFor(req, reply);
    if (!runtime) return;
    await runtime.pipeline.resumeAll();
    return { resumed: true };
  });

  // Proves the append-only guarantee rather than asserting it — attempts a real UPDATE.
  app.get("/cases/:id/audit/verify", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    return deps.verifyAppendOnly();
  });

  app.post("/cases/:id/decision", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    const body = decisionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues });
    if (kase.lane !== "ESCALATED") return reply.code(409).send({ error: "case is not awaiting a decision" });

    if (body.data.decision === "write_off") {
      await deps.events.append({
        caseId: kase.id,
        type: "CASE_RESOLVED",
        payload: { via: "human", ...body.data, activity: "outcome" },
      });
      await deps.cases.moveLane(kase.id, "ESCALATED", "WRITTEN_OFF");
      return { applied: body.data.decision };
    }

    // Recorded before the case moves, so the directive is durable before any worker can pick it up.
    const action = directedAction(body.data);
    await deps.events.append({
      caseId: kase.id,
      type: "HUMAN_DIRECTIVE",
      payload: {
        action,
        approver: SHARED_TOKEN_APPROVER,
        at: new Date().toISOString(),
        note: body.data.note ?? null,
        decision: body.data.decision,
        activity: "outcome",
      },
    });
    await deps.cases.moveLane(kase.id, "ESCALATED", "RETRY_SCHEDULED");
    await enqueueRecovery(deps.queue, kase.id, { force: true });
    return { applied: body.data.decision, action: action.kind };
  });

  app.get("/stream", guard, async (req, reply) => {
    const userId = req.user!.id;
    const owned = new Map<string, boolean>();
    const isOwned = async (caseId: string): Promise<boolean> => {
      const cached = owned.get(caseId);
      if (cached !== undefined) return cached;
      const kase = await deps.cases.byId(caseId);
      const result = kase?.merchantRef === userId;
      if (result) owned.set(caseId, true);
      return result;
    };
    openSse(
      req,
      reply,
      { type: "open" },
      (send) =>
        deps.bus.subscribeRoom((event: RoomStreamEvent) => {
          void isOwned(event.caseId).then((ok) => ok && send(event));
        }),
      async (send) => send({ type: "metrics", ...(await deps.cases.metrics(userId)) }),
    );
  });

  app.get("/cases/:id/stream", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    openSse(
      req,
      reply,
      { type: "open", caseId: kase.id },
      (send) => deps.bus.subscribe(kase.id, send),
      // Without a status frame, a finished case looks identical to one stuck mid-investigation.
      async (send) => {
        const fresh = await deps.cases.byId(kase.id);
        if (fresh) send({ type: "status", lane: fresh.lane, active: IN_FLIGHT_LANES.includes(fresh.lane) });
      },
    );
  });

  // Demo aid: builds a real signed webhook and runs it through the same handler a live delivery hits.
  app.post("/cases/:id/simulate-capture", guard, async (req, reply) => {
    const kase = await ownedCase(req, reply);
    if (!kase) return;
    const runtime = await runtimeFor(req, reply);
    if (!runtime) return;
    const attempt = (await deps.attempts.listByCase(kase.id)).find((a) => a.status === "PENDING" && a.razorpayRef);
    if (!attempt) return reply.code(409).send({ error: "no pending attempt with a razorpay order" });

    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${randomUUID().slice(0, 12)}`,
            order_id: attempt.razorpayRef,
            amount: kase.amountPaise,
            status: "captured",
          },
        },
      },
    });
    const signature = createHmac("sha256", runtime.creds.webhookSecret).update(rawBody).digest("hex");
    return runtime.webhookHandler.handle({ rawBody, signature, eventId: `evt_sim_${randomUUID()}` });
  });

  app.post("/webhooks/razorpay/:token", async (req, reply) => {
    const token = (req.params as { token?: string }).token;
    const runtime = token ? await deps.runtimes.forWebhookToken(token) : null;
    if (!runtime) return reply.code(404).send({ error: "unknown webhook" });
    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    if (typeof signature !== "string" || typeof eventId !== "string") {
      return reply.code(400).send({ error: "missing signature headers" });
    }
    // A re-serialized body can never verify against Razorpay's HMAC — fail loudly, not silently.
    const rawBody = (req as { rawBody?: string }).rawBody;
    if (rawBody === undefined) return reply.code(500).send({ error: "rawBody unavailable" });
    const result = await runtime.webhookHandler.handle({ rawBody, signature, eventId });
    const code = result.status === "invalid_signature" ? 401 : result.status === "malformed" ? 400 : 200;
    return reply.code(code).send(result);
  });
}
