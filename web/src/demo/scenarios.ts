import type { Lane, ToolSource } from "../types.js";

export type Step =
  | { at: number; do: "audit"; type: string; payload: Record<string, unknown> }
  | { at: number; do: "think"; text: string }
  | { at: number; do: "tool"; name: string; result: unknown | (() => unknown); source: ToolSource; ms: number }
  | { at: number; do: "lane"; to: Lane }
  | {
      at: number;
      do: "propose";
      rootCause: string;
      confidence: number;
      action: string;
      toolCalls: number;
      reasoning: string;
    }
  | { at: number; do: "gate"; outcome: "allow" | "clamp" | "skip"; proposed: string; applied: string; rule?: string; detail?: string }
  | { at: number; do: "attempt"; action: string; ref: string | null }
  | { at: number; do: "settle"; status: "RECOVERED" | "COMPLETED" | "FAILED"; detail?: string }
  | { at: number; do: "resolve"; lane: Lane };

export type DemoScenario = {
  id: string;
  label: string;
  amountPaise: number;
  method: "card" | "upi" | "netbanking";
  errorReason: string;
  issuer?: string;
  vpa?: string;
  steps: Step[];
};

const TOOL_GAP = 1100;

const history = (ok: number, total: number, since: number) => ({
  totalPayments: total,
  successfulPayments: ok,
  failedPayments: total - ok,
  daysSinceLastSuccess: since,
  medianDaysBetweenPayments: 30,
});

const playbook = (rootCause: string, defaultAction: string) => ({ playbook: [{ rootCause, defaultAction }] });

const similar = (failureReason: string, action: string, outcome: string, hours: number | null) => ({
  failureReason,
  cases: [
    { action, outcome, hoursToResolution: hours },
    { action, outcome, hoursToResolution: hours === null ? null : hours + 0.6 },
    { action, outcome, hoursToResolution: hours === null ? null : hours + 1.1 },
  ],
});

function investigation(startAt: number, tools: Array<{ name: string; result: unknown | (() => unknown); source: ToolSource; ms: number }>): Step[] {
  return [
    { at: startAt, do: "lane", to: "DIAGNOSING" },
    { at: startAt + 100, do: "audit", type: "INVESTIGATION_STARTED", payload: { attemptNo: 1, activity: "investigate" } },
    ...tools.map((t, i): Step => ({ at: startAt + 700 + i * TOOL_GAP, do: "tool", ...t })),
  ];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "bank_timeout",
    label: "Bank timeout",
    amountPaise: 129900,
    method: "card",
    errorReason: "card_declined",
    issuer: "HDFC",
    steps: [
      ...investigation(900, [
        { name: "get_customer_payment_history", result: history(6, 6, 29), source: "local", ms: 14 },
        { name: "check_bank_downtime", source: "razorpay-live", ms: 212, result: () => ({
          matched: true,
          method: "card",
          activeDowntimes: [{ id: "down_hdfc_1", method: "card", severity: "high", instrument: { issuer: "HDFC" }, startedAt: new Date(Date.now() - 35 * 60_000).toISOString() }],
          methodWideOutages: [],
        }) },
        { name: "get_similar_resolved_cases", result: similar("card_declined", "PAYMENT_LINK", "RECOVERED", 1.2), source: "local", ms: 31 },
        { name: "get_recovery_playbook", result: playbook("bank_downtime", "PAYMENT_LINK"), source: "local", ms: 9 },
      ]),
      { at: 6000, do: "think", text: "Six clean payments out of six, and HDFC is inside a live downtime window. This is the bank, not the customer." },
      {
        at: 6900,
        do: "propose",
        rootCause: "bank_downtime",
        confidence: 0.88,
        action: "PAYMENT_LINK",
        toolCalls: 4,
        reasoning: "Reliable payer, issuer downtime matches, and similar cases recovered through a payment link within about an hour. A retry now would hit the same outage.",
      },
      { at: 7400, do: "lane", to: "DECIDING" },
      { at: 7600, do: "gate", outcome: "allow", proposed: "PAYMENT_LINK", applied: "PAYMENT_LINK" },
      { at: 8600, do: "lane", to: "ATTEMPTING" },
      { at: 8700, do: "attempt", action: "PAYMENT_LINK", ref: "plink_demo_hdfc01" },
      { at: 13500, do: "settle", status: "RECOVERED" },
      { at: 13800, do: "resolve", lane: "RECOVERED" },
    ],
  },
  {
    id: "low_balance",
    label: "Insufficient funds",
    amountPaise: 49900,
    method: "upi",
    errorReason: "insufficient_funds",
    vpa: "customer@okaxis",
    steps: [
      ...investigation(900, [
        { name: "get_customer_payment_history", result: history(5, 6, 33), source: "local", ms: 12 },
        { name: "get_similar_resolved_cases", result: similar("insufficient_funds", "RETRY_SCHEDULED", "RECOVERED", 28), source: "local", ms: 27 },
        { name: "get_recovery_playbook", result: playbook("insufficient_funds", "RETRY_SCHEDULED"), source: "local", ms: 8 },
      ]),
      { at: 5000, do: "think", text: "Salary-cycle payer who is a few days late. Funds usually land within a day or two, so waiting beats chasing." },
      {
        at: 5800,
        do: "propose",
        rootCause: "insufficient_funds",
        confidence: 0.76,
        action: "RETRY_SCHEDULED",
        toolCalls: 3,
        reasoning: "Similar cases cleared on a scheduled retry after roughly a day. Contacting the customer now adds friction without improving the odds.",
      },
      { at: 6300, do: "lane", to: "DECIDING" },
      { at: 6500, do: "gate", outcome: "allow", proposed: "RETRY_SCHEDULED", applied: "RETRY_SCHEDULED" },
      { at: 7500, do: "lane", to: "ATTEMPTING" },
      { at: 7600, do: "attempt", action: "RETRY_SCHEDULED", ref: null },
      { at: 8600, do: "settle", status: "COMPLETED", detail: "retry scheduled for tomorrow 10:00 IST" },
      { at: 8900, do: "lane", to: "RETRY_SCHEDULED" },
    ],
  },
  {
    id: "expired_card",
    label: "Expired card",
    amountPaise: 89900,
    method: "card",
    errorReason: "card_expired",
    issuer: "ICIC",
    steps: [
      ...investigation(900, [
        { name: "get_customer_payment_history", result: history(4, 4, 30), source: "local", ms: 11 },
        { name: "get_this_case_prior_attempts", result: { attempts: [] }, source: "local", ms: 6 },
        { name: "get_recovery_playbook", result: playbook("hard_decline", "CUSTOMER_NUDGE"), source: "local", ms: 9 },
      ]),
      { at: 5000, do: "think", text: "An expired card will never succeed on retry. The only way back is the customer updating it." },
      {
        at: 5800,
        do: "propose",
        rootCause: "hard_decline",
        confidence: 0.93,
        action: "CUSTOMER_NUDGE",
        toolCalls: 3,
        reasoning: "Expired card is a permanent decline. Retrying would only add decline fees, so the customer is asked to update their payment method.",
      },
      { at: 6300, do: "lane", to: "DECIDING" },
      { at: 6500, do: "gate", outcome: "allow", proposed: "CUSTOMER_NUDGE", applied: "CUSTOMER_NUDGE" },
      { at: 7500, do: "lane", to: "ATTEMPTING" },
      { at: 7600, do: "audit", type: "NUDGE_QUEUED", payload: { channel: "email", messageRef: "msg_demo_0192", delivered: false, detail: "no delivery provider is configured in this build", activity: "execute" } },
      { at: 8400, do: "attempt", action: "CUSTOMER_NUDGE", ref: null },
      { at: 9200, do: "settle", status: "COMPLETED", detail: "email queued asking the customer to update their card" },
      { at: 9500, do: "lane", to: "RETRY_SCHEDULED" },
    ],
  },
  {
    id: "risk_hold",
    label: "Risk hold",
    amountPaise: 499900,
    method: "card",
    errorReason: "payment_risk_check_failed",
    issuer: "SBIN",
    steps: [
      ...investigation(900, [
        { name: "get_customer_payment_history", result: history(2, 3, 6), source: "local", ms: 13 },
        { name: "get_similar_resolved_cases", result: similar("payment_risk_check_failed", "ESCALATE", "ESCALATED", null), source: "local", ms: 29 },
      ]),
      { at: 4300, do: "think", text: "A risk check failed on a large charge. I think a quick retry would work, but this is not mine to push through." },
      {
        at: 5100,
        do: "propose",
        rootCause: "risk_hold",
        confidence: 0.66,
        action: "RETRY_NOW",
        toolCalls: 2,
        reasoning: "The history looks mostly fine, so a retry might clear, but the failure reason is a risk check and the amount is high.",
      },
      { at: 5600, do: "lane", to: "DECIDING" },
      {
        at: 5800,
        do: "gate",
        outcome: "clamp",
        proposed: "RETRY_NOW",
        applied: "ESCALATE",
        rule: "risk_hold",
        detail: "the original payment carries a risk hold",
      },
      { at: 6800, do: "resolve", lane: "ESCALATED" },
    ],
  },
];

export const WRITTEN_OFF_STEPS: Step[] = [
  ...investigation(900, [
    { name: "get_customer_payment_history", result: history(1, 3, 120), source: "local", ms: 12 },
    { name: "get_recovery_playbook", result: playbook("soft_decline", "RETRY_NOW"), source: "local", ms: 8 },
  ]),
  { at: 3800, do: "propose", rootCause: "soft_decline", confidence: 0.71, action: "RETRY_NOW", toolCalls: 2, reasoning: "A single retry is the lowest friction option for a soft decline." },
  { at: 4300, do: "lane", to: "DECIDING" },
  { at: 4500, do: "gate", outcome: "allow", proposed: "RETRY_NOW", applied: "RETRY_NOW" },
  { at: 5300, do: "lane", to: "ATTEMPTING" },
  { at: 5400, do: "attempt", action: "RETRY_NOW", ref: "order_demo_wo01" },
  { at: 7400, do: "settle", status: "FAILED", detail: "the bank declined the retry" },
  { at: 7700, do: "resolve", lane: "WRITTEN_OFF" },
];
