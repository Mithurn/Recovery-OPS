import { describe, expect, it, vi } from "vitest";
import type { RecoveryCase } from "../types.js";
import { suggest, type CommandContext } from "./commands";

const kase = (id: string, lane: RecoveryCase["lane"]): RecoveryCase => ({
  id,
  merchantRef: "m",
  customerRef: `cust_${id}`,
  amountPaise: 49900,
  currency: "INR",
  failureCode: "X",
  failureReason: "insufficient_funds",
  failedAt: "2026-01-01T00:00:00.000Z",
  method: "upi",
  instrument: null,
  customerHistory: [],
  lane,
  recoveredPaise: 0,
});

const ctx = (): CommandContext => ({
  scenarios: [
    { id: "bank_timeout", label: "Bank timeout", amountPaise: 129900, method: "card", errorReason: "card_declined" },
    { id: "risk_hold", label: "Risk hold", amountPaise: 499900, method: "card", errorReason: "payment_risk_check_failed" },
  ],
  cases: [kase("1", "RETRY_SCHEDULED"), kase("2", "RECOVERED")],
  simulate: vi.fn(),
  retry: vi.fn(),
  open: vi.fn(),
  stop: vi.fn(),
  resume: vi.fn(),
});

describe("suggest", () => {
  it("lists every command for an empty or slash-only input, and nothing for plain text", () => {
    expect(suggest("", ctx()).map((s) => s.label)).toEqual(["/simulate", "/retry", "/open", "/stop", "/resume"]);
    expect(suggest("/", ctx())).toHaveLength(5);
    expect(suggest("hello", ctx())).toEqual([]);
  });

  it("completes a partial verb by filling it in, and runs stop directly", () => {
    const [sim] = suggest("/sim", ctx());
    expect(sim).toMatchObject({ label: "/simulate", fill: "/simulate " });
    const c = ctx();
    void suggest("/st", c)[0]!.run!();
    expect(c.stop).toHaveBeenCalled();
  });

  it("filters scenarios and runs the chosen one", () => {
    const c = ctx();
    const found = suggest("/simulate risk", c);
    expect(found.map((s) => s.label)).toEqual(["Risk hold"]);
    void found[0]!.run!();
    expect(c.simulate).toHaveBeenCalledWith("risk_hold");
  });

  it("offers only retryable cases for /retry but any case for /open", () => {
    const c = ctx();
    expect(suggest("/retry ", c)).toHaveLength(1);
    expect(suggest("/open ", c)).toHaveLength(2);
    void suggest("/retry @customer_1", c)[0]!.run!();
    expect(c.retry).toHaveBeenCalledWith("1");
  });
});
