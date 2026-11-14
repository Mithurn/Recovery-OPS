import type { AgentProposal } from "../src/domain/recovery-action.js";
import type { SimilarCaseSummary } from "../src/domain/ports.js";
import { LIVE, POOL } from "./config.js";
import { generateCorpus, type BenchCase } from "./corpus.js";
import { rulesTable } from "./arms.js";
import { simulate } from "./simulator.js";

export type LiveEnv = { openRouterApiKey?: string; googleApiKey?: string; agentModel?: string };

export function resolveLiveModelId(env: LiveEnv, flag: string | undefined): string {
  const id = flag ?? env.agentModel;
  if (id) return id;
  if (env.openRouterApiKey) return LIVE.fallbackOpenRouterModel;
  throw new Error("only GOOGLE_GENERATIVE_AI_API_KEY is set; pass --model google/<model id>");
}

function buildPool(): { c: BenchCase; summary: SimilarCaseSummary }[] {
  return generateCorpus(POOL.seed, POOL.size).map((c) => {
    const outcome = simulate(c, rulesTable(c));
    return {
      c,
      summary: {
        failureReason: c.kase.failureReason,
        action: (outcome.final ?? outcome.proposed).kind,
        outcome: outcome.recovered ? "RECOVERED" : "FAILED",
        hoursToResolution: outcome.recovered ? (outcome.delayHours ?? 0) : null,
      },
    };
  });
}

export async function recordLive(cases: BenchCase[], modelId: string, env: LiveEnv): Promise<Map<string, AgentProposal>> {
  const [{ runRecoveryAgent }, { resolveModel }] = await Promise.all([
    import("../src/agent/recovery-agent.js"),
    import("../src/agent/model.js"),
  ]);
  const model = resolveModel(modelId, { openRouterApiKey: env.openRouterApiKey, googleApiKey: env.googleApiKey });
  const pool = buildPool();
  const proposals = new Map<string, AgentProposal>();
  for (const c of cases) {
    const clock = { now: () => new Date(c.kase.failedAt) };
    const proposal = await runRecoveryAgent(
      {
        kase: c.kase,
        method: c.method,
        instrumentHint: c.instrumentHint,
        gateway: { listDowntimes: async () => c.downtimes },
        priorAttempts: [],
        similarCases: async ({ method, limit }) =>
          pool
            .filter((p) => p.summary.failureReason === c.kase.failureReason && (!method || p.c.method === method))
            .slice(0, limit ?? POOL.defaultLimit)
            .map((p) => p.summary),
        clock,
      },
      { model, stepBudget: LIVE.stepBudget, deadlineMs: LIVE.deadlineMs },
    );
    proposals.set(c.kase.id, proposal);
  }
  return proposals;
}
