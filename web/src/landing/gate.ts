export const GATE_LIMITS = {
  maxAttempts: 4,
  maxExposure: 5000,
  minConfidence: 0.6,
  cooldownHours: 6,
  contactCooldownHours: 24,
  windowStartHour: 8,
  windowEndHour: 19,
} as const;

export const DEFAULT_CASE_HOUR = 11;

export type ActionKind = "RETRY" | "LINK" | "NUDGE" | "WRITE_OFF";
export type Outcome = "allow" | "clamp" | "skip";

export type Proposal = {
  kind: ActionKind;
  amount: number;
  confidence: number;
  attempt: number;
  sinceAttempt?: number;
  sinceContact?: number;
  hour?: number;
  risk?: boolean;
  hardDecline?: boolean;
};

export type GateRule = {
  id: string;
  outcome: Exclude<Outcome, "allow">;
  fires: (p: Proposal) => boolean;
  why: string;
};

const MONEY_KINDS: ActionKind[] = ["RETRY", "LINK"];
const isMoney = (p: Proposal) => MONEY_KINDS.includes(p.kind);

export const GATE_RULES: GateRule[] = [
  { id: "risk_hold", outcome: "clamp", fires: (p) => !!p.risk, why: "The original payment carries a risk hold. Sent to a human." },
  { id: "write_off_unsupported", outcome: "clamp", fires: (p) => p.kind === "WRITE_OFF" && !p.hardDecline, why: "A write-off needs a hard-decline signal or human sign-off." },
  { id: "hard_decline", outcome: "clamp", fires: (p) => !!p.hardDecline && p.kind === "RETRY", why: "The card itself declined. Retrying the same instrument is not allowed." },
  { id: "max_attempts", outcome: "clamp", fires: (p) => p.attempt > GATE_LIMITS.maxAttempts, why: `Attempt number is over the cap of ${GATE_LIMITS.maxAttempts}.` },
  {
    id: "contact_window",
    outcome: "skip",
    fires: (p) => p.kind === "NUDGE" && ((p.hour ?? DEFAULT_CASE_HOUR) < GATE_LIMITS.windowStartHour || (p.hour ?? DEFAULT_CASE_HOUR) >= GATE_LIMITS.windowEndHour),
    why: "Outside the 08:00 to 19:00 IST contact window. Rescheduled.",
  },
  {
    id: "contact_cooldown",
    outcome: "skip",
    fires: (p) => p.kind === "NUDGE" && p.sinceContact != null && p.sinceContact < GATE_LIMITS.contactCooldownHours,
    why: "Customer was contacted too recently. Rescheduled.",
  },
  { id: "exposure_cap", outcome: "clamp", fires: (p) => isMoney(p) && p.amount > GATE_LIMITS.maxExposure, why: "Amount is above the 5,000 INR auto-recovery cap. Sent to a human." },
  { id: "low_confidence", outcome: "clamp", fires: (p) => isMoney(p) && p.confidence < GATE_LIMITS.minConfidence, why: "Confidence is below the 0.6 floor. Sent to a human." },
  { id: "cooldown", outcome: "skip", fires: (p) => isMoney(p) && p.sinceAttempt != null && p.sinceAttempt < GATE_LIMITS.cooldownHours, why: "Too soon after the last attempt. Rescheduled." },
];

export type RuleStatus = "clear" | "clamp" | "skip" | "idle";

export type GateResult = {
  statuses: RuleStatus[];
  outcome: Outcome;
  fired: GateRule | null;
};

export function evaluateGate(proposal: Proposal, rules: GateRule[] = GATE_RULES): GateResult {
  let fired: GateRule | null = null;
  const statuses = rules.map((rule): RuleStatus => {
    if (fired) return "idle";
    if (!rule.fires(proposal)) return "clear";
    fired = rule;
    return rule.outcome;
  });
  return { statuses, outcome: fired ? (fired as GateRule).outcome : "allow", fired };
}
