import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { createPool } from "./persistence/pool.js";
import { PostgresCaseRepository } from "./persistence/case-repository.js";
import { LanePublishingCaseRepository } from "./persistence/lane-publishing-case-repository.js";
import { PostgresAttemptRepository } from "./persistence/attempt-repository.js";
import { PostgresEventLog } from "./persistence/event-log.js";
import { PostgresRecentActivity } from "./persistence/recent-activity.js";
import { PublishingEventLog } from "./persistence/publishing-event-log.js";
import { verifyAppendOnly } from "./persistence/audit-verify.js";
import { PostgresWebhookInbox } from "./persistence/webhook-inbox.js";
import { DEFAULT_LIMITS } from "./safety/safety-gate.js";
import { resolveModel } from "./agent/model.js";
import { redisConnection, recoveryQueue, recoveryWorker } from "./worker/queue.js";
import { makeProcessor } from "./worker/recovery-worker.js";
import { startReconcileSweep } from "./worker/reconcile-sweep.js";
import { CaseEventBus } from "./api/event-bus.js";
import { registerRoutes } from "./api/routes.js";
import { registerAuthRoutes } from "./api/auth-routes.js";
import { keepRawJsonBody } from "./api/raw-body.js";
import { AuthService } from "./auth/service.js";
import { ConsoleMailer, ResendMailer } from "./auth/mailer.js";
import { parseVaultKey } from "./auth/crypto.js";
import { CredentialStore, verifyRazorpayKeys } from "./tenants/credentials.js";
import { TenantRuntimes } from "./tenants/runtime.js";

const config = loadConfig();
const isProduction = config.NODE_ENV === "production";
if (isProduction && !config.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required in production");

const pool = createPool(config.DATABASE_URL);
const attempts = new PostgresAttemptRepository(pool);
const webhooks = new PostgresWebhookInbox(pool);
const bus = new CaseEventBus();
const events = new PublishingEventLog(new PostgresEventLog(pool), bus);
const cases = new LanePublishingCaseRepository(new PostgresCaseRepository(pool), events);

const connection = redisConnection(config.REDIS_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = recoveryQueue(connection);

const credentials = new CredentialStore(pool, parseVaultKey(config.VAULT_KEY));
const runtimes = new TenantRuntimes({
  credentials,
  cases,
  attempts,
  events,
  webhooks,
  queue,
  redis,
  baseModel: resolveModel(config.AGENT_MODEL, {
    openRouterApiKey: config.OPENROUTER_API_KEY,
    googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  modelId: config.AGENT_MODEL,
  agent: { stepBudget: config.AGENT_STEP_BUDGET, deadlineMs: config.AGENT_TIMEOUT_MS },
  budget: {
    capUsd: config.AGENT_USER_CAP_USD,
    usdPerMInput: config.AGENT_USD_PER_M_INPUT,
    usdPerMOutput: config.AGENT_USD_PER_M_OUTPUT,
  },
});

const worker = recoveryWorker(
  connection,
  makeProcessor(
    async (caseId) => {
      const runtime = await runtimes.forCase(caseId);
      if (!runtime) throw new Error(`no credentials for case ${caseId}`);
      return runtime.pipeline;
    },
    queue,
    bus,
    events,
  ),
);
const sweep = startReconcileSweep(attempts, cases, queue);

const auth = new AuthService(
  pool,
  config.RESEND_API_KEY
    ? new ResendMailer({ apiKey: config.RESEND_API_KEY, from: config.MAIL_FROM, appName: "Recovery OPS" })
    : new ConsoleMailer(),
  config.SESSION_SECRET,
);

const app = Fastify({ logger: true, trustProxy: isProduction });
keepRawJsonBody(app);

await app.register(
  async (api) => {
    api.get("/health", async () => ({ status: "ok" }));
    await registerAuthRoutes(api, {
      auth,
      credentials,
      runtimes,
      verifyKeys: verifyRazorpayKeys,
      publicUrl: config.PUBLIC_URL,
      secureCookies: isProduction,
      codeRequestsPerHour: config.OTP_REQUESTS_PER_HOUR,
    });
    await registerRoutes(api, {
      auth,
      runtimes,
      cases,
      attempts,
      events,
      activity: new PostgresRecentActivity(pool),
      queue,
      bus,
      verifyAppendOnly: () => verifyAppendOnly(pool),
      runtimeInfo: {
        model: config.AGENT_MODEL,
        deadlineMs: config.AGENT_TIMEOUT_MS,
        stepBudget: config.AGENT_STEP_BUDGET,
        limits: DEFAULT_LIMITS,
      },
      maxCasesPerUser: config.MAX_CASES_PER_USER,
    });
  },
  { prefix: "/api" },
);

const webRoot = resolve("web/dist");
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    sweep.stop();
    void Promise.allSettled([app.close(), worker.close(), queue.close(), pool.end()]).then(() => process.exit(0));
  });
}
