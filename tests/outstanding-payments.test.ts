import { describe, expect, it, vi } from "vitest";
import { OutstandingPaymentCloser } from "../src/execution/outstanding-payments.js";
import type { AttemptRepository, EventLog } from "../src/domain/ports.js";
import type { Attempt } from "../src/domain/attempt.js";
import type { PaymentGateway } from "../src/domain/gateway.js";

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: "a1",
  caseId: "c1",
  attemptNo: 1,
  rootCause: null,
  action: "PAYMENT_LINK",
  reasoning: null,
  idempotencyKey: "c1:1",
  razorpayRef: "plink_1",
  settledPaymentId: null,
  status: "PENDING",
  detail: null,
  clamped: false,
  clampReason: null,
  recoveredPaise: 0,
  createdAt: new Date().toISOString(),
  ...over,
});

const setup = (attempts: Attempt[], gateway: Partial<PaymentGateway>) => {
  const resolve = vi.fn(async () => undefined);
  const append = vi.fn(async () => undefined);
  const closer = new OutstandingPaymentCloser(
    { listByCase: async () => attempts, resolve } as unknown as AttemptRepository,
    { append } as unknown as EventLog,
    gateway as PaymentGateway,
  );
  return { closer, resolve, append };
};

describe("outstanding payment closer", () => {
  it("cancels a pending payment link and fails the attempt", async () => {
    const cancelPaymentLink = vi.fn(async () => undefined);
    const { closer, resolve } = setup([attempt({})], { cancelPaymentLink });
    await closer.close("c1", "STOPPED");
    expect(cancelPaymentLink).toHaveBeenCalledWith("plink_1");
    expect(resolve).toHaveBeenCalledWith("a1", expect.objectContaining({ status: "FAILED" }));
  });

  it("keeps the attempt pending and records the error when cancel is rejected", async () => {
    const cancelPaymentLink = vi.fn(async () => {
      throw new Error("already paid");
    });
    const { closer, resolve, append } = setup([attempt({})], { cancelPaymentLink });
    await closer.close("c1", "STOPPED");
    expect(resolve).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ outstanding: "link_cancel_failed" }) }),
    );
  });

  it("records that an order stays payable", async () => {
    const { closer, resolve, append } = setup([attempt({ action: "RETRY_NOW", razorpayRef: "order_1" })], {});
    await closer.close("c1", "WRITTEN_OFF");
    expect(resolve).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ outstanding: "still_payable" }) }),
    );
  });

  it("ignores settled attempts", async () => {
    const { closer, append } = setup([attempt({ status: "FAILED" })], {});
    await closer.close("c1", "STOPPED");
    expect(append).not.toHaveBeenCalled();
  });
});
