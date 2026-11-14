import type { FastifyInstance } from "fastify";
import { READINESS_TIMEOUT_MS } from "./limits.js";

export type ReadinessChecks = Record<string, () => Promise<unknown>>;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function runReadiness(checks: ReadinessChecks, timeoutMs = READINESS_TIMEOUT_MS) {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        await withTimeout(check(), timeoutMs);
        return [name, "ok"] as const;
      } catch {
        return [name, "down"] as const;
      }
    }),
  );
  const results = Object.fromEntries(entries);
  return { ok: entries.every(([, status]) => status === "ok"), results };
}

export function registerHealth(app: FastifyInstance, checks: ReadinessChecks): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_req, reply) => {
    const { ok, results } = await runReadiness(checks);
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "unavailable", checks: results });
  });
}
