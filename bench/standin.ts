import type { AgentProposal, RecoveryAction } from "../src/domain/recovery-action.js";
import type { RootCause } from "../src/domain/failure.js";
import { RISK_CHECK_FAILURE_REASON } from "../src/domain/case.js";
import { FAILING_HISTORY_MIN_FAILURES, HOURS_PER_DAY, RULES, STANDIN, THIN_HISTORY_MAX_SUCCESSES } from "./config.js";
import type { BenchCase } from "./corpus.js";
import { createRng, hashString, mixSeed } from "./rng.js";
import { observe, type Signals } from "./signals.js";

const CONFUSABLE: Record<RootCause, RootCause[]> = {
  soft_decline: ["insufficient_funds", "technical"],
  insufficient_funds: ["soft_decline", "unrecoverable"],
  bank_downtime: ["technical", "soft_decline"],
  technical: ["soft_decline", "bank_downtime"],
  hard_decline: ["insufficient_funds", "soft_decline"],
  risk_hold: ["soft_decline", "technical"],
  unrecoverable: ["insufficient_funds", "soft_decline"],
};

function diagnose(s: Signals): RootCause {
  if (s.failureReason === RISK_CHECK_FAILURE_REASON) return "risk_hold";
  if (s.failureReason === "card_expired") return "hard_decline";
  if (s.downtimeMatched) return "bank_downtime";
  if (s.successful <= THIN_HISTORY_MAX_SUCCESSES || s.failed >= FAILING_HISTORY_MIN_FAILURES) return "unrecoverable";
  if (s.failed >= 1 || s.failureReason === "insufficient_funds") return "insufficient_funds";
  if (RULES.technicalFailureReasons.includes(s.failureReason)) return "technical";
  return "soft_decline";
}

function actionFor(cause: RootCause, s: Signals): RecoveryAction {
  switch (cause) {
    case "risk_hold":
      return { kind: "ESCALATE", reason: "risk hold on the original payment" };
    case "hard_decline":
      return { kind: "CUSTOMER_NUDGE", channel: "email" };
    case "unrecoverable":
      return { kind: "WRITE_OFF", reason: "thin or failing payment history" };
    case "technical":
      return { kind: "RETRY_NOW" };
    case "soft_decline":
      return { kind: "RETRY_SCHEDULED", atHoursFromNow: STANDIN.softRetryHours };
    case "bank_downtime":
      return {
        kind: "RETRY_SCHEDULED",
        atHoursFromNow: Math.ceil(s.hoursToDowntimeEnd ?? STANDIN.downtimeUnknownEndHours) + STANDIN.retryPaddingHours,
      };
    case "insufficient_funds": {
      const remainingDays = Math.max(0, (s.medianGapDays ?? 0) - (s.daysSinceLastSuccess ?? 0));
      return {
        kind: "RETRY_SCHEDULED",
        atHoursFromNow: Math.max(1, remainingDays * HOURS_PER_DAY + STANDIN.retryPaddingHours),
      };
    }
  }
}

export function scriptedStandIn(c: BenchCase, seed: number): AgentProposal {
  const s = observe(c);
  const rng = createRng(mixSeed(seed, hashString(c.kase.id), STANDIN.salt));
  const observed = diagnose(s);
  const misdiagnosed = rng.chance(STANDIN.misdiagnosisRate);
  const cause = misdiagnosed ? rng.pick(CONFUSABLE[observed]) : observed;
  const [lo, hi] = misdiagnosed ? STANDIN.doubtfulRange : STANDIN.confidentRange;
  return {
    action: actionFor(cause, s),
    diagnosisRootCause: cause,
    confidence: Math.round(rng.range(lo, hi) * 100) / 100,
    reasoning: `Scripted stand-in, not an LLM: history shows ${s.successful} successful and ${s.failed} failed payments, downtime matched ${s.downtimeMatched}, reason ${s.failureReason}; read as ${cause}.`,
    toolCalls: 0,
    degraded: false,
  };
}
