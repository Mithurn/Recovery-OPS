import type { OutcomeResolver, OutcomeVerdict } from "../domain/ports.js";
import type { RecoveryAction } from "../domain/recovery-action.js";
import type { PaymentGateway } from "../domain/gateway.js";

export class RazorpayOutcomeResolver implements OutcomeResolver {
  constructor(private readonly gateway: PaymentGateway) {}

  async resolve(input: {
    caseId: string;
    action: RecoveryAction;
    razorpayRef: string | null;
    amountPaise: number;
  }): Promise<OutcomeVerdict> {
    if (input.action.kind === "CUSTOMER_NUDGE") return { kind: "pending" };
    if (!input.razorpayRef) return { kind: "pending" };

    const payments =
      input.action.kind === "PAYMENT_LINK"
        ? ((await this.gateway.getPaymentLink(input.razorpayRef))?.payments ?? [])
        : await this.gateway.listOrderPayments(input.razorpayRef);

    const captures = payments.filter((p) => p.status === "captured" && p.capturedPaise > 0);
    const exact = captures.find((p) => p.capturedPaise === input.amountPaise);
    if (exact) return { kind: "recovered", capturedPaise: exact.capturedPaise, paymentId: exact.id };
    const offAmount = captures[0];
    if (offAmount) {
      return {
        kind: "mismatch",
        capturedPaise: offAmount.capturedPaise,
        expectedPaise: input.amountPaise,
        paymentId: offAmount.id,
      };
    }

    const failed = payments.find((p) => p.status === "failed");
    if (failed && payments.every((p) => p.status === "failed")) {
      return { kind: "failed", detail: failed.errorReason ?? "payment failed" };
    }

    return { kind: "pending" };
  }
}
