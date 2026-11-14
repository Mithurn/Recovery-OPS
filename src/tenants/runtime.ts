import type { LanguageModel } from "ai";
import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { AttemptRepository, CaseRepository, EventLog, WebhookInbox } from "../domain/ports.js";
import type { RecoveryJob } from "../worker/queue.js";
import { enqueueRecovery } from "../worker/queue.js";
import { RazorpayClient } from "../execution/razorpay-client.js";
import { RazorpayOutcomeResolver } from "../execution/razorpay-outcome-resolver.js";
import { AttemptExecutor } from "../execution/attempt-executor.js";
import { LoggingNotifier } from "../execution/notifier.js";
import { WebhookHandler } from "../execution/webhook-handler.js";
import { RecoveryPipeline } from "../worker/pipeline.js";
import { RedisStopStore } from "../worker/redis-stop-store.js";
import { runRecoveryAgent } from "../agent/recovery-agent.js";
import { createBudget, guardModel, type BudgetState } from "../agent/budget.js";
import { systemClock } from "../domain/attempt.js";
import { isHardDecline, isRiskHold } from "../domain/case.js";
import type { SpendStore } from "../persistence/spend-repository.js";
import { SpendPersister } from "./spend-persister.js";
import type { CredentialStore, TenantCredentials } from "./credentials.js";

export type TenantRuntimeDeps = {
  credentials: CredentialStore;
  cases: CaseRepository;
  attempts: AttemptRepository;
  events: EventLog;
  webhooks: WebhookInbox;
  queue: Queue<RecoveryJob>;
  redis: Redis;
  baseModel: LanguageModel;
  fallbackModel?: LanguageModel;
  modelId: string;
  agent: { stepBudget: number; deadlineMs: number };
  budget: { capUsd: number; usdPerMInput: number; usdPerMOutput: number };
  spend?: { store: SpendStore; flushIntervalMs?: number };
};

export type TenantRuntime = {
  userId: string;
  creds: TenantCredentials;
  budget: BudgetState;
  pipeline: RecoveryPipeline;
  webhookHandler: WebhookHandler;
  razorpay: RazorpayClient;
};

export class TenantRuntimes {
  private readonly cache = new Map<string, Promise<TenantRuntime | null>>();
  private readonly budgets = new Map<string, Promise<BudgetState>>();
  private readonly persister: SpendPersister | null;

  constructor(private readonly deps: TenantRuntimeDeps) {
    this.persister = deps.spend ? new SpendPersister(deps.spend.store, deps.spend.flushIntervalMs) : null;
  }

  flushSpend(): Promise<void> {
    return this.persister?.flush() ?? Promise.resolve();
  }

  forUser(userId: string): Promise<TenantRuntime | null> {
    let runtime = this.cache.get(userId);
    if (!runtime) {
      runtime = this.deps.credentials.forUser(userId).then((creds) => (creds ? this.build(creds) : null));
      this.cache.set(userId, runtime);
      void runtime.then(
        (built) => built ?? this.cache.delete(userId),
        () => this.cache.delete(userId),
      );
    }
    return runtime;
  }

  async forCase(caseId: string): Promise<TenantRuntime | null> {
    const kase = await this.deps.cases.byId(caseId);
    return kase ? this.forUser(kase.merchantRef) : null;
  }

  async forWebhookToken(token: string): Promise<TenantRuntime | null> {
    const creds = await this.deps.credentials.forWebhookToken(token);
    return creds ? this.forUser(creds.userId) : null;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private budgetFor(userId: string): Promise<BudgetState> {
    let budget = this.budgets.get(userId);
    if (!budget) {
      budget = this.loadBudget(userId);
      this.budgets.set(userId, budget);
      budget.catch(() => this.budgets.delete(userId));
    }
    return budget;
  }

  private async loadBudget(userId: string): Promise<BudgetState> {
    const budget = createBudget(this.deps.budget.capUsd, {
      usdPerMInput: this.deps.budget.usdPerMInput,
      usdPerMOutput: this.deps.budget.usdPerMOutput,
    });
    const saved = await this.deps.spend?.store.load(userId);
    if (saved) Object.assign(budget, saved);
    this.persister?.attach(userId, budget);
    return budget;
  }

  private async build(creds: TenantCredentials): Promise<TenantRuntime> {
    const d = this.deps;
    const razorpay = new RazorpayClient({
      keyId: creds.keyId,
      keySecret: creds.keySecret,
      webhookSecret: creds.webhookSecret,
    });
    const outcomeResolver = new RazorpayOutcomeResolver(razorpay);
    const notifier = new LoggingNotifier(d.events);
    const executor = new AttemptExecutor(d.attempts, d.events, razorpay, outcomeResolver, notifier);
    const budget = await this.budgetFor(creds.userId);
    const model = guardModel(d.baseModel, budget);
    const fallbackModel = d.fallbackModel ? guardModel(d.fallbackModel, budget) : undefined;

    const pipeline = new RecoveryPipeline({
      cases: d.cases,
      attempts: d.attempts,
      events: d.events,
      gateway: razorpay,
      outcomeResolver,
      notifier,
      clock: systemClock,
      riskHoldForCase: isRiskHold,
      hardDeclineForCase: isHardDecline,
      stopRegistry: new RedisStopStore(d.redis, creds.userId),
      merchantRef: creds.userId,
      agentModel: d.modelId,
      budget,
      similarCases: (kase, query) =>
        d.cases.similarResolved(kase.failureReason, {
          method: query.method ?? null,
          beforeFailedAt: kase.failedAt,
          runId: kase.runId,
          limit: query.limit ?? 8,
        }),
      runAgent: (agentDeps, events) =>
        runRecoveryAgent(
          agentDeps,
          { model, fallbackModel, stepBudget: d.agent.stepBudget, deadlineMs: d.agent.deadlineMs },
          events,
        ),
    });

    const webhookHandler = new WebhookHandler({
      client: razorpay,
      inbox: d.webhooks,
      attempts: d.attempts,
      cases: d.cases,
      events: d.events,
      executor,
      enqueuer: { enqueue: (caseId: string) => enqueueRecovery(d.queue, caseId) },
      merchantRef: creds.userId,
    });

    return { userId: creds.userId, creds, budget, pipeline, webhookHandler, razorpay };
  }
}
