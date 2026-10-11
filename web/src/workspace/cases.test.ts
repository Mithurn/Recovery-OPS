import { describe, expect, it } from "vitest";
import type { RecoveryCase } from "../types.js";
import { casePriority, countByStatus, filterCases, NO_FILTERS, recoveryByReason, timeAgo } from "./cases";

const base: RecoveryCase = {
  id: "1",
  merchantRef: "m",
  customerRef: "customer_1",
  amountPaise: 100_000,
  currency: "INR",
  failureCode: "X",
  failureReason: "card_declined",
  failedAt: "2026-01-01T00:00:00.000Z",
  method: "card",
  instrument: { issuer: "HDFC" },
  customerHistory: [],
  lane: "DIAGNOSING",
  recoveredPaise: 0,
};
const make = (patch: Partial<RecoveryCase>): RecoveryCase => ({ ...base, ...patch });

describe("casePriority", () => {
  it("puts anything awaiting a human first", () => {
    expect(casePriority(make({ lane: "ESCALATED", amountPaise: 100 }))).toBe("High");
  });
  it("marks large open exposure high, other open work medium, closed low", () => {
    expect(casePriority(make({ amountPaise: 450_000 }))).toBe("High");
    expect(casePriority(make({}))).toBe("Medium");
    expect(casePriority(make({ lane: "RECOVERED" }))).toBe("Low");
    expect(casePriority(make({ lane: "RETRY_SCHEDULED" }))).toBe("Medium");
  });
});

describe("filterCases", () => {
  const cases = [
    make({ id: "a", customerRef: "alice@x.com", lane: "RECOVERED" }),
    make({ id: "b", failureReason: "insufficient_funds", method: "upi", instrument: { vpa_handle: "b@okaxis" } }),
    make({ id: "c", lane: "ESCALATED", instrument: { issuer: "SBIN" } }),
  ];
  it("combines status, reason, bank and text filters", () => {
    expect(filterCases(cases, { ...NO_FILTERS, status: "Recovered" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterCases(cases, { ...NO_FILTERS, reason: "insufficient_funds" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterCases(cases, { ...NO_FILTERS, bank: "SBIN" }).map((c) => c.id)).toEqual(["c"]);
    expect(filterCases(cases, { ...NO_FILTERS, query: "insufficient funds" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterCases(cases, { ...NO_FILTERS, priority: "High" }).map((c) => c.id)).toEqual(["c"]);
  });
  it("counts cases per status group", () => {
    expect(countByStatus(cases)).toMatchObject({ Recovered: 1, "Needs you": 1, "In progress": 1 });
  });
});

describe("timeAgo", () => {
  it("scales from minutes to days", () => {
    const now = Date.parse("2026-01-02T00:00:00.000Z");
    expect(timeAgo("2026-01-01T23:58:00.000Z", now)).toBe("2m");
    expect(timeAgo("2026-01-01T20:00:00.000Z", now)).toBe("4h");
    expect(timeAgo("2025-12-30T00:00:00.000Z", now)).toBe("3d");
  });
});

describe("recoveryByReason", () => {
  it("reports the recovered share per failure reason, most common first", () => {
    const rows = recoveryByReason([
      make({ id: "1", lane: "RECOVERED" }),
      make({ id: "2", lane: "ESCALATED" }),
      make({ id: "3", failureReason: "card_expired", lane: "RECOVERED" }),
    ]);
    expect(rows.map((r) => r.reason)).toEqual(["card_declined", "card_expired"]);
    expect(rows[0]).toMatchObject({ total: 2, recovered: 1, rate: 0.5 });
    expect(rows[1]!.rate).toBe(1);
  });
});
