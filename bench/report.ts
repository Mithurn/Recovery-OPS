import type { RootCause } from "../src/domain/failure.js";
import type { BenchCase } from "./corpus.js";
import type { ArmResult } from "./arms.js";

export type ArmSummary = { name: string; perSeed: SeedStats[] };
export type SeedStats = { recoveryRate: number; accuracy: number | null; gateRate: number };

export function scoreArm(cases: BenchCase[], result: ArmResult): SeedStats {
  const n = cases.length;
  const recovered = result.outcomes.filter((o) => o.recovered).length;
  const gated = result.outcomes.filter((o) => o.gate !== "allow").length;
  const diagnosed = result.diagnoses.some((d) => d !== null);
  const correct = cases.filter((c, i) => (result.diagnoses[i] as RootCause | null) === c.truth.rootCause).length;
  return { recoveryRate: recovered / n, accuracy: diagnosed ? correct / n : null, gateRate: gated / n };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderTable(arms: ArmSummary[]): string {
  const rows = arms.map(({ name, perSeed }) => {
    const rates = perSeed.map((s) => s.recoveryRate);
    const accuracies = perSeed.map((s) => s.accuracy);
    const accuracy = accuracies.every((a): a is number => a !== null) ? pct(mean(accuracies)) : "n/a";
    return `| ${name} | ${pct(mean(rates))} | ${pct(sd(rates))} | ${pct(Math.min(...rates))} to ${pct(Math.max(...rates))} | ${accuracy} | ${pct(mean(perSeed.map((s) => s.gateRate)))} |`;
  });
  return [
    "| Arm | Recovery rate (mean) | Std dev | Range over seeds | Root-cause accuracy | Gate intervened |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
