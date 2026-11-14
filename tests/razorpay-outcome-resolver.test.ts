import { describe, expect, it } from "vitest";
import { RazorpayOutcomeResolver } from "../src/execution/razorpay-outcome-resolver.js";
import type { GatewayPayment, PaymentGateway } from "../src/domain/gateway.js";

const payment = (over: Partial<GatewayPayment>): GatewayPayment => ({
  id: "pay_1",
  orderId: "order_1",
  amountPaise: 5000,
  capturedPaise: 5000,
  status: "captured",
  method: "card",
  errorReason: null,
  ...over,
});

const resolverWith = (payments: GatewayPayment[]) =>
  new RazorpayOutcomeResolver({ listOrderPayments: async () => payments } as unknown as PaymentGateway);

const input = { caseId: "c1", action: { kind: "RETRY_NOW" as const }, razorpayRef: "order_1", amountPaise: 5000 };

describe("razorpay outcome resolver", () => {
  it("recovers an exact-amount capture", async () => {
    expect(await resolverWith([payment({})]).resolve(input)).toEqual({
      kind: "recovered",
      capturedPaise: 5000,
      paymentId: "pay_1",
    });
  });

  it("flags a capture whose amount differs instead of recovering it", async () => {
    const verdict = await resolverWith([payment({ capturedPaise: 100 })]).resolve(input);
    expect(verdict).toEqual({ kind: "mismatch", capturedPaise: 100, expectedPaise: 5000, paymentId: "pay_1" });
  });

  it("prefers the exact-amount capture when several exist", async () => {
    const verdict = await resolverWith([payment({ id: "pay_a", capturedPaise: 100 }), payment({ id: "pay_b" })]).resolve(input);
    expect(verdict).toMatchObject({ kind: "recovered", paymentId: "pay_b" });
  });
});
