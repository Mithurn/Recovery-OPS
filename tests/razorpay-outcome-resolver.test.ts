import { describe, expect, it, vi } from "vitest";
import { RazorpayOutcomeResolver } from "../src/execution/razorpay-outcome-resolver.js";
import type { GatewayPayment, PaymentGateway } from "../src/domain/gateway.js";

function payment(overrides: Partial<GatewayPayment>): GatewayPayment {
  return {
    id: "pay_1",
    orderId: "order_1",
    amountPaise: 10_000,
    capturedPaise: 0,
    status: "created",
    method: "card",
    errorReason: null,
    ...overrides,
  };
}

function resolverWith(gateway: Partial<PaymentGateway>) {
  return new RazorpayOutcomeResolver(gateway as PaymentGateway);
}

const base = { caseId: "c1", amountPaise: 10_000 };

describe("RazorpayOutcomeResolver", () => {
  it("stays pending for a nudge without touching the gateway", async () => {
    const listOrderPayments = vi.fn();
    const verdict = await resolverWith({ listOrderPayments }).resolve({
      ...base,
      action: { kind: "CUSTOMER_NUDGE", channel: "email" },
      razorpayRef: "order_1",
    });
    expect(verdict).toEqual({ kind: "pending" });
    expect(listOrderPayments).not.toHaveBeenCalled();
  });

  it("stays pending when there is no gateway reference yet", async () => {
    const listOrderPayments = vi.fn();
    const verdict = await resolverWith({ listOrderPayments }).resolve({
      ...base,
      action: { kind: "RETRY_NOW" },
      razorpayRef: null,
    });
    expect(verdict).toEqual({ kind: "pending" });
    expect(listOrderPayments).not.toHaveBeenCalled();
  });

  it("reports recovered with the captured amount for a captured order payment", async () => {
    const verdict = await resolverWith({
      listOrderPayments: async () => [
        payment({ id: "pay_f", status: "failed" }),
        payment({ id: "pay_ok", status: "captured", capturedPaise: 10_000 }),
      ],
    }).resolve({ ...base, action: { kind: "RETRY_NOW" }, razorpayRef: "order_1" });
    expect(verdict).toEqual({ kind: "recovered", capturedPaise: 10_000, paymentId: "pay_ok" });
  });

  it("does not treat a 'captured' payment with zero captured paise as recovered", async () => {
    const verdict = await resolverWith({
      listOrderPayments: async () => [payment({ status: "captured", capturedPaise: 0 })],
    }).resolve({ ...base, action: { kind: "RETRY_NOW" }, razorpayRef: "order_1" });
    expect(verdict).toEqual({ kind: "pending" });
  });

  it("reports failed with the gateway's reason only when every payment failed", async () => {
    const verdict = await resolverWith({
      listOrderPayments: async () => [payment({ status: "failed", errorReason: "card declined" })],
    }).resolve({ ...base, action: { kind: "RETRY_NOW" }, razorpayRef: "order_1" });
    expect(verdict).toEqual({ kind: "failed", detail: "card declined" });
  });

  it("falls back to a generic failure detail when the gateway gave no reason", async () => {
    const verdict = await resolverWith({
      listOrderPayments: async () => [payment({ status: "failed" })],
    }).resolve({ ...base, action: { kind: "RETRY_SCHEDULED", atHoursFromNow: 24 }, razorpayRef: "order_1" });
    expect(verdict).toEqual({ kind: "failed", detail: "payment failed" });
  });

  it("stays pending when a failure sits beside a still-open payment", async () => {
    const verdict = await resolverWith({
      listOrderPayments: async () => [payment({ status: "failed" }), payment({ id: "pay_2", status: "authorized" })],
    }).resolve({ ...base, action: { kind: "RETRY_NOW" }, razorpayRef: "order_1" });
    expect(verdict).toEqual({ kind: "pending" });
  });

  it("stays pending when the order has no payments", async () => {
    const verdict = await resolverWith({ listOrderPayments: async () => [] }).resolve({
      ...base,
      action: { kind: "RETRY_NOW" },
      razorpayRef: "order_1",
    });
    expect(verdict).toEqual({ kind: "pending" });
  });

  it("reads payment links through getPaymentLink and handles a missing link", async () => {
    const getPaymentLink = vi
      .fn()
      .mockResolvedValueOnce({
        id: "plink_1",
        url: "https://rzp.io/x",
        amountPaise: 10_000,
        payments: [payment({ id: "pay_l", status: "captured", capturedPaise: 10_000 })],
      })
      .mockResolvedValueOnce(null);
    const resolver = resolverWith({ getPaymentLink });
    const action = { kind: "PAYMENT_LINK", rail: "card" } as const;

    expect(await resolver.resolve({ ...base, action, razorpayRef: "plink_1" })).toEqual({
      kind: "recovered",
      capturedPaise: 10_000,
      paymentId: "pay_l",
    });
    expect(await resolver.resolve({ ...base, action, razorpayRef: "plink_gone" })).toEqual({ kind: "pending" });
    expect(getPaymentLink).toHaveBeenCalledWith("plink_1");
  });
});
