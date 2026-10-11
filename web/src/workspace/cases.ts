import type { Lane, RecoveryCase } from "../types.js";

export type Priority = "High" | "Medium" | "Low";
export type StatusGroup = "In progress" | "Waiting" | "Needs you" | "Recovered" | "Written off" | "Stopped";

export const STATUS_GROUPS: readonly StatusGroup[] = ["In progress", "Waiting", "Needs you", "Recovered", "Written off", "Stopped"];

const GROUP_BY_LANE: Record<Lane, StatusGroup> = {
  INCOMING: "In progress",
  DIAGNOSING: "In progress",
  DECIDING: "In progress",
  ATTEMPTING: "In progress",
  RETRY_SCHEDULED: "Waiting",
  ESCALATED: "Needs you",
  RECOVERED: "Recovered",
  WRITTEN_OFF: "Written off",
  STOPPED: "Stopped",
};

const OPEN_LANES: readonly Lane[] = ["INCOMING", "DIAGNOSING", "DECIDING", "ATTEMPTING", "RETRY_SCHEDULED"];
export const HIGH_EXPOSURE_PAISE = 400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const statusOf = (c: RecoveryCase): StatusGroup => GROUP_BY_LANE[c.lane];

export function casePriority(c: RecoveryCase): Priority {
  if (c.lane === "ESCALATED") return "High";
  if (!OPEN_LANES.includes(c.lane)) return "Low";
  return c.amountPaise >= HIGH_EXPOSURE_PAISE ? "High" : "Medium";
}

export type CaseFilters = {
  query: string;
  status: StatusGroup | "";
  reason: string;
  method: string;
  bank: string;
  priority: Priority | "";
};

export const NO_FILTERS: CaseFilters = { query: "", status: "", reason: "", method: "", bank: "", priority: "" };

export const humanize = (value: string): string => value.replace(/_/g, " ");

export function filterCases(cases: RecoveryCase[], f: CaseFilters): RecoveryCase[] {
  const q = f.query.trim().toLowerCase();
  return cases.filter((c) => {
    if (f.status && statusOf(c) !== f.status) return false;
    if (f.reason && c.failureReason !== f.reason) return false;
    if (f.method && c.method !== f.method) return false;
    if (f.bank && (c.instrument?.issuer ?? "") !== f.bank) return false;
    if (f.priority && casePriority(c) !== f.priority) return false;
    if (!q) return true;
    return [c.customerRef, humanize(c.failureReason), c.method ?? "", c.instrument?.issuer ?? ""].join(" ").toLowerCase().includes(q);
  });
}

const distinct = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((v): v is string => !!v))].sort();

export function facetsOf(cases: RecoveryCase[]): { reasons: string[]; methods: string[]; banks: string[] } {
  return {
    reasons: distinct(cases.map((c) => c.failureReason)),
    methods: distinct(cases.map((c) => c.method)),
    banks: distinct(cases.map((c) => c.instrument?.issuer)),
  };
}

export function countByStatus(cases: RecoveryCase[]): Record<StatusGroup, number> {
  const counts = Object.fromEntries(STATUS_GROUPS.map((g) => [g, 0])) as Record<StatusGroup, number>;
  for (const c of cases) counts[statusOf(c)] += 1;
  return counts;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < MINUTE_MS) return "just now";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
}

export type ReasonRate = { reason: string; total: number; recovered: number; rate: number };

export function recoveryByReason(cases: RecoveryCase[]): ReasonRate[] {
  const groups = new Map<string, { total: number; recovered: number }>();
  for (const c of cases) {
    const g = groups.get(c.failureReason) ?? { total: 0, recovered: 0 };
    g.total += 1;
    if (c.lane === "RECOVERED") g.recovered += 1;
    groups.set(c.failureReason, g);
  }
  return [...groups.entries()]
    .map(([reason, g]) => ({ reason, ...g, rate: g.recovered / g.total }))
    .sort((a, b) => b.total - a.total || b.rate - a.rate);
}
