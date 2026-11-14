import { describe, expect, it } from "vitest";
import type { AgentProposal } from "../src/domain/recovery-action.js";
import { generateCorpus, type BenchCase } from "./corpus.js";
import { simulate } from "./simulator.js";
import { runBench } from "./run.js";
import { SCRIPTED_TRANSCRIPTS } from "./config.js";
import { DEFAULT_LIMITS } from "../src/safety/safety-gate.js";

const OPTIONS = { seeds: 2, cases: 30, firstSeed: 1, transcripts: SCRIPTED_TRANSCRIPTS };
const CORPUS_SEED = 3;
const CORPUS_SIZE = 200;

function propose(action: AgentProposal["action"], overrides: Partial<AgentProposal> = {}): AgentProposal {
  return { action, diagnosisRootCause: "soft_decline", confidence: 0.95, reasoning: "test", toolCalls: 0, degraded: false, ...overrides };
}

function firstWhere(predicate: (c: BenchCase) => boolean): BenchCase {
  const found = generateCorpus(CORPUS_SEED, CORPUS_SIZE).find(predicate);
  if (!found) throw new Error("corpus has no matching case");
  return found;
}

describe("bench determinism", () => {
  it("generates the same corpus for the same seed and a different one for another seed", () => {
    expect(generateCorpus(1, 20)).toEqual(generateCorpus(1, 20));
    expect(generateCorpus(1, 20).map((c) => c.kase.id)).not.toEqual(generateCorpus(2, 20).map((c) => c.kase.id));
  });

  it("keeps a case stable when the corpus grows", () => {
    expect(generateCorpus(1, 10)[4]).toEqual(generateCorpus(1, 30)[4]);
  });

  it("prints the same table for the same options", () => {
    expect(runBench(OPTIONS)).toBe(runBench(OPTIONS));
  });

  it("labels the committed agent arm as a scripted stand-in", () => {
    const out = runBench(OPTIONS);
    expect(out).toContain("SCRIPTED STAND-IN, not an LLM");
    expect(out).toContain("It is not a language model.");
  });
});

describe("safety gate inside the simulation", () => {
  it("clamps a confident retry on a risk-held payment to escalate", () => {
    const c = firstWhere((x) => x.truth.rootCause === "risk_hold" && !x.truth.humanRecovers);
    const out = simulate(c, propose({ kind: "RETRY_NOW" }));
    expect(out.gate).toBe("clamp");
    expect(out.rule).toBe("risk_hold");
    expect(out.final?.kind).toBe("ESCALATE");
    expect(out.recovered).toBe(false);
  });

  it("clamps an automatic retry on an expired card even when the model calls it a soft decline", () => {
    const c = firstWhere((x) => x.truth.rootCause === "hard_decline");
    const out = simulate(c, propose({ kind: "RETRY_SCHEDULED", atHoursFromNow: 24 }));
    expect(out.rule).toBe("hard_decline");
    expect(out.final?.kind).toBe("ESCALATE");
  });

  it("clamps a low-confidence retry and an unsupported write-off", () => {
    const c = firstWhere((x) => x.truth.rootCause === "soft_decline" && x.kase.amountPaise <= DEFAULT_LIMITS.maxExposurePaise);
    expect(simulate(c, propose({ kind: "RETRY_NOW" }, { confidence: 0.2 })).rule).toBe("low_confidence");
    const writeOff = simulate(c, propose({ kind: "WRITE_OFF", reason: "give up" }, { diagnosisRootCause: "unrecoverable" }));
    expect(writeOff.rule).toBe("write_off_unsupported");
    expect(writeOff.final?.kind).toBe("ESCALATE");
  });

  it("clamps a retry above the exposure cap", () => {
    const c = firstWhere((x) => x.kase.amountPaise > DEFAULT_LIMITS.maxExposurePaise && x.truth.rootCause === "technical");
    expect(simulate(c, propose({ kind: "RETRY_NOW" })).rule).toBe("exposure_cap");
  });

  it("lets a safe proposal through and scores it from ground truth", () => {
    const c = firstWhere((x) => x.truth.rootCause === "technical" && x.kase.amountPaise <= DEFAULT_LIMITS.maxExposurePaise);
    const out = simulate(c, propose({ kind: "RETRY_NOW" }, { diagnosisRootCause: "technical" }));
    expect(out.gate).toBe("allow");
    expect(out.recovered).toBe(c.truth.retry !== null && c.truth.retry.readyAfterHours === 0);
  });

  it("defers a nudge outside the contact window instead of dropping it", () => {
    const c = firstWhere((x) => x.truth.rootCause === "hard_decline" && x.truth.nudgeRecovers.email);
    const out = simulate(c, propose({ kind: "CUSTOMER_NUDGE", channel: "email" }, { diagnosisRootCause: "hard_decline" }));
    expect(out.gate === "allow" || out.rule === "contact_window").toBe(true);
    expect(out.recovered).toBe(true);
  });
});
