import type { AttemptRepository, EventLog } from "../domain/ports.js";
import type { PaymentGateway } from "../domain/gateway.js";
import { isSimulatedRazorpayRef } from "../domain/simulated-payment.js";

export const LINK_CANCELLED_DETAIL = "payment link cancelled when the case was closed";
const PAYMENT_LINK_ACTION = "PAYMENT_LINK";

export class OutstandingPaymentCloser {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly events: EventLog,
    private readonly gateway: PaymentGateway,
  ) {}

  async close(caseId: string, reason: string): Promise<void> {
    const attempts = await this.attempts.listByCase(caseId);
    for (const attempt of attempts) {
      const ref = attempt.razorpayRef;
      if (!ref || isSimulatedRazorpayRef(ref)) continue;
      if (attempt.status !== "PENDING" && attempt.status !== "AWAITING_RECONCILIATION") continue;

      if (attempt.action === PAYMENT_LINK_ACTION && this.gateway.cancelPaymentLink) {
        try {
          await this.gateway.cancelPaymentLink(ref);
          await this.attempts.resolve(attempt.id, { status: "FAILED", detail: LINK_CANCELLED_DETAIL });
          await this.record(caseId, { attemptNo: attempt.attemptNo, razorpayRef: ref, outstanding: "link_cancelled", reason });
        } catch (err) {
          await this.record(caseId, {
            attemptNo: attempt.attemptNo,
            razorpayRef: ref,
            outstanding: "link_cancel_failed",
            reason,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }

      await this.record(caseId, { attemptNo: attempt.attemptNo, razorpayRef: ref, outstanding: "still_payable", reason });
    }
  }

  private record(caseId: string, payload: Record<string, unknown>): Promise<void> {
    return this.events.append({ caseId, type: "ATTEMPT_OUTCOME", payload: { ...payload, activity: "execute" } });
  }
}
