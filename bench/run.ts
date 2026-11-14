import { parseArgs } from "node:util";
import {
  DEFAULT_CASES,
  DEFAULT_FIRST_SEED,
  DEFAULT_SEEDS,
  LIVE_TRANSCRIPTS,
  MIN_COUNT,
  SCRIPTED_NOTICE,
  SCRIPTED_TRANSCRIPTS,
} from "./config.js";
import { generateCorpus } from "./corpus.js";
import { fixedSchedule, rulesTable, runArm } from "./arms.js";
import { scriptedStandIn } from "./standin.js";
import { renderTable, scoreArm, type ArmSummary } from "./report.js";
import { readTranscript, replayProposer, toEntry, writeTranscript, type TranscriptKind } from "./transcripts.js";
import { recordLive, resolveLiveModelId, type LiveEnv } from "./live.js";

export type BenchOptions = {
  seeds: number;
  cases: number;
  firstSeed: number;
  transcripts: string;
};

const AGENT_LABELS: Record<TranscriptKind, (model: string | null) => string> = {
  "scripted-standin": () => "Agent behind gate (SCRIPTED STAND-IN, not an LLM)",
  live: (model) => `Agent behind gate (live LLM replay: ${model ?? "unknown model"})`,
};

export function runBench(options: BenchOptions): string {
  const seeds = Array.from({ length: options.seeds }, (_, i) => options.firstSeed + i);
  const perArm: Record<"fixed" | "rules" | "agent", ArmSummary["perSeed"]> = { fixed: [], rules: [], agent: [] };
  let kind: TranscriptKind = "scripted-standin";
  let model: string | null = null;

  for (const seed of seeds) {
    const cases = generateCorpus(seed, options.cases);
    const transcript = readTranscript(options.transcripts, seed);
    kind = transcript.meta.kind;
    model = transcript.meta.model;
    const replay = replayProposer(transcript, options.transcripts);
    perArm.fixed.push(scoreArm(cases, runArm(cases, fixedSchedule)));
    perArm.rules.push(scoreArm(cases, runArm(cases, rulesTable)));
    perArm.agent.push(scoreArm(cases, runArm(cases, (c) => replay(c.kase.id))));
  }

  const arms: ArmSummary[] = [
    { name: "Fixed retry schedule", perSeed: perArm.fixed },
    { name: "Hand-tuned rules table", perSeed: perArm.rules },
    { name: AGENT_LABELS[kind](model), perSeed: perArm.agent },
  ];
  const header = [
    `Recovery OPS bench: ${options.seeds} seed(s) from ${options.firstSeed}, ${options.cases} synthetic cases each. Every arm runs through the real safetyGate.`,
    kind === "scripted-standin"
      ? `Agent arm is a deterministic scripted stand-in replayed from bench/transcripts/${options.transcripts}-seed-N.json. It is not a language model.`
      : `Agent arm replays recorded transcripts from a live model (${model ?? "unknown"}).`,
  ];
  return [...header, "", renderTable(arms)].join("\n");
}

function positiveInt(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_COUNT) throw new Error(`--${flag} must be an integer >= ${MIN_COUNT}`);
  return n;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seeds: { type: "string" },
      cases: { type: "string" },
      "first-seed": { type: "string" },
      transcripts: { type: "string" },
      live: { type: "boolean", default: false },
      model: { type: "string" },
      "record-scripted": { type: "boolean", default: false },
    },
  });
  const seeds = positiveInt(values.seeds, DEFAULT_SEEDS, "seeds");
  const cases = positiveInt(values.cases, DEFAULT_CASES, "cases");
  const firstSeed = positiveInt(values["first-seed"], DEFAULT_FIRST_SEED, "first-seed");
  const seedList = Array.from({ length: seeds }, (_, i) => firstSeed + i);

  if (values["record-scripted"]) {
    for (const seed of seedList) {
      const corpus = generateCorpus(seed, cases);
      writeTranscript(SCRIPTED_TRANSCRIPTS, {
        meta: { kind: "scripted-standin", notice: SCRIPTED_NOTICE, model: null, seed, cases },
        proposals: Object.fromEntries(corpus.map((c) => [c.kase.id, toEntry(scriptedStandIn(c, seed))])),
      });
    }
    console.log(`Recorded ${seeds} scripted stand-in transcript(s).`);
    return;
  }

  let transcripts = values.transcripts ?? SCRIPTED_TRANSCRIPTS;
  if (values.live) {
    const env: LiveEnv = {
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      agentModel: process.env.AGENT_MODEL,
    };
    if (!env.openRouterApiKey && !env.googleApiKey) {
      throw new Error("--live needs OPENROUTER_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY");
    }
    const modelId = resolveLiveModelId(env, values.model);
    for (const seed of seedList) {
      const corpus = generateCorpus(seed, cases);
      const proposals = await recordLive(corpus, modelId, env);
      writeTranscript(LIVE_TRANSCRIPTS, {
        meta: { kind: "live", notice: "Recorded from the real recovery agent against synthetic cases.", model: modelId, seed, cases },
        proposals: Object.fromEntries([...proposals].map(([id, p]) => [id, toEntry(p)])),
      });
    }
    transcripts = LIVE_TRANSCRIPTS;
  }

  console.log(runBench({ seeds, cases, firstSeed, transcripts }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
