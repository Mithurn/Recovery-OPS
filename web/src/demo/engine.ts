import type { Attempt, CaseDetail, Lane, RecoveryCase, RoomMetrics, RoomStreamEvent, StoredEvent, StreamEvent } from "../types.js";
import { RESOLVED_LANES } from "../types.js";
import type { DataSource, RuntimeConfig, Scenario } from "../api.js";
import { materialize } from "./history.js";
import { DEMO_SCENARIOS, WRITTEN_OFF_STEPS, type DemoScenario, type Step } from "./scenarios.js";

const TOOL_RESULT_DELAY_MS = 420;
const THINK_CHUNK_MS = 90;
const AUDIT_VERIFY = { enforced: true, role: "recovery_app" };
const LIMITS = { maxAttempts: 4, maxExposurePaise: 500000, cooldownHours: 6 };
const RUNTIME: RuntimeConfig = { model: "recorded replay", deadlineMs: 90_000, stepBudget: 6, limits: LIMITS };
const ACTIVITY_LIMIT = 40;
const AUTOPLAY_FIRST_MS = 1400;
const AUTOPLAY_EVERY_MS = 17_000;
const AUTOPLAY_CASE_CAP = 12;
const HISTORY_DAYS = [29, 59, 89, 119];

type Listener<T> = (event: T) => void;

class Channel<T> {
  private readonly listeners = new Set<Listener<T>>();
  publish(event: T): void {
    for (const l of this.listeners) l(event);
  }
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function* iterate<T>(channel: Channel<T>, first: T[], signal: AbortSignal): AsyncGenerator<T> {
  const queue: T[] = [...first];
  let wake: (() => void) | null = null;
  const off = channel.subscribe((e) => {
    queue.push(e);
    wake?.();
  });
  const onAbort = () => wake?.();
  signal.addEventListener("abort", onAbort);
  try {
    while (!signal.aborted) {
      const next = queue.shift();
      if (next !== undefined) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  } finally {
    off();
    signal.removeEventListener("abort", onAbort);
  }
}

export class DemoEngine implements DataSource {
  private readonly cases = new Map<string, RecoveryCase>();
  private readonly events = new Map<string, StoredEvent[]>();
  private readonly attempts = new Map<string, Attempt[]>();
  private readonly room = new Channel<RoomStreamEvent>();
  private readonly perCase = new Map<string, Channel<StreamEvent>>();
  private readonly timers = new Set<number>();
  private eventSeq = 0;
  private braked = false;
  private loop: number | null = null;
  private cursor = 0;

  constructor() {
    this.seedHistory();
  }

  start(): void {
    if (this.loop !== null) return;
    this.schedule(AUTOPLAY_FIRST_MS, () => this.playNext());
    this.loop = window.setInterval(() => this.playNext(), AUTOPLAY_EVERY_MS);
  }

  dispose(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    if (this.loop !== null) window.clearInterval(this.loop);
    this.loop = null;
  }

  private playNext(): void {
    if (this.braked || this.cases.size >= AUTOPLAY_CASE_CAP) return;
    const scenario = DEMO_SCENARIOS[this.cursor++ % DEMO_SCENARIOS.length]!;
    this.play(scenario);
  }

  listCases = async () => [...this.cases.values()].sort((a, b) => b.failedAt.localeCompare(a.failedAt));
  queue = async () => (await this.listCases()).filter((c) => c.lane === "ESCALATED");
  runtimeConfig = async () => RUNTIME;
  metrics = async () => this.snapshot();
  verifyAudit = async () => AUDIT_VERIFY;
  payInfo = async () => ({ payable: false as const });
  scenarios = async (): Promise<Scenario[]> =>
    DEMO_SCENARIOS.map(({ id, label, amountPaise, method, errorReason }) => ({ id, label, amountPaise, method, errorReason }));

  recentActivity = async (limit = ACTIVITY_LIMIT) =>
    [...this.events.values()].flat().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, limit);

  caseDetail = async (id: string): Promise<CaseDetail> => {
    const kase = this.cases.get(id);
    if (!kase) throw new Error("not found");
    return { case: kase, attempts: this.attempts.get(id) ?? [], events: [...(this.events.get(id) ?? [])] };
  };

  simulate = async (scenarioId: string): Promise<unknown> => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error("unknown scenario");
    if (this.braked) throw new Error("emergency stop is active, resume first");
    return { status: "ingested", caseId: this.play(scenario) };
  };

  recover = async (id: string) => {
    const kase = this.cases.get(id);
    if (!kase) throw new Error("not found");
    const scenario = DEMO_SCENARIOS.find((s) => s.errorReason === kase.failureReason);
    if (!scenario || RESOLVED_LANES.includes(kase.lane)) return;
    this.audit(id, "CASE_CREATED", { failureReason: kase.failureReason, amountPaise: kase.amountPaise, merchantRef: "demo" });
    this.run(id, scenario.steps);
  };

  simulateCapture = async () => undefined;

  decide = async (id: string, body: { decision: "approve" | "redirect" | "write_off" }) => {
    const kase = this.cases.get(id);
    if (!kase || kase.lane !== "ESCALATED") throw new Error("case is not awaiting a decision");
    if (body.decision === "write_off") {
      this.audit(id, "CASE_RESOLVED", { via: "human", decision: "write_off", lane: "WRITTEN_OFF", activity: "outcome" });
      this.moveLane(id, "WRITTEN_OFF");
      return;
    }
    this.audit(id, "HUMAN_DIRECTIVE", { decision: body.decision, approver: "demo reviewer", activity: "outcome" });
    this.moveLane(id, "RETRY_SCHEDULED");
    this.schedule(1200, () => {
      this.audit(id, "ATTEMPT_STARTED", { attemptNo: 2, action: { kind: "RETRY_NOW" }, clamped: false, activity: "execute" });
      this.setAttempt(id, { attemptNo: 2, action: "RETRY_NOW", status: "PENDING" });
    });
    this.schedule(3200, () => this.settle(id, "RECOVERED"));
    this.schedule(3500, () => this.resolve(id, "RECOVERED"));
  };

  stopCase = async (id: string) => {
    if (this.cases.has(id) && !RESOLVED_LANES.includes(this.cases.get(id)!.lane)) {
      this.audit(id, "CASE_STOPPED", { reason: "user_requested", lane: "STOPPED", activity: "outcome" });
      this.moveLane(id, "STOPPED");
    }
  };

  stopAll = async () => {
    this.braked = true;
    let stoppedNow = 0;
    for (const c of this.cases.values()) {
      if (!RESOLVED_LANES.includes(c.lane)) {
        await this.stopCase(c.id);
        stoppedNow++;
      }
    }
    this.publishMetrics();
    return { stoppedNow };
  };

  resumeAll = async () => {
    this.braked = false;
    this.publishMetrics();
  };

  streamRoom = (signal: AbortSignal): AsyncGenerator<RoomStreamEvent> =>
    iterate(this.room, [{ type: "open" }, { type: "metrics", ...this.snapshot() }], signal);

  streamCase = (id: string, signal: AbortSignal): AsyncGenerator<StreamEvent> => {
    const kase = this.cases.get(id);
    const first: StreamEvent[] = [{ type: "open", caseId: id }];
    if (kase) first.push({ type: "status", lane: kase.lane, active: !RESOLVED_LANES.includes(kase.lane) });
    return iterate(this.channelFor(id), first, signal);
  };

  private channelFor(id: string): Channel<StreamEvent> {
    let channel = this.perCase.get(id);
    if (!channel) this.perCase.set(id, (channel = new Channel()));
    return channel;
  }

  private snapshot(): RoomMetrics {
    const byLane: RoomMetrics["byLane"] = {};
    let recoveredPaise = 0;
    let exposurePaise = 0;
    for (const c of this.cases.values()) {
      byLane[c.lane] = (byLane[c.lane] ?? 0) + 1;
      recoveredPaise += c.recoveredPaise;
      if (!RESOLVED_LANES.includes(c.lane) && c.lane !== "WRITTEN_OFF") exposurePaise += c.amountPaise;
    }
    return {
      recoveredPaise,
      recoveredLivePaise: 0,
      recoveredSimulatedPaise: recoveredPaise,
      exposurePaise,
      liveCases: this.cases.size,
      byLane,
      braked: this.braked,
    };
  }

  private publishMetrics(): void {
    this.room.publish({ type: "metrics", ...this.snapshot() });
  }

  private schedule(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  private play(scenario: DemoScenario): string {
    const id = crypto.randomUUID();
    const kase: RecoveryCase = {
      id,
      merchantRef: "demo",
      customerRef: `customer+${id.slice(0, 6)}@example.com`,
      amountPaise: scenario.amountPaise,
      currency: "INR",
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: scenario.errorReason,
      failedAt: new Date().toISOString(),
      method: scenario.method,
      instrument: scenario.issuer ? { issuer: scenario.issuer } : scenario.vpa ? { vpa_handle: scenario.vpa } : null,
      customerHistory: this.history(scenario.amountPaise, scenario.method),
      lane: "INCOMING",
      recoveredPaise: 0,
    };
    this.cases.set(id, kase);
    this.events.set(id, []);
    this.attempts.set(id, []);
    this.audit(id, "CASE_CREATED", { failureReason: scenario.errorReason, amountPaise: scenario.amountPaise, merchantRef: "demo" });
    this.publishMetrics();
    this.run(id, scenario.steps);
    return id;
  }

  private run(id: string, steps: Step[]): void {
    for (const step of steps) this.schedule(step.at, () => this.apply(id, step));
  }

  private apply(id: string, step: Step): void {
    if (!this.cases.has(id) || RESOLVED_LANES.includes(this.cases.get(id)!.lane) && step.do !== "resolve") return;
    const stream = this.channelFor(id);
    switch (step.do) {
      case "audit":
        this.audit(id, step.type, step.payload);
        break;
      case "lane":
        this.moveLane(id, step.to);
        break;
      case "think": {
        const words = step.text.split(" ");
        const size = Math.ceil(words.length / 4);
        for (let i = 0; i < 4; i++) {
          this.schedule(i * THINK_CHUNK_MS, () => stream.publish({ type: "reasoning", text: `${words.slice(i * size, (i + 1) * size).join(" ")} ` }));
        }
        break;
      }
      case "tool": {
        const callId = crypto.randomUUID();
        const raw = typeof step.result === "function" ? (step.result as () => unknown)() : step.result;
        stream.publish({ type: "tool", name: step.name });
        this.audit(id, "TOOL_CALLED", { name: step.name, callId, args: {}, activity: "investigate" });
        this.schedule(TOOL_RESULT_DELAY_MS, () => {
          stream.publish({ type: "tool_result", name: step.name, source: step.source, raw, ms: step.ms });
          this.audit(id, "TOOL_RESULT", { name: step.name, callId, source: step.source, raw, ms: step.ms, activity: "investigate" });
        });
        break;
      }
      case "propose": {
        stream.publish({ type: "proposal", rootCause: step.rootCause, action: step.action, degraded: false, confidence: step.confidence, toolCalls: step.toolCalls, reasoning: step.reasoning });
        this.audit(id, "AGENT_PROPOSED", {
          rootCause: step.rootCause,
          confidence: step.confidence,
          action: { kind: step.action },
          reasoning: step.reasoning,
          toolCalls: step.toolCalls,
          model: "recorded replay",
          latencyMs: 2140,
          activity: "propose",
        });
        break;
      }
      case "gate":
        this.audit(id, "GATE_APPLIED", {
          outcome: step.outcome,
          proposed: step.proposed,
          applied: step.applied,
          rule: step.rule ?? null,
          detail: step.detail ?? null,
          activity: "gate",
        });
        break;
      case "attempt":
        this.audit(id, "ATTEMPT_STARTED", { attemptNo: 1, action: { kind: step.action }, clamped: false, activity: "execute" });
        this.setAttempt(id, { attemptNo: 1, action: step.action, status: "PENDING", razorpayRef: step.ref });
        break;
      case "settle":
        this.settle(id, step.status, step.detail);
        break;
      case "resolve":
        this.resolve(id, step.lane);
        break;
    }
  }

  private settle(id: string, status: "RECOVERED" | "COMPLETED" | "FAILED", detail?: string): void {
    const kase = this.cases.get(id)!;
    const paise = status === "RECOVERED" ? kase.amountPaise : 0;
    this.setAttempt(id, { status, detail: detail ?? null, recoveredPaise: paise });
    this.audit(id, "ATTEMPT_OUTCOME", {
      attemptNo: this.attempts.get(id)?.at(-1)?.attemptNo ?? 1,
      status,
      detail: detail ?? null,
      recoveredPaise: paise,
      razorpayRef: this.attempts.get(id)?.at(-1)?.razorpayRef ?? null,
      activity: "execute",
    });
    if (paise > 0) {
      this.cases.set(id, { ...kase, recoveredPaise: paise });
      this.publishMetrics();
    }
  }

  private resolve(id: string, lane: Lane): void {
    this.audit(id, "CASE_RESOLVED", { lane, via: lane === "ESCALATED" ? "gate" : "executor", activity: "outcome" });
    this.moveLane(id, lane);
    this.channelFor(id).publish({ type: "done", lane, reason: "resolved" });
  }

  private moveLane(id: string, to: Lane): void {
    const kase = this.cases.get(id);
    if (!kase || kase.lane === to) return;
    this.audit(id, "CASE_LANE_CHANGED", { from: kase.lane, to });
    this.cases.set(id, { ...this.cases.get(id)!, lane: to });
    this.channelFor(id).publish({ type: "status", lane: to, active: !RESOLVED_LANES.includes(to) });
    this.publishMetrics();
  }

  private setAttempt(id: string, patch: Partial<Attempt>): void {
    const list = this.attempts.get(id) ?? [];
    const last = list.at(-1);
    if (patch.attemptNo !== undefined && last?.attemptNo !== patch.attemptNo) {
      list.push({
        id: crypto.randomUUID(),
        attemptNo: patch.attemptNo,
        action: patch.action ?? "RETRY_NOW",
        status: "PENDING",
        detail: null,
        recoveredPaise: 0,
        razorpayRef: patch.razorpayRef ?? null,
        idempotencyKey: `demo-${id}-${patch.attemptNo}`,
        settledPaymentId: null,
      });
    } else if (last) {
      Object.assign(last, patch);
    }
    this.attempts.set(id, list);
  }

  private audit(caseId: string, type: string, payload: Record<string, unknown>): void {
    const at = new Date().toISOString();
    const stored: StoredEvent = { id: String(++this.eventSeq), caseId, type, payload, createdAt: at };
    this.events.set(caseId, [...(this.events.get(caseId) ?? []), stored]);
    this.channelFor(caseId).publish({ type: "audit", eventType: type, payload, at });
    this.room.publish({ type: "audit", caseId, eventType: type, payload, at });
  }

  private history(amountPaise: number, method: string): RecoveryCase["customerHistory"] {
    return HISTORY_DAYS.map((days) => ({
      paidAt: new Date(Date.now() - days * 86_400_000).toISOString(),
      amountPaise,
      method,
      status: "captured",
    }));
  }

  private seedHistory(): void {
    const recovered = DEMO_SCENARIOS.find((s) => s.id === "bank_timeout")!;
    const past: Array<{ ref: string; amount: number; hoursAgo: number; steps: Step[]; method: "card" }> = [
      { ref: "customer_1014", amount: 79900, hoursAgo: 7, steps: recovered.steps, method: "card" },
      { ref: "customer_1003", amount: 249900, hoursAgo: 14, steps: recovered.steps, method: "card" },
      { ref: "customer_1011", amount: 149900, hoursAgo: 21, steps: recovered.steps, method: "card" },
      { ref: "customer_1019", amount: 49900, hoursAgo: 26, steps: WRITTEN_OFF_STEPS, method: "card" },
    ];
    for (const p of past) {
      const id = crypto.randomUUID();
      const startMs = Date.now() - p.hoursAgo * 3_600_000;
      const base: RecoveryCase = {
        id,
        merchantRef: "demo",
        customerRef: p.ref,
        amountPaise: p.amount,
        currency: "INR",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "card_declined",
        failedAt: new Date(startMs).toISOString(),
        method: p.method,
        instrument: { issuer: "HDFC" },
        customerHistory: this.history(p.amount, p.method),
        lane: "INCOMING",
        recoveredPaise: 0,
      };
      const done = materialize(base, p.steps, startMs, () => String(++this.eventSeq));
      this.cases.set(id, { ...base, lane: done.lane, recoveredPaise: done.recoveredPaise });
      this.events.set(id, done.events);
      this.attempts.set(id, done.attempts);
    }
  }
}
