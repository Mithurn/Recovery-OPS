import { describe, expect, it } from "vitest";
import { directedAction, directedProposal, pendingDirective, type HumanDirective } from "../src/worker/human-directive.js";
import type { EventLog } from "../src/domain/ports.js";
import type { StoredEvent } from "../src/domain/events.js";
import type { Attempt } from "../src/domain/attempt.js";

const directive: HumanDirective = {
  action: { kind: "PAYMENT_LINK", rail: "card" },
  approver: "asha@example.com",
  at: "2026-01-01T10:00:00.000Z",
  note: "customer asked for a link",
};

function stored(type: StoredEvent["type"], payload: unknown, createdAt: string): StoredEvent {
  return { id: `${type}-${createdAt}`, caseId: "c1", type, payload, createdAt } as StoredEvent;
}

function logOf(events: StoredEvent[]): EventLog {
  return { append: async () => undefined, forCase: async () => events };
}

function attemptAt(createdAt: string): Attempt {
  return { id: "a1", caseId: "c1", createdAt } as Attempt;
}

describe("directedProposal", () => {
  it("is full-confidence, tool-free and credits the approver and note", () => {
    const proposal = directedProposal(directive);
    expect(proposal).toMatchObject({
      action: directive.action,
      confidence: 1,
      toolCalls: 0,
      degraded: false,
      diagnosisRootCause: null,
    });
    expect(proposal.reasoning).toBe("Directed by asha@example.com on an escalated case: customer asked for a link");
  });

  it("ends the reasoning with a full stop when there is no note", () => {
    expect(directedProposal({ ...directive, note: null }).reasoning).toBe(
      "Directed by asha@example.com on an escalated case.",
    );
    expect(directedProposal({ ...directive, note: undefined }).reasoning).toMatch(/case\.$/);
  });
});

describe("pendingDirective", () => {
  it("returns null when the case has no directive events", async () => {
    expect(await pendingDirective(logOf([stored("CASE_CREATED", {}, "2026-01-01T09:00:00.000Z")]), "c1", [])).toBeNull();
  });

  it("returns the most recent directive when no attempt has acted on it", async () => {
    const older = { ...directive, approver: "older@example.com" };
    const result = await pendingDirective(
      logOf([
        stored("HUMAN_DIRECTIVE", older, "2026-01-01T09:00:00.000Z"),
        stored("HUMAN_DIRECTIVE", directive, "2026-01-01T10:00:00.000Z"),
      ]),
      "c1",
      [attemptAt("2026-01-01T08:00:00.000Z")],
    );
    expect(result).toEqual(directive);
  });

  it("returns null once a later attempt has already acted on the directive", async () => {
    const result = await pendingDirective(
      logOf([stored("HUMAN_DIRECTIVE", directive, "2026-01-01T10:00:00.000Z")]),
      "c1",
      [attemptAt("2026-01-01T10:00:01.000Z")],
    );
    expect(result).toBeNull();
  });

  it("ignores a malformed directive payload instead of throwing", async () => {
    const result = await pendingDirective(
      logOf([stored("HUMAN_DIRECTIVE", { action: { kind: "NOPE" }, approver: "" }, "2026-01-01T10:00:00.000Z")]),
      "c1",
      [],
    );
    expect(result).toBeNull();
  });
});

describe("directedAction", () => {
  it("maps approve to an immediate retry regardless of redirectTo", () => {
    expect(directedAction({ decision: "approve" })).toEqual({ kind: "RETRY_NOW" });
    expect(directedAction({ decision: "approve", redirectTo: "PAYMENT_LINK" })).toEqual({ kind: "RETRY_NOW" });
  });

  it("maps redirects to their targets with default rail and channel", () => {
    expect(directedAction({ decision: "redirect", redirectTo: "PAYMENT_LINK" })).toEqual({
      kind: "PAYMENT_LINK",
      rail: "card",
    });
    expect(directedAction({ decision: "redirect", redirectTo: "CUSTOMER_NUDGE" })).toEqual({
      kind: "CUSTOMER_NUDGE",
      channel: "email",
    });
    expect(directedAction({ decision: "redirect", redirectTo: "RETRY_NOW" })).toEqual({ kind: "RETRY_NOW" });
  });

  it("defaults a redirect or write-off with no target to a retry", () => {
    expect(directedAction({ decision: "redirect" })).toEqual({ kind: "RETRY_NOW" });
    expect(directedAction({ decision: "write_off" })).toEqual({ kind: "RETRY_NOW" });
  });
});
