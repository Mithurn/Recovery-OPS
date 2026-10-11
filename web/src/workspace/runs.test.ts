import { describe, expect, it } from "vitest";
import type { RecoveryCase } from "../types.js";
import type { FeedEntry } from "./feed";
import { buildRuns } from "./runs";

const kase = (id: string, lane: RecoveryCase["lane"]): RecoveryCase => ({
  id,
  merchantRef: "m",
  customerRef: `customer_${id}`,
  amountPaise: 129900,
  currency: "INR",
  failureCode: "X",
  failureReason: "card_declined",
  failedAt: "2026-01-01T00:00:00.000Z",
  method: "card",
  instrument: null,
  customerHistory: [],
  lane,
  recoveredPaise: 0,
});
const entry = (id: number, caseId: string | undefined, at: number): FeedEntry => ({ id, caseId, at, agent: "intake", tone: "info", fn: "step", detail: "" });

describe("buildRuns", () => {
  it("groups feed entries per case, orders steps by time and runs by recency", () => {
    const runs = buildRuns([entry(3, "b", 300), entry(2, "a", 200), entry(1, "a", 100)], [kase("a", "RECOVERED"), kase("b", "DIAGNOSING")]);
    expect(runs.map((r) => r.caseId)).toEqual(["b", "a"]);
    expect(runs[1]!.steps.map((s) => s.id)).toEqual([1, 2]);
    expect(runs.map((r) => r.status)).toEqual(["running", "done"]);
  });

  it("ignores entries without a known case", () => {
    expect(buildRuns([entry(1, undefined, 1), entry(2, "ghost", 2)], [kase("a", "RECOVERED")])).toEqual([]);
  });

  it("maps an escalated case to needs attention", () => {
    expect(buildRuns([entry(1, "a", 1)], [kase("a", "ESCALATED")])[0]!.status).toBe("attention");
  });
});
