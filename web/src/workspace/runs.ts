import type { Lane, RecoveryCase } from "../types.js";
import { customerLabel, rupees } from "../ui/format.js";
import type { FeedEntry } from "./feed";
import { humanize } from "./cases";

export type RunStatus = "running" | "waiting" | "done" | "attention" | "closed";

export type Run = {
  caseId: string;
  title: string;
  subtitle: string;
  status: RunStatus;
  steps: FeedEntry[];
  updatedAt: number;
};

const STATUS_BY_LANE: Record<Lane, RunStatus> = {
  INCOMING: "running",
  DIAGNOSING: "running",
  DECIDING: "running",
  ATTEMPTING: "running",
  RETRY_SCHEDULED: "waiting",
  RECOVERED: "done",
  ESCALATED: "attention",
  WRITTEN_OFF: "closed",
  STOPPED: "closed",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Working",
  waiting: "Waiting",
  done: "Recovered",
  attention: "Needs you",
  closed: "Closed",
};

export const RUN_LIMIT = 12;

export function buildRuns(feed: FeedEntry[], cases: RecoveryCase[]): Run[] {
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const grouped = new Map<string, FeedEntry[]>();
  for (const entry of feed) {
    if (!entry.caseId) continue;
    const list = grouped.get(entry.caseId) ?? [];
    list.push(entry);
    grouped.set(entry.caseId, list);
  }

  const runs: Run[] = [];
  for (const [caseId, entries] of grouped) {
    const kase = byCase.get(caseId);
    if (!kase) continue;
    const steps = [...entries].sort((a, b) => a.at - b.at || a.id - b.id);
    runs.push({
      caseId,
      title: customerLabel(kase.customerRef),
      subtitle: `${rupees(kase.amountPaise)} · ${humanize(kase.failureReason)}`,
      status: STATUS_BY_LANE[kase.lane],
      steps,
      updatedAt: steps[steps.length - 1]!.at,
    });
  }
  return runs.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RUN_LIMIT);
}
