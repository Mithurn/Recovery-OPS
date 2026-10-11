import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../src/api/auth-routes.js";
import { keepRawJsonBody } from "../src/api/raw-body.js";
import { registerRoutes } from "../src/api/routes.js";
import { CaseEventBus } from "../src/api/event-bus.js";
import { AuthService } from "../src/auth/service.js";
import type { OtpMailer } from "../src/auth/mailer.js";
import { CredentialStore } from "../src/tenants/credentials.js";
import { TenantRuntimes } from "../src/tenants/runtime.js";
import { createPool, type Db } from "../src/persistence/pool.js";
import { PostgresCaseRepository } from "../src/persistence/case-repository.js";
import { LanePublishingCaseRepository } from "../src/persistence/lane-publishing-case-repository.js";
import { PostgresAttemptRepository } from "../src/persistence/attempt-repository.js";
import { PostgresEventLog } from "../src/persistence/event-log.js";
import { PublishingEventLog } from "../src/persistence/publishing-event-log.js";
import { PostgresRecentActivity } from "../src/persistence/recent-activity.js";
import { PostgresWebhookInbox } from "../src/persistence/webhook-inbox.js";
import { DEFAULT_LIMITS } from "../src/safety/safety-gate.js";

const adminUrl = process.env.ADMIN_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

class CapturingMailer implements OtpMailer {
  codes = new Map<string, string>();
  async sendCode(email: string, code: string): Promise<void> {
    this.codes.set(email, code);
  }
}

type Session = { cookie: string; userId: string };

describe.runIf(adminUrl && redisUrl)("product API: auth, keys and tenant isolation", () => {
  let db: Db;
  let redis: Redis;
  let app: FastifyInstance;
  const mailer = new CapturingMailer();
  const emails: string[] = [];
  const queued: string[] = [];

  async function call(method: "GET" | "POST" | "PUT", url: string, opts: { cookie?: string; body?: unknown } = {}) {
    return app.inject({
      method,
      url: `/api${url}`,
      headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.body ? { "content-type": "application/json" } : {}) },
      payload: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  }

  async function signIn(): Promise<Session> {
    const email = `${randomUUID()}@example.com`;
    emails.push(email);
    expect((await call("POST", "/auth/request", { body: { email } })).statusCode).toBe(200);
    const res = await call("POST", "/auth/verify", { body: { email, code: mailer.codes.get(email) } });
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    return { cookie, userId: res.json().user.id };
  }

  async function connect(session: Session): Promise<void> {
    const res = await call("PUT", "/credentials", { cookie: session.cookie, body: { keyId: "rzp_test_abc123", keySecret: "secret" } });
    expect(res.statusCode).toBe(200);
  }

  beforeAll(async () => {
    db = createPool(adminUrl!);
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    const bus = new CaseEventBus();
    const events = new PublishingEventLog(new PostgresEventLog(db), bus);
    const cases = new LanePublishingCaseRepository(new PostgresCaseRepository(db), events);
    const attempts = new PostgresAttemptRepository(db);
    const credentials = new CredentialStore(db, randomBytes(32));
    const queue = {
      add: async (_name: string, data: { caseId: string }) => void queued.push(data.caseId),
      removeDeduplicationKey: async () => undefined,
    } as never;
    const runtimes = new TenantRuntimes({
      credentials,
      cases,
      attempts,
      events,
      webhooks: new PostgresWebhookInbox(db),
      queue,
      redis,
      baseModel: {} as never,
      modelId: "test-model",
      agent: { stepBudget: 6, deadlineMs: 90_000 },
      budget: { capUsd: 0.1, usdPerMInput: 1, usdPerMOutput: 1 },
    });
    const auth = new AuthService(db, mailer, "test-secret-test-secret");

    app = Fastify();
    keepRawJsonBody(app);
    await app.register(
      async (api) => {
        await registerAuthRoutes(api, {
          auth,
          credentials,
          runtimes,
          verifyKeys: async (keyId) => keyId.startsWith("rzp_test_"),
          publicUrl: "http://localhost",
          secureCookies: false,
          codeRequestsPerHour: 100,
        });
        await registerRoutes(api, {
          auth,
          runtimes,
          cases,
          attempts,
          events,
          activity: new PostgresRecentActivity(db),
          queue,
          bus,
          verifyAppendOnly: async () => ({ enforced: true, role: "recovery_app" }),
          runtimeInfo: { model: "test", deadlineMs: 90_000, stepBudget: 6, limits: DEFAULT_LIMITS },
          maxCasesPerUser: 2,
        });
      },
      { prefix: "/api" },
    );
  });

  afterAll(async () => {
    await db.query("DELETE FROM recovery_events WHERE case_id IN (SELECT id FROM recovery_cases WHERE merchant_ref IN (SELECT id::text FROM users WHERE email = ANY($1)))", [emails]);
    await db.query("DELETE FROM recovery_cases WHERE merchant_ref IN (SELECT id::text FROM users WHERE email = ANY($1))", [emails]);
    await db.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await db.query("DELETE FROM otp_codes WHERE email = ANY($1)", [emails]);
    await app.close();
    await redis.quit();
    await db.end();
  });

  it("rejects unauthenticated requests", async () => {
    expect((await call("GET", "/cases")).statusCode).toBe(401);
    expect((await call("POST", "/simulate", { body: { scenario: "bank_timeout" } })).statusCode).toBe(401);
  });

  it("signs in with an emailed code, and a wrong code fails", async () => {
    const email = `${randomUUID()}@example.com`;
    emails.push(email);
    await call("POST", "/auth/request", { body: { email } });
    const wrong = await call("POST", "/auth/verify", { body: { email, code: "000000" } });
    expect(wrong.statusCode).toBe(401);
    const resend = await call("POST", "/auth/request", { body: { email } });
    expect(resend.statusCode).toBe(429);
    const ok = await call("POST", "/auth/verify", { body: { email, code: mailer.codes.get(email) } });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers["set-cookie"])).toContain("HttpOnly");
  });

  it("locks a code after too many wrong attempts", async () => {
    const email = `${randomUUID()}@example.com`;
    emails.push(email);
    await call("POST", "/auth/request", { body: { email } });
    for (let i = 0; i < 6; i++) await call("POST", "/auth/verify", { body: { email, code: "111111" } });
    const real = await call("POST", "/auth/verify", { body: { email, code: mailer.codes.get(email) } });
    expect(real.statusCode).toBe(401);
  });

  it("accepts only test mode keys and stores the secret encrypted", async () => {
    const session = await signIn();
    const live = await call("PUT", "/credentials", { cookie: session.cookie, body: { keyId: "rzp_live_abc", keySecret: "s" } });
    expect(live.statusCode).toBe(400);
    await connect(session);
    const { rows } = await db.query("SELECT key_secret_enc FROM tenant_credentials WHERE user_id = $1", [session.userId]);
    expect(rows[0].key_secret_enc).not.toContain("secret");
    const shown = (await call("GET", "/credentials", { cookie: session.cookie })).json();
    expect(shown).toMatchObject({ connected: true, keyId: "rzp_test_abc123" });
    expect(shown).not.toHaveProperty("keySecret");
  });

  it("refuses to simulate before keys are connected", async () => {
    const session = await signIn();
    const res = await call("POST", "/simulate", { cookie: session.cookie, body: { scenario: "bank_timeout" } });
    expect(res.statusCode).toBe(409);
  });

  it("simulates a failure into the caller's own case, enforces the demo cap, and hides it from other users", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await connect(alice);
    await connect(bob);

    const first = await call("POST", "/simulate", { cookie: alice.cookie, body: { scenario: "bank_timeout" } });
    expect(first.statusCode).toBe(202);
    const caseId = first.json().caseId as string;
    expect(queued).toContain(caseId);

    const aliceCases = (await call("GET", "/cases", { cookie: alice.cookie })).json().cases;
    expect(aliceCases.map((c: { id: string }) => c.id)).toEqual([caseId]);
    expect((await call("GET", "/cases", { cookie: bob.cookie })).json().cases).toEqual([]);
    expect((await call("GET", `/cases/${caseId}`, { cookie: bob.cookie })).statusCode).toBe(404);
    expect((await call("POST", `/cases/${caseId}/recover`, { cookie: bob.cookie })).statusCode).toBe(404);
    expect((await call("GET", "/activity", { cookie: bob.cookie })).json().events).toEqual([]);
    expect((await call("GET", "/activity", { cookie: alice.cookie })).json().events.length).toBeGreaterThan(0);

    await call("POST", "/simulate", { cookie: alice.cookie, body: { scenario: "low_balance" } });
    const capped = await call("POST", "/simulate", { cookie: alice.cookie, body: { scenario: "expired_card" } });
    expect(capped.statusCode).toBe(429);
  });

  it("rejects webhooks for an unknown token and a bad signature", async () => {
    expect((await call("POST", "/webhooks/razorpay/nope", { body: { event: "x" } })).statusCode).toBe(404);
    const session = await signIn();
    await connect(session);
    const token = (await call("GET", "/credentials", { cookie: session.cookie })).json().webhookUrl.split("/").pop();
    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/razorpay/${token}`,
      headers: { "content-type": "application/json", "x-razorpay-signature": "bad", "x-razorpay-event-id": "evt_1" },
      payload: JSON.stringify({ event: "payment.failed", payload: {} }),
    });
    expect(res.statusCode).toBe(401);
  });
});
