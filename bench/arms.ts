import type { AgentProposal, RecoveryAction } from "../src/domain/recovery-action.js";
import type { RootCause } from "../src/domain/failure.js";
import { RISK_CHECK_FAILURE_REASON } from "../src/domain/case.js";
import { FIXED_SCHEDULE_HOURS, RULES, THIN_HISTORY_MAX_SUCCESSES, FAILING_HISTORY_MIN_FAILURES } from "./config.js";
import type { BenchCase } from "./corpus.js";
import { observe } from "./signals.js";
import { simulate, type Outcome } from "./simulator.js";

export type Proposer = (c: BenchCase) => AgentProposal;

export type ArmResult = { outcomes: Outcome[]; diagnoses: (RootCause | null)[] };

const NON_AGENT_CONFIDENCE = 1;

function proposal(action: RecoveryAction, rootCause: RootCause | null, reasoning: string): AgentProposal {
  return { action, diagnosisRootCause: rootCause, confidence: NON_AGENT_CONFIDENCE, reasoning, toolCalls: 0, degraded: false };
}

export const fixedSchedule: Proposer = () =>
  proposal({ kind: "RETRY_SCHEDULED", atHoursFromNow: FIXED_SCHEDULE_HOURS }, null, "fixed schedule retry");

export const rulesTable: Proposer = (c) => {
  const s = observe(c);
  if (s.failureReason === RISK_CHECK_FAILURE_REASON) {
    return proposal({ kind: "ESCALATE", reason: "risk check failed" }, "risk_hold", "rule: risk check");
  }
  if (s.failureReason === "card_expired") {
    return proposal({ kind: "CUSTOMER_NUDGE", channel: "email" }, "hard_decline", "rule: expired card");
  }
  if (s.downtimeMatched) {
    return proposal({ kind: "RETRY_SCHEDULED", atHoursFromNow: RULES.downtimeRetryHours }, "bank_downtime", "rule: bank downtime");
  }
  if (s.successful <= THIN_HISTORY_MAX_SUCCESSES || s.failed >= FAILING_HISTORY_MIN_FAILURES) {
    return proposal({ kind: "ESCALATE", reason: "thin or failing history" }, "unrecoverable", "rule: thin history");
  }
  if (s.failed >= 1 || s.failureReason === "insufficient_funds") {
    return proposal({ kind: "RETRY_SCHEDULED", atHoursFromNow: RULES.fundsRetryHours }, "insufficient_funds", "rule: prior failures");
  }
  if (RULES.technicalFailureReasons.includes(s.failureReason)) {
    return proposal({ kind: "RETRY_NOW" }, "technical", "rule: technical failure");
  }
  return proposal({ kind: "RETRY_SCHEDULED", atHoursFromNow: RULES.defaultRetryHours }, "soft_decline", "rule: default");
};

export function runArm(cases: BenchCase[], propose: Proposer): ArmResult {
  const outcomes: Outcome[] = [];
  const diagnoses: (RootCause | null)[] = [];
  for (const c of cases) {
    const p = propose(c);
    diagnoses.push(p.diagnosisRootCause);
    outcomes.push(simulate(c, p));
  }
  return { outcomes, diagnoses };
}
