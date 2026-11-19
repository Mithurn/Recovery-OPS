import type { Outcome, Proposal } from "./gate";

export const GITHUB_URL = "https://github.com/Mithurn/Recovery-OPS";

export const NAV_LINKS = [
  { href: "#case", label: "The case" },
  { href: "#gate", label: "Safety gate" },
  { href: "#audit", label: "Audit log" },
  { href: "#hood", label: "Under the hood" },
];

export const FACTS = [
  { value: "5", label: "agents" },
  { value: "9", label: "hard limits" },
  { value: "1", label: "Razorpay call per attempt" },
  { value: "0", label: "edits to the audit trail" },
];

export type Tone = "ink" | "blue" | "green" | "amber" | "red";

export const RECEIPT = {
  amount: "₹2,499.00",
  sub: "card · case_SAMPLE_0412 · payment.failed",
  status: "FAILED → RECOVERED",
  foot: "Illustrative sample, not a real payment.",
  steps: [
    { who: "1 Intake", out: "Webhook verified, deduped by event id", stamp: "Logged", tone: "ink" },
    { who: "2 Investigator", out: "Cause: issuer timeout. Proposes RETRY", stamp: "Proposed", tone: "blue" },
    { who: "3 Safety gate", out: "9 rules checked, none fired", stamp: "Allow", tone: "green" },
    { who: "4 Executor", out: "1 call, idempotency key set", stamp: "Settled", tone: "green" },
    { who: "5 Audit log", out: "Rows appended, never edited", stamp: "Filed", tone: "ink" },
  ] as { who: string; out: string; stamp: string; tone: Tone }[],
};

export const TIMELINE = [
  { name: "Intake", tag: "verify", tone: "ink", text: "Takes the Razorpay webhook, checks the HMAC-SHA256 signature and drops duplicates by event id. Opens the case." },
  {
    name: "Investigator",
    tag: "LLM with tools",
    tone: "blue",
    text: "Gathers evidence through four tools, names a root cause and proposes one recovery action.",
    calls: ["get customer payment history", "check live bank downtime", "find similar resolved cases", "read merchant playbook"],
  },
  {
    name: "Safety gate",
    tag: "9 rules in code",
    tone: "amber",
    text: "Pure policy, no model in the loop. Whatever the gate returns is what runs.",
    branches: [
      { label: "ALLOW → Executor", tone: "green" },
      { label: "CLAMP → human review", tone: "amber" },
      { label: "SKIP → reschedule", tone: "red" },
    ],
  },
  { name: "Executor", tag: "idempotent", tone: "green", text: "Makes at most one Razorpay call per attempt, keyed by an idempotency key derived from the case id and attempt number." },
  { name: "Audit log", tag: "insert only", tone: "ink", text: "Every event from every agent is appended. The app role has no right to change a row once written." },
] as {
  name: string;
  tag: string;
  tone: Tone;
  text: string;
  calls?: string[];
  branches?: { label: string; tone: Tone }[];
}[];

export const GATE_SCENARIOS: { title: string; detail: string; proposal: Proposal }[] = [
  { title: "Retry now", detail: "Last attempt 9h ago, attempt 2", proposal: { kind: "RETRY", amount: 1299, confidence: 0.82, attempt: 2, sinceAttempt: 9 } },
  { title: "Retry 4 hours after the last attempt", detail: "Last attempt 4h ago, attempt 2", proposal: { kind: "RETRY", amount: 1299, confidence: 0.8, attempt: 2, sinceAttempt: 4 } },
  { title: "Offer a payment link", detail: "First attempt, confidence 0.74", proposal: { kind: "LINK", amount: 2400, confidence: 0.74, attempt: 1 } },
  { title: "Nudge the customer at 22:40 IST", detail: "Customer message, late evening", proposal: { kind: "NUDGE", amount: 899, confidence: 0.7, attempt: 1, hour: 22.67, sinceContact: 72 } },
  { title: "Large retry on a high-risk customer", detail: "Risk hold, over the exposure cap too", proposal: { kind: "RETRY", amount: 18500, confidence: 0.9, attempt: 1, risk: true } },
  { title: "Retry a card the bank hard-declined", detail: "Decline came from the card itself", proposal: { kind: "RETRY", amount: 1999, confidence: 0.85, attempt: 1, hardDecline: true } },
  { title: "Retry with low confidence", detail: "Investigator unsure, 0.41", proposal: { kind: "RETRY", amount: 1499, confidence: 0.41, attempt: 1 } },
  { title: "Fifth attempt", detail: "Cap is 4 attempts", proposal: { kind: "RETRY", amount: 999, confidence: 0.8, attempt: 5, sinceAttempt: 30 } },
];

export const VERDICTS: Record<Outcome, { label: string; text: string }> = {
  allow: { label: "Allow", text: "Goes to the Executor. One Razorpay call, keyed." },
  clamp: { label: "Clamp", text: "Becomes an escalation. A person reviews it in Needs you." },
  skip: { label: "Skip", text: "Not run now. The case is rescheduled." },
};

export const RULE_STATUS_LABEL = { clear: "clear", clamp: "clamp", skip: "skip", idle: "not reached" } as const;

export const GATE_NOTE_LIMITS =
  "Defaults from the architecture doc: 4 attempts, 5,000 INR exposure cap, 0.6 confidence floor, 6 hour attempt cooldown, 24 hour contact cooldown, contact window 08:00 to 19:00 IST (modelled on the RBI Fair Practices Code).";

export const AUDIT_ROWS = [
  ["1", "Intake", "payment.failed", "case_SAMPLE_0412, ₹2,499.00"],
  ["2", "Investigator", "tool_call", "get customer payment history"],
  ["3", "Investigator", "tool_call", "check live bank downtime"],
  ["4", "Investigator", "propose", "retry now, confidence 0.82"],
  ["5", "Safety gate", "gate_allow", "no rule fired"],
  ["6", "Executor", "attempt", "1 Razorpay call, keyed"],
  ["7", "Audit log", "case_closed", "recovered"],
];

export const AUDIT_IDLE_TEXT = "Press a button to try to change the log.";
const PERMISSION_DENIED = "permission denied for table recovery_events";

export const SQL_ATTEMPTS = [
  { key: "UPDATE", query: "UPDATE recovery_events SET detail = 'edited' WHERE id = 4;", error: PERMISSION_DENIED },
  { key: "DELETE", query: "DELETE FROM recovery_events WHERE id = 4;", error: PERMISSION_DENIED },
  { key: "INSERT", query: "INSERT INTO recovery_events (case_id, agent, event) VALUES ('case_SAMPLE_0412', 'audit', 'note');", ok: "INSERT 0 1" },
] as { key: string; query: string; error?: string; ok?: string }[];

export const PRODUCT_PAGES = [
  { title: "Agent workspace", text: "The live floor, a command bar (/simulate, /retry, /open, /stop) and a run log of every tool call." },
  { title: "Cases", text: "A filterable table by status, reason, method, bank and derived priority." },
  { title: "Needs you", text: "Cases the gate escalated, with approve, payment link, nudge or write off." },
  { title: "Settings", text: "Razorpay test keys, webhook URL and account." },
];

export const SHOTS = {
  main: { src: "/shots/workspace.jpg", chrome: "recovery-opsagents.vercel.app/demo", alt: "Recovery OPS agent workspace: five agents at desks, with an activity panel listing each tool call and the gate verdict for a case" },
  minis: [
    { src: "/shots/case.jpg", chrome: "Cases", alt: "Recovery OPS case view showing a single case story", caption: "Case story, every step in order." },
    { src: "/shots/needs.jpg", chrome: "Needs you", alt: "Recovery OPS needs-you queue listing cases the gate escalated", caption: "The queue of cases the gate handed to a person." },
  ],
  width: 1500,
  height: 693,
};

export const HOOD_ITEMS = [
  { title: "Idempotent attempts", text: "Each attempt derives a key from case id and attempt number.", code: "idempotency_key", rest: " is UNIQUE, so a retried job reuses the attempt." },
  { title: "Encrypted at rest", text: "Razorpay key and webhook secrets are sealed with AES-256-GCM and never returned to the browser." },
  { title: "Test keys only", text: "Live keys are rejected. No live money path has been exercised." },
  { title: "Signed webhooks", text: "HMAC-SHA256 signature with a timing-safe compare, deduplicated by event id." },
  { title: "One container", text: "A single container serves the API and the built web app, with Postgres and Redis behind it." },
  { title: "Hashed sign-in", text: "Emailed 6 digit codes and session tokens are stored hashed. Code requests are rate limited per IP." },
] as { title: string; text: string; code?: string; rest?: string }[];

export const NOT_CLAIMED = [
  "Tenant isolation lives in application queries. It is not Postgres row-level security.",
  "The audit log has no hash chain, so it does not protect against a database admin.",
  "Single container, no high availability. The demo backend is stopped when idle.",
  "The repo's benchmark is synthetic and its agent row is a scripted stand-in, not an LLM, so this page quotes no recovery rates.",
];
