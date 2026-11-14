import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { recoveryAction } from "../src/domain/recovery-action.js";
import type { AgentProposal } from "../src/domain/recovery-action.js";
import { rootCause } from "../src/domain/failure.js";
import { TRANSCRIPT_DIR } from "./config.js";

const transcriptEntry = z.object({
  action: recoveryAction,
  rootCause: rootCause.nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  toolCalls: z.number().int().nonnegative(),
  degraded: z.boolean(),
});

const transcriptFile = z.object({
  meta: z.object({
    kind: z.enum(["scripted-standin", "live"]),
    notice: z.string(),
    model: z.string().nullable(),
    seed: z.number().int(),
    cases: z.number().int().positive(),
  }),
  proposals: z.record(transcriptEntry),
});

export type TranscriptFile = z.infer<typeof transcriptFile>;
export type TranscriptKind = TranscriptFile["meta"]["kind"];

export const transcriptPath = (name: string, seed: number) => new URL(`${name}-seed-${seed}.json`, TRANSCRIPT_DIR);

export function toEntry(p: AgentProposal): TranscriptFile["proposals"][string] {
  return {
    action: p.action,
    rootCause: p.diagnosisRootCause,
    confidence: p.confidence,
    reasoning: p.reasoning,
    toolCalls: p.toolCalls,
    degraded: p.degraded,
  };
}

export function fromEntry(e: TranscriptFile["proposals"][string]): AgentProposal {
  return {
    action: e.action,
    diagnosisRootCause: e.rootCause,
    confidence: e.confidence,
    reasoning: e.reasoning,
    toolCalls: e.toolCalls,
    degraded: e.degraded,
  };
}

export function writeTranscript(name: string, file: TranscriptFile): void {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  writeFileSync(transcriptPath(name, file.meta.seed), `${JSON.stringify(file, null, 1)}\n`);
}

export function readTranscript(name: string, seed: number): TranscriptFile {
  const path = transcriptPath(name, seed);
  if (!existsSync(path)) {
    throw new Error(`no transcript ${name}-seed-${seed}.json; record one with npm run bench:record (scripted) or --live`);
  }
  return transcriptFile.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function replayProposer(file: TranscriptFile, name: string) {
  return (id: string): AgentProposal => {
    const entry = file.proposals[id];
    if (!entry) {
      throw new Error(`transcript ${name}-seed-${file.meta.seed}.json has no case ${id}; re-record it with a larger --cases`);
    }
    return fromEntry(entry);
  };
}
