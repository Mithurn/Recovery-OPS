import type { RecoveryAction } from "./recovery-action.js";
import type { RootCause } from "./failure.js";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export type AttemptStatus =
  | "PENDING"
  | "RECOVERED"
  | "FAILED"
  | "SKIPPED"
  | "AWAITING_RECONCILIATION"
  | "COMPLETED";

export type AttemptRequest = {
  caseId: string;
  attemptNo: number;
  /** null when the investigation never reached a diagnosis — a degraded loop records no cause. */
  rootCause: RootCause | null;
  action: RecoveryAction;
  reasoning: string;
  amountPaise: number;
  currency: string;
  scheduledFor: string | null;
  clamp: { reason: string } | null;
  /** The clock the caller is operating on — real wall time live, a simulated clock in bench. */
  createdAt: string;
};

export type Attempt = {
  id: string;
  caseId: string;
  attemptNo: number;
  rootCause: RootCause | null;
  action: RecoveryAction["kind"];
  reasoning: string | null;
  idempotencyKey: string;
  razorpayRef: string | null;
  settledPaymentId: string | null;
  status: AttemptStatus;
  detail: string | null;
  clamped: boolean;
  clampReason: string | null;
  recoveredPaise: number;
  createdAt: string;
};

/** One attempt = one idempotency key. Stable across worker retries so a crash never doubles up. */
export function idempotencyKeyFor(caseId: string, attemptNo: number): string {
  return `${caseId}:${attemptNo}`;
}

const AMOUNT_MISMATCH_PREFIX = "capture amount mismatch";

export function amountMismatchDetail(capturedPaise: number, expectedPaise: number): string {
  return `${AMOUNT_MISMATCH_PREFIX}: captured ${capturedPaise}, expected ${expectedPaise}`;
}

export function isAmountMismatch(attempt: Pick<Attempt, "status" | "detail">): boolean {
  return attempt.status === "AWAITING_RECONCILIATION" && (attempt.detail?.startsWith(AMOUNT_MISMATCH_PREFIX) ?? false);
}
