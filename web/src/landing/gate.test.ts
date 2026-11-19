import { describe, expect, it } from "vitest";
import { evaluateGate, GATE_RULES } from "./gate";
import { GATE_SCENARIOS } from "./ledgerContent";

describe("landing gate demo", () => {
  it("matches the nine rules in the real gate", () => {
    expect(GATE_RULES.map((r) => r.id)).toEqual(["risk_hold", "write_off_unsupported", "hard_decline", "max_attempts", "contact_window", "contact_cooldown", "exposure_cap", "low_confidence", "cooldown"]);
  });

  it("gives every sample proposal the expected verdict", () => {
    expect(GATE_SCENARIOS.map((s) => evaluateGate(s.proposal).fired?.id ?? "allow")).toEqual(["allow", "cooldown", "allow", "contact_window", "risk_hold", "hard_decline", "low_confidence", "max_attempts"]);
  });
});
