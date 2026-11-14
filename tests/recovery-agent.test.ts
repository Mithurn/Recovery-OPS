import { describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { degrade, proposalInput, runRecoveryAgent, toAction } from "../src/agent/recovery-agent.js";
import { buildTools, type AgentDeps } from "../src/agent/tools.js";
import { recoveryAction } from "../src/domain/recovery-action.js";
import type { RecoveryCase } from "../src/domain/case.js";
import type { Downtime } from "../src/domain/gateway.js";

describe("agent proposal decoding", () => {
  it("degrades to a scheduled retry with no fabricated root cause", () => {
    const d = degrade("no proposal", 3);
    expect(d.degraded).toBe(true);
    expect(d.diagnosisRootCause).toBeNull();
    expect(d.action).toEqual({ kind: "RETRY_SCHEDULED", atHoursFromNow: 48 });
    expect(recoveryAction.parse(d.action)).toBeTruthy();
  });

  it("maps a well-formed scheduled retry", () => {
    const action = toAction(
      proposalInput.parse({
        rootCause: "soft_decline",
        confidence: 0.7,
        actionKind: "RETRY_SCHEDULED",
        retryDelayHours: 8,
        reasoning: "one clean retry in eight hours should clear a soft decline",
      }),
    );
    expect(action).toEqual({ kind: "RETRY_SCHEDULED", atHoursFromNow: 8 });
  });

  it("fills a sensible default when the model omits a required sub-field", () => {
    const action = toAction(
      proposalInput.parse({
        rootCause: "bank_downtime",
        confidence: 0.6,
        actionKind: "RETRY_SCHEDULED",
        reasoning: "the issuing bank is in a downtime window, retry once it clears",
      }),
    );
    expect(action).toEqual({ kind: "RETRY_SCHEDULED", atHoursFromNow: 48 });
  });

  it("rejects an out-of-range retry delay at the schema, before it can reach the executor", () => {
    expect(
      proposalInput.safeParse({
        rootCause: "soft_decline",
        confidence: 0.5,
        actionKind: "RETRY_SCHEDULED",
        retryDelayHours: 100_000,
        reasoning: "way too far in the future",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown root cause rather than coercing it", () => {
    expect(
      proposalInput.safeParse({
        rootCause: "vibes",
        confidence: 0.5,
        actionKind: "ESCALATE",
        reasoning: "not a real root cause",
      }).success,
    ).toBe(false);
  });

  it("gives escalate and write-off a reason even when the model leaves it blank", () => {
    const escalate = toAction(
      proposalInput.parse({
        rootCause: "risk_hold",
        confidence: 0.9,
        actionKind: "ESCALATE",
        reasoning: "payment is risk flagged, a human must review before any retry",
      }),
    );
    expect(escalate).toMatchObject({ kind: "ESCALATE" });
    expect((escalate as { reason: string }).reason.length).toBeGreaterThan(0);
  });
});

function fakeCase(over: Partial<RecoveryCase> = {}): RecoveryCase {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    runId: null,
    merchantRef: "m",
    customerRef: "c",
    originalPaymentId: null,
    amountPaise: 149900,
    currency: "INR",
    failureCode: "BAD_REQUEST_ERROR",
    failureReason: "card_declined",
    failedAt: "2026-09-01T10:00:00.000Z",
    method: "card",
    instrument: { issuer: "BKID" },
    customerHistory: [
      { paidAt: "2026-05-01T10:00:00.000Z", amountPaise: 149900, method: "card", status: "captured" },
      { paidAt: "2026-06-01T10:00:00.000Z", amountPaise: 149900, method: "card", status: "captured" },
      { paidAt: "2026-07-01T10:00:00.000Z", amountPaise: 149900, method: "card", status: "captured" },
    ],
    lane: "DIAGNOSING",
    recoveredPaise: 0,
    ...over,
  };
}

function deps(downtimes: Downtime[], over: Partial<AgentDeps> = {}): AgentDeps {
  return {
    kase: fakeCase(),
    method: "card",
    instrumentHint: "BKID",
    gateway: { listDowntimes: async () => downtimes },
    priorAttempts: [],
    similarCases: async () => [],
    clock: { now: () => new Date("2026-09-01T12:00:00.000Z") },
    ...over,
  };
}

const downtime = (over: Partial<Downtime>): Downtime => ({
  id: "down_1",
  method: "card",
  severity: "high",
  status: "started",
  instrument: { issuer: "BKID" },
  begin: "2026-09-01T11:00:00.000Z",
  end: null,
  ...over,
});

describe("investigation tools", () => {
  it("summarises the customer history a rule could not read", async () => {
    const tools = buildTools(deps([]));
    const out = (await tools.get_customer_payment_history.execute!({}, {} as never)) as Record<string, unknown>;
    expect(out.successfulPayments).toBe(3);
    expect(out.daysSinceLastSuccess).toBe(62);
    expect(out.medianDaysBetweenPayments).toBe(31);
  });

  it("matches a downtime on the issuing bank behind the card", async () => {
    const tools = buildTools(deps([downtime({ instrument: { issuer: "BKID" } })]));
    const out = (await tools.check_bank_downtime.execute!({}, {} as never)) as { matched: boolean };
    expect(out.matched).toBe(true);
  });

  it("does not match an unrelated bank's downtime on an unrelated method", async () => {
    const tools = buildTools(deps([downtime({ instrument: { issuer: "HDFC" }, method: "netbanking" })]));
    const out = (await tools.check_bank_downtime.execute!({}, {} as never)) as { matched: boolean };
    expect(out.matched).toBe(false);
  });

  // Regression: this used to match on method alone, so any card outage matched every card case.
  it("does not match a downtime on the same method when the issuer differs", async () => {
    const tools = buildTools(deps([downtime({ instrument: { issuer: "PUNB" }, method: "card" })], { instrumentHint: "HDFC" }));
    const out = (await tools.check_bank_downtime.execute!({}, {} as never)) as {
      matched: boolean;
      activeDowntimes: unknown[];
      methodWideOutages: unknown[];
    };
    expect(out.matched).toBe(false);
    expect(out.activeDowntimes).toHaveLength(0);
    expect(out.methodWideOutages).toHaveLength(1);
  });

  it("has no issuer to check against and so never matches on method alone", async () => {
    const tools = buildTools(
      deps([downtime({ instrument: { issuer: "BKID" }, method: "card" })], { instrumentHint: null }),
    );
    const out = (await tools.check_bank_downtime.execute!({}, {} as never)) as { matched: boolean };
    expect(out.matched).toBe(false);
  });

  it("ignores a resolved downtime", async () => {
    const tools = buildTools(deps([downtime({ status: "resolved" })]));
    const out = (await tools.check_bank_downtime.execute!({}, {} as never)) as { matched: boolean };
    expect(out.matched).toBe(false);
  });
});

describe("recovery playbook tool", () => {
  it("returns the merchant's default move for every root cause, as data the model must ask for", async () => {
    const tools = buildTools(deps([]));
    const out = (await tools.get_recovery_playbook.execute!({}, {} as never)) as {
      playbook: { rootCause: string; defaultAction: string }[];
    };
    const rootCauses = out.playbook.map((p) => p.rootCause).sort();
    expect(rootCauses).toEqual(
      ["bank_downtime", "hard_decline", "insufficient_funds", "risk_hold", "soft_decline", "technical", "unrecoverable"].sort(),
    );
    expect(out.playbook.find((p) => p.rootCause === "risk_hold")?.defaultAction).toBe("ESCALATE");
  });
});

const submitStream = (): LanguageModelV4StreamPart[] => [
  { type: "tool-call", toolCallId: "c1", toolName: "submit_proposal", input: JSON.stringify({
    rootCause: "soft_decline",
    confidence: 0.8,
    actionKind: "RETRY_SCHEDULED",
    retryDelayHours: 6,
    reasoning: "a soft decline usually clears on a single later retry",
  }) },
  { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    } },
];

const stubModel = (parts: LanguageModelV4StreamPart[] | Error) =>
  new MockLanguageModelV4({
    doStream: async () => {
      if (parts instanceof Error) throw parts;
      return { stream: simulateReadableStream({ chunks: parts }) };
    },
  });

describe("model fallback", () => {
  const config = { stepBudget: 3, deadlineMs: 5_000 };

  it("retries once on the fallback model when the primary fails with a provider error", async () => {
    const primary = stubModel(new Error("provider 503"));
    const fallback = stubModel(submitStream());
    const onModelFallback = vi.fn();
    const proposal = await runRecoveryAgent(deps([]), { ...config, model: primary, fallbackModel: fallback }, { onModelFallback });
    expect(proposal.degraded).toBe(false);
    expect(proposal.action).toEqual({ kind: "RETRY_SCHEDULED", atHoursFromNow: 6 });
    expect(onModelFallback).toHaveBeenCalledOnce();
    expect(fallback.doStreamCalls).toHaveLength(1);
  });

  it("degrades when there is no fallback model", async () => {
    const proposal = await runRecoveryAgent(deps([]), { ...config, model: stubModel(new Error("provider 503")) });
    expect(proposal.degraded).toBe(true);
  });

  it("degrades when the fallback also fails", async () => {
    const proposal = await runRecoveryAgent(deps([]), {
      ...config,
      model: stubModel(new Error("primary down")),
      fallbackModel: stubModel(new Error("fallback down")),
    });
    expect(proposal.degraded).toBe(true);
    expect(proposal.reasoning).toContain("fallback down");
  });

  it("does not call the fallback when the primary concludes", async () => {
    const fallback = stubModel(submitStream());
    const proposal = await runRecoveryAgent(deps([]), { ...config, model: stubModel(submitStream()), fallbackModel: fallback });
    expect(proposal.degraded).toBe(false);
    expect(fallback.doStreamCalls).toHaveLength(0);
  });
});
