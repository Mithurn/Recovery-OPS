import type { BenchCase } from "./corpus.js";
import { HOURS_PER_DAY, MS_PER_HOUR } from "./config.js";

export type Signals = {
  failureReason: string;
  successful: number;
  failed: number;
  daysSinceLastSuccess: number | null;
  medianGapDays: number | null;
  downtimeMatched: boolean;
  hoursToDowntimeEnd: number | null;
};

const DAY_MS = HOURS_PER_DAY * MS_PER_HOUR;

export function observe(c: BenchCase): Signals {
  const { kase } = c;
  const captured = kase.customerHistory.filter((p) => p.status === "captured");
  const failedAtMs = Date.parse(kase.failedAt);
  const last = captured.at(-1);
  const gaps = captured
    .slice(1)
    .map((p, i) => (Date.parse(p.paidAt) - Date.parse(captured[i]!.paidAt)) / DAY_MS)
    .sort((a, b) => a - b);
  const instrument = c.instrumentHint?.toUpperCase();
  const match = c.downtimes.find(
    (d) => d.status === "started" && Object.values(d.instrument).some((v) => v.toUpperCase() === instrument),
  );
  return {
    failureReason: kase.failureReason,
    successful: captured.length,
    failed: kase.customerHistory.length - captured.length,
    daysSinceLastSuccess: last ? Math.round((failedAtMs - Date.parse(last.paidAt)) / DAY_MS) : null,
    medianGapDays: gaps.length > 0 ? Math.round(gaps[Math.floor(gaps.length / 2)]!) : null,
    downtimeMatched: match !== undefined,
    hoursToDowntimeEnd: match?.end ? (Date.parse(match.end) - failedAtMs) / MS_PER_HOUR : null,
  };
}
