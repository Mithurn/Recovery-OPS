import { describe, expect, it } from "vitest";
import { reconstructAction } from "../src/execution/action-codec.js";
import { recoveryAction, type RecoveryAction } from "../src/domain/recovery-action.js";

const KINDS: RecoveryAction["kind"][] = [
  "RETRY_NOW",
  "RETRY_SCHEDULED",
  "PAYMENT_LINK",
  "CUSTOMER_NUDGE",
  "ESCALATE",
  "WRITE_OFF",
];

describe("reconstructAction", () => {
  it.each(KINDS)("rebuilds a schema-valid %s action with the same kind", (kind) => {
    const action = reconstructAction(kind);
    expect(action.kind).toBe(kind);
    expect(recoveryAction.safeParse(action).success).toBe(true);
  });

  it("fills the documented defaults for kinds that carry extra fields", () => {
    expect(reconstructAction("RETRY_SCHEDULED")).toEqual({ kind: "RETRY_SCHEDULED", atHoursFromNow: 48 });
    expect(reconstructAction("PAYMENT_LINK")).toEqual({ kind: "PAYMENT_LINK", rail: "card" });
    expect(reconstructAction("CUSTOMER_NUDGE")).toEqual({ kind: "CUSTOMER_NUDGE", channel: "email" });
    expect(reconstructAction("ESCALATE")).toEqual({ kind: "ESCALATE", reason: "reconcile" });
    expect(reconstructAction("WRITE_OFF")).toEqual({ kind: "WRITE_OFF", reason: "reconcile" });
  });
});
