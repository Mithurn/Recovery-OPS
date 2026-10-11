import type { Attempt, Lane, RecoveryCase, StoredEvent } from "../types.js";
import type { Step } from "./scenarios.js";

const TOOL_RESULT_DELAY_MS = 420;

export type Materialized = { events: StoredEvent[]; attempts: Attempt[]; lane: Lane; recoveredPaise: number };

export function materialize(kase: RecoveryCase, steps: Step[], startMs: number, nextId: () => string): Materialized {
  const events: StoredEvent[] = [];
  const attempts: Attempt[] = [];
  let lane: Lane = "INCOMING";
  let recoveredPaise = 0;

  const push = (offset: number, type: string, payload: Record<string, unknown>) =>
    events.push({ id: nextId(), caseId: kase.id, type, payload, createdAt: new Date(startMs + offset).toISOString() });
  const move = (offset: number, to: Lane) => {
    if (to === lane) return;
    push(offset, "CASE_LANE_CHANGED", { from: lane, to });
    lane = to;
  };

  push(0, "CASE_CREATED", { failureReason: kase.failureReason, amountPaise: kase.amountPaise, merchantRef: "demo" });

  for (const step of steps) {
    switch (step.do) {
      case "audit":
        push(step.at, step.type, step.payload);
        break;
      case "lane":
        move(step.at, step.to);
        break;
      case "tool": {
        const callId = `${kase.id}-${step.at}`;
        const raw = typeof step.result === "function" ? (step.result as () => unknown)() : step.result;
        push(step.at, "TOOL_CALLED", { name: step.name, callId, args: {}, activity: "investigate" });
        push(step.at + TOOL_RESULT_DELAY_MS, "TOOL_RESULT", { name: step.name, callId, source: step.source, raw, ms: step.ms, activity: "investigate" });
        break;
      }
      case "propose":
        push(step.at, "AGENT_PROPOSED", {
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
      case "gate":
        push(step.at, "GATE_APPLIED", {
          outcome: step.outcome,
          proposed: step.proposed,
          applied: step.applied,
          rule: step.rule ?? null,
          detail: step.detail ?? null,
          activity: "gate",
        });
        break;
      case "attempt":
        push(step.at, "ATTEMPT_STARTED", { attemptNo: 1, action: { kind: step.action }, clamped: false, activity: "execute" });
        attempts.push({
          id: `${kase.id}-a1`,
          attemptNo: 1,
          action: step.action,
          status: "PENDING",
          detail: null,
          recoveredPaise: 0,
          razorpayRef: step.ref,
          idempotencyKey: `demo-${kase.id}-1`,
          settledPaymentId: null,
        });
        break;
      case "settle": {
        const paise = step.status === "RECOVERED" ? kase.amountPaise : 0;
        const last = attempts.at(-1);
        if (last) Object.assign(last, { status: step.status, detail: step.detail ?? null, recoveredPaise: paise });
        recoveredPaise += paise;
        push(step.at, "ATTEMPT_OUTCOME", {
          attemptNo: 1,
          status: step.status,
          detail: step.detail ?? null,
          recoveredPaise: paise,
          razorpayRef: last?.razorpayRef ?? null,
          activity: "execute",
        });
        break;
      }
      case "resolve":
        push(step.at, "CASE_RESOLVED", { lane: step.lane, via: step.lane === "ESCALATED" ? "gate" : "executor", activity: "outcome" });
        move(step.at, step.lane);
        break;
    }
  }
  return { events, attempts, lane, recoveredPaise };
}
