import type { Scenario } from "../api.js";
import type { RecoveryCase } from "../types.js";
import { customerLabel, rupees } from "../ui/format.js";
import { humanize } from "./cases";

export type Suggestion = {
  key: string;
  label: string;
  hint?: string;
  fill?: string;
  run?: () => void | Promise<void>;
};

export type CommandContext = {
  scenarios: Scenario[];
  cases: RecoveryCase[];
  simulate: (scenarioId: string) => void | Promise<void>;
  retry: (caseId: string) => void | Promise<void>;
  open: (caseId: string) => void;
  stop: () => void | Promise<void>;
  resume: () => void | Promise<void>;
};

const VERBS = [
  { verb: "simulate", hint: "Run a failed payment through the agents" },
  { verb: "retry", hint: "Send a case back through the pipeline" },
  { verb: "open", hint: "Open a case and its story" },
  { verb: "stop", hint: "Emergency stop for every open case" },
  { verb: "resume", hint: "Allow new work after a stop" },
] as const;

const MENTION_LIMIT = 6;
const RETRYABLE = new Set(["INCOMING", "DIAGNOSING", "DECIDING", "ATTEMPTING", "RETRY_SCHEDULED"]);

const matches = (haystack: string, needle: string) => !needle || haystack.toLowerCase().includes(needle);

export function suggest(input: string, ctx: CommandContext): Suggestion[] {
  const text = input.trimStart();
  if (text !== "" && !text.startsWith("/")) return [];

  const [head = "", ...restParts] = text.slice(1).split(" ");
  const hasArg = text.includes(" ");
  const rest = restParts.join(" ").trim().toLowerCase();

  if (!hasArg) {
    return VERBS.filter((v) => v.verb.startsWith(head.toLowerCase())).map((v) => ({
      key: v.verb,
      label: `/${v.verb}`,
      hint: v.hint,
      ...(v.verb === "stop" ? { run: ctx.stop } : v.verb === "resume" ? { run: ctx.resume } : { fill: `/${v.verb} ` }),
    }));
  }

  switch (head.toLowerCase()) {
    case "simulate":
      return ctx.scenarios
        .filter((s) => matches(`${s.label} ${s.id}`, rest))
        .map((s) => ({ key: s.id, label: s.label, hint: rupees(s.amountPaise), run: () => ctx.simulate(s.id) }));
    case "retry":
    case "open": {
      const retry = head.toLowerCase() === "retry";
      return ctx.cases
        .filter((c) => (!retry || RETRYABLE.has(c.lane)) && matches(`${customerLabel(c.customerRef)} ${humanize(c.failureReason)}`, rest.replace(/^@/, "")))
        .slice(0, MENTION_LIMIT)
        .map((c) => ({
          key: c.id,
          label: `@${customerLabel(c.customerRef)}`,
          hint: `${rupees(c.amountPaise)} · ${humanize(c.failureReason)}`,
          run: () => (retry ? ctx.retry(c.id) : ctx.open(c.id)),
        }));
    }
    default:
      return [];
  }
}
