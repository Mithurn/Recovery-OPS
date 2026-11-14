import { describe, expect, it, vi } from "vitest";
import { FixedWindowLimiter } from "../src/api/rate-limit.js";
import { clientIp, redactWebhookToken } from "../src/api/limits.js";
import { runReadiness } from "../src/api/health.js";
import { createShutdown } from "../src/api/shutdown.js";
import { createBudget } from "../src/agent/budget.js";
import { TenantRuntimes, type TenantRuntimeDeps } from "../src/tenants/runtime.js";

describe("FixedWindowLimiter", () => {
  it("blocks past the limit and resets after the window", () => {
    const limiter = new FixedWindowLimiter(2, 1000);
    expect([limiter.allow("a", 0), limiter.allow("a", 1), limiter.allow("a", 2)]).toEqual([true, true, false]);
    expect(limiter.allow("a", 1001)).toBe(true);
  });

  it("stays bounded by evicting expired then oldest keys", () => {
    const limiter = new FixedWindowLimiter(1, 1000, 3);
    for (let i = 0; i < 10; i++) limiter.allow(`k${i}`, i);
    expect(limiter.size).toBeLessThanOrEqual(3);
    limiter.allow("fresh", 5000);
    expect(limiter.size).toBe(1);
  });
});

describe("request helpers", () => {
  it("prefers the proxy client ip header", () => {
    expect(clientIp({ headers: { "x-client-ip": "1.2.3.4" }, ip: "9.9.9.9" } as never)).toBe("1.2.3.4");
    expect(clientIp({ headers: {}, ip: "9.9.9.9" } as never)).toBe("9.9.9.9");
  });

  it("redacts the webhook token in logged urls", () => {
    expect(redactWebhookToken("/api/webhooks/razorpay/secrettoken?x=1")).toBe("/api/webhooks/razorpay/[redacted]?x=1");
    expect(redactWebhookToken("/api/cases")).toBe("/api/cases");
  });
});

describe("runReadiness", () => {
  it("reports down for failing or slow dependencies", async () => {
    const result = await runReadiness(
      {
        postgres: async () => 1,
        redis: async () => {
          throw new Error("down");
        },
        slow: () => new Promise(() => {}),
      },
      20,
    );
    expect(result).toEqual({ ok: false, results: { postgres: "ok", redis: "down", slow: "down" } });
  });
});

describe("createShutdown", () => {
  it("runs steps in order once and exits cleanly", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({
      timeoutMs: 1000,
      exit,
      log: () => {},
      steps: [
        { name: "a", run: () => order.push("a") },
        { name: "b", run: async () => order.push("b") },
      ],
    });
    await Promise.all([shutdown(), shutdown()]);
    expect(order).toEqual(["a", "b"]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("continues past a failing step and exits non-zero", async () => {
    const exit = vi.fn();
    const ran = vi.fn();
    await createShutdown({
      timeoutMs: 1000,
      exit,
      log: () => {},
      steps: [
        { name: "bad", run: () => Promise.reject(new Error("x")) },
        { name: "good", run: ran },
      ],
    })();
    expect(ran).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("TenantRuntimes budget", () => {
  it("keeps spend across invalidate", async () => {
    const creds = { userId: "u1", keyId: "rzp_test_x", keySecret: "s", webhookSecret: "w", webhookToken: "t" };
    const deps = {
      credentials: { forUser: async () => creds },
      baseModel: {},
      modelId: "m",
      agent: { stepBudget: 1, deadlineMs: 1 },
      redis: {},
      budget: { capUsd: 1, usdPerMInput: 1, usdPerMOutput: 1 },
    } as unknown as TenantRuntimeDeps;
    const runtimes = new TenantRuntimes(deps);
    const first = (await runtimes.forUser("u1"))!;
    first.budget.usdUsed = 0.5;
    runtimes.invalidate("u1");
    const second = (await runtimes.forUser("u1"))!;
    expect(second).not.toBe(first);
    expect(second.budget.usdUsed).toBe(0.5);
    expect(createBudget(1).usdUsed).toBe(0);
  });
});
