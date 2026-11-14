import type { AgentProposal, RecoveryAction } from "../src/domain/recovery-action.js";
import { isHardDecline, isRiskHold } from "../src/domain/case.js";
import { buildGateContext } from "../src/worker/gate-context.js";
import {
  DEFAULT_LIMITS,
  msUntilContactWindowOpens,
  safetyGate,
  type GuardrailRule,
  type SafetyLimits,
} from "../src/safety/safety-gate.js";
import { DECISION_ATTEMPT_NO, MS_PER_HOUR } from "./config.js";
import type { BenchCase, GroundTruth } from "./corpus.js";

export type Outcome = {
  recovered: boolean;
  proposed: RecoveryAction;
  final: RecoveryAction | null;
  gate: "allow" | "clamp" | "skip";
  rule: GuardrailRule | null;
  delayHours: number | null;
};

export function recoversUnder(truth: GroundTruth, action: RecoveryAction, delayHours: number): boolean {
  switch (action.kind) {
    case "RETRY_NOW":
    case "RETRY_SCHEDULED": {
      if (!truth.retry) return false;
      const { readyAfterHours, windowHours } = truth.retry;
      return delayHours >= readyAfterHours && delayHours <= readyAfterHours + windowHours;
    }
    case "PAYMENT_LINK":
      return truth.linkRecovers[action.rail];
    case "CUSTOMER_NUDGE":
      return truth.nudgeRecovers[action.channel];
    case "ESCALATE":
      return truth.humanRecovers;
    case "WRITE_OFF":
      return false;
  }
}

function delayOf(action: RecoveryAction): number {
  return action.kind === "RETRY_SCHEDULED" ? action.atHoursFromNow : 0;
}

export function simulate(c: BenchCase, proposal: AgentProposal, limits: SafetyLimits = DEFAULT_LIMITS): Outcome {
  const clock = { now: () => new Date(c.kase.failedAt) };
  const ctx = buildGateContext(c.kase, proposal, [], DECISION_ATTEMPT_NO, null, clock, isRiskHold, isHardDecline);
  const result = safetyGate(proposal.action, ctx, limits);

  if (result.outcome === "skip") {
    if (result.rule !== "contact_window") {
      return { recovered: false, proposed: proposal.action, final: null, gate: "skip", rule: result.rule, delayHours: null };
    }
    const delayHours = msUntilContactWindowOpens(ctx.now) / MS_PER_HOUR;
    return {
      recovered: recoversUnder(c.truth, proposal.action, delayHours),
      proposed: proposal.action,
      final: proposal.action,
      gate: "skip",
      rule: result.rule,
      delayHours,
    };
  }

  const delayHours = delayOf(result.action);
  return {
    recovered: recoversUnder(c.truth, result.action, delayHours),
    proposed: proposal.action,
    final: result.action,
    gate: result.outcome,
    rule: result.outcome === "clamp" ? result.rule : null,
    delayHours,
  };
}
