import type { CustomerPayment, RecoveryCase } from "../src/domain/case.js";
import { RISK_CHECK_FAILURE_REASON } from "../src/domain/case.js";
import type { Downtime } from "../src/domain/gateway.js";
import type { RootCause } from "../src/domain/failure.js";
import {
  CADENCE_DAYS,
  CADENCE_JITTER_DAYS,
  CAUSE_PROFILES,
  CAUSE_WEIGHTS,
  CLEAN_HISTORY_PAYMENTS,
  CORPUS_EPOCH_MS,
  DOWNTIME_DISTRACTOR_SHARE,
  DOWNTIME_END_KNOWN_SHARE,
  FAILED_AT_SPREAD_HOURS,
  FUNDS_DAYS_SINCE_SUCCESS,
  FUNDS_HISTORY_FAILURES,
  FUNDS_HISTORY_PAYMENTS,
  FUNDS_READY_JITTER_HOURS,
  HOURS_PER_DAY,
  INSTRUMENTS,
  LARGE_AMOUNT_RANGE_PAISE,
  LARGE_AMOUNT_SHARE,
  MERCHANT_REF,
  METHOD_WEIGHTS,
  MS_PER_HOUR,
  SMALL_AMOUNT_RANGE_PAISE,
  UNRECOVERABLE_HISTORY_FAILURES,
  UNRECOVERABLE_HISTORY_SUCCESSES,
} from "./config.js";
import { createRng, mixSeed, type Rng } from "./rng.js";

export type PaymentRail = "card" | "netbanking";
export type NudgeChannel = "email" | "sms";

export type GroundTruth = {
  rootCause: RootCause;
  retry: { readyAfterHours: number; windowHours: number } | null;
  linkRecovers: Record<PaymentRail, boolean>;
  nudgeRecovers: Record<NudgeChannel, boolean>;
  humanRecovers: boolean;
};

export type BenchCase = {
  kase: RecoveryCase;
  method: string;
  instrumentHint: string | null;
  downtimes: Downtime[];
  truth: GroundTruth;
};

const hex = (rng: Rng, digits: number) =>
  Array.from({ length: digits }, () => rng.int(0, 15).toString(16)).join("");

function caseId(rng: Rng): string {
  return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${(8 + rng.int(0, 3)).toString(16)}${hex(rng, 3)}-${hex(rng, 12)}`;
}

function failureFor(cause: RootCause, rng: Rng): { code: string; reason: string } {
  switch (cause) {
    case "hard_decline":
      return { code: "BAD_REQUEST_ERROR", reason: "card_expired" };
    case "risk_hold":
      return { code: "BAD_REQUEST_ERROR", reason: RISK_CHECK_FAILURE_REASON };
    case "technical":
      return { code: "GATEWAY_ERROR", reason: "gateway_error" };
    case "insufficient_funds":
      return { code: "BAD_REQUEST_ERROR", reason: rng.pick(["payment_failed", "insufficient_funds"]) };
    case "soft_decline":
      return { code: "BAD_REQUEST_ERROR", reason: rng.pick(["payment_failed", "card_declined"]) };
    case "bank_downtime":
      return { code: "BAD_REQUEST_ERROR", reason: "payment_failed" };
    case "unrecoverable":
      return { code: "BAD_REQUEST_ERROR", reason: "card_declined" };
  }
}

type HistoryPlan = { captured: number; failed: number; daysSinceLastSuccess: number };

function planHistory(cause: RootCause, rng: Rng): HistoryPlan {
  if (cause === "insufficient_funds") {
    return {
      captured: rng.int(...FUNDS_HISTORY_PAYMENTS),
      failed: rng.int(...FUNDS_HISTORY_FAILURES),
      daysSinceLastSuccess: rng.int(...FUNDS_DAYS_SINCE_SUCCESS),
    };
  }
  if (cause === "unrecoverable") {
    return {
      captured: rng.int(...UNRECOVERABLE_HISTORY_SUCCESSES),
      failed: rng.int(...UNRECOVERABLE_HISTORY_FAILURES),
      daysSinceLastSuccess: rng.int(1, CADENCE_DAYS),
    };
  }
  return {
    captured: rng.int(...CLEAN_HISTORY_PAYMENTS),
    failed: 0,
    daysSinceLastSuccess: rng.int(1, CADENCE_DAYS),
  };
}

function buildHistory(plan: HistoryPlan, method: string, amountPaise: number, failedAtMs: number, rng: Rng): CustomerPayment[] {
  const day = HOURS_PER_DAY * MS_PER_HOUR;
  const payments: CustomerPayment[] = [];
  let at = failedAtMs - plan.daysSinceLastSuccess * day;
  for (let i = 0; i < plan.captured; i++) {
    payments.unshift({ paidAt: new Date(at).toISOString(), amountPaise, method, status: "captured" });
    at -= (CADENCE_DAYS + rng.int(-CADENCE_JITTER_DAYS, CADENCE_JITTER_DAYS)) * day;
  }
  for (let i = 0; i < plan.failed; i++) {
    const failedPaidAt = failedAtMs - (plan.daysSinceLastSuccess + (i + 1) * CADENCE_DAYS - CADENCE_DAYS / 2) * day;
    payments.push({ paidAt: new Date(failedPaidAt).toISOString(), amountPaise, method, status: "failed" });
  }
  return payments.sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt));
}

function buildTruth(cause: RootCause, plan: HistoryPlan, clearsAfterHours: number, rng: Rng): GroundTruth {
  const profile = CAUSE_PROFILES[cause];
  let retry: GroundTruth["retry"] = null;
  if (profile.retry) {
    let readyAfterHours: number;
    if (cause === "insufficient_funds") {
      const remainingDays = Math.max(0, CADENCE_DAYS - plan.daysSinceLastSuccess);
      readyAfterHours = remainingDays * HOURS_PER_DAY + rng.int(0, FUNDS_READY_JITTER_HOURS);
    } else if (cause === "bank_downtime") {
      readyAfterHours = clearsAfterHours;
    } else {
      readyAfterHours = rng.chance(profile.retry.immediateShare) ? 0 : rng.int(...profile.retry.readyHours);
    }
    retry = { readyAfterHours, windowHours: profile.retry.windowHours };
  }
  return {
    rootCause: cause,
    retry,
    linkRecovers: { card: rng.chance(profile.linkRecovers.card), netbanking: rng.chance(profile.linkRecovers.netbanking) },
    nudgeRecovers: { email: rng.chance(profile.nudgeRecovers.email), sms: rng.chance(profile.nudgeRecovers.sms) },
    humanRecovers: rng.chance(profile.humanRecovers),
  };
}

function buildDowntimes(
  cause: RootCause,
  method: string,
  instrumentValue: string,
  failedAtMs: number,
  clearsAfterHours: number,
  rng: Rng,
): Downtime[] {
  const instrumentKey = INSTRUMENTS[method]!.key;
  const downtimes: Downtime[] = [];
  if (cause === "bank_downtime") {
    const endKnown = rng.chance(DOWNTIME_END_KNOWN_SHARE);
    downtimes.push({
      id: `dt_${rng.int(100000, 999999)}`,
      method,
      severity: "high",
      status: "started",
      instrument: { [instrumentKey]: instrumentValue },
      begin: new Date(failedAtMs - MS_PER_HOUR).toISOString(),
      end: endKnown ? new Date(failedAtMs + clearsAfterHours * MS_PER_HOUR).toISOString() : null,
    });
  }
  if (rng.chance(DOWNTIME_DISTRACTOR_SHARE)) {
    const other = INSTRUMENTS[method]!.values.filter((v) => v !== instrumentValue);
    downtimes.push({
      id: `dt_${rng.int(100000, 999999)}`,
      method,
      severity: "medium",
      status: "started",
      instrument: { [instrumentKey]: rng.pick(other) },
      begin: new Date(failedAtMs - MS_PER_HOUR).toISOString(),
      end: null,
    });
  }
  return downtimes;
}

export function generateCase(seed: number, index: number): BenchCase {
  const rng = createRng(mixSeed(seed, index));
  const id = caseId(rng);
  const cause = rng.weighted(CAUSE_WEIGHTS);
  const method = rng.weighted(METHOD_WEIGHTS);
  const instrumentValue = rng.pick(INSTRUMENTS[method]!.values);
  const large = rng.chance(LARGE_AMOUNT_SHARE);
  const amountPaise = rng.int(...(large ? LARGE_AMOUNT_RANGE_PAISE : SMALL_AMOUNT_RANGE_PAISE));
  const failedAtMs = CORPUS_EPOCH_MS + rng.int(0, FAILED_AT_SPREAD_HOURS * 60) * 60_000;
  const failure = failureFor(cause, rng);
  const plan = planHistory(cause, rng);
  const clearsAfterHours = rng.int(...CAUSE_PROFILES.bank_downtime.retry!.readyHours);
  const history = buildHistory(plan, method, amountPaise, failedAtMs, rng);

  const kase: RecoveryCase = {
    id,
    runId: null,
    merchantRef: MERCHANT_REF,
    customerRef: `cust_${seed}_${index}`,
    originalPaymentId: `pay_${id.slice(0, 8)}`,
    amountPaise,
    currency: "INR",
    failureCode: failure.code,
    failureReason: failure.reason,
    failedAt: new Date(failedAtMs).toISOString(),
    method,
    instrument: { [INSTRUMENTS[method]!.key]: instrumentValue },
    customerHistory: history,
    lane: "INCOMING",
    recoveredPaise: 0,
  };

  return {
    kase,
    method,
    instrumentHint: instrumentValue,
    downtimes: buildDowntimes(cause, method, instrumentValue, failedAtMs, clearsAfterHours, rng),
    truth: buildTruth(cause, plan, clearsAfterHours, rng),
  };
}

export function generateCorpus(seed: number, count: number): BenchCase[] {
  return Array.from({ length: count }, (_, i) => generateCase(seed, i));
}
