import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/service.js";
import type { CredentialStore } from "../tenants/credentials.js";
import { TEST_KEY_PREFIX } from "../tenants/credentials.js";
import type { TenantRuntimes } from "../tenants/runtime.js";
import { FixedWindowLimiter } from "./rate-limit.js";
import { clearSessionCookie, requireUser, sessionToken, setSessionCookie } from "./session.js";

export type AuthRouteDeps = {
  auth: AuthService;
  credentials: CredentialStore;
  runtimes: TenantRuntimes;
  verifyKeys: (keyId: string, keySecret: string) => Promise<boolean>;
  publicUrl: string;
  secureCookies: boolean;
  codeRequestsPerHour: number;
};

const HOUR_MS = 60 * 60_000;

const emailBody = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const verifyBody = emailBody.extend({ code: z.string().regex(/^\d{6}$/) });
const keysBody = z.object({
  keyId: z.string().trim().min(1).max(64),
  keySecret: z.string().trim().min(1).max(128),
});

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): Promise<void> {
  const limiter = new FixedWindowLimiter(deps.codeRequestsPerHour, HOUR_MS);
  const guard = { onRequest: requireUser(deps.auth) };

  app.post("/auth/request", async (req, reply) => {
    const body = emailBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "enter a valid email" });
    if (!limiter.allow(req.ip)) return reply.code(429).send({ error: "too many requests, try again later" });
    const result = await deps.auth.requestCode(body.data.email);
    if (!result.ok) {
      return reply.code(429).send({ error: "code already sent, wait before requesting another", retryAfterMs: result.retryAfterMs });
    }
    return { sent: true };
  });

  app.post("/auth/verify", async (req, reply) => {
    const body = verifyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "enter the 6 digit code" });
    const result = await deps.auth.verifyCode(body.data.email, body.data.code);
    if (!result.ok) {
      const message = result.reason === "expired" ? "code expired, request a new one" : result.reason === "locked" ? "too many attempts, request a new code" : "incorrect code";
      return reply.code(401).send({ error: message });
    }
    setSessionCookie(reply, result.token, deps.secureCookies);
    return { user: result.user };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = sessionToken(req);
    if (token) await deps.auth.endSession(token);
    clearSessionCookie(reply, deps.secureCookies);
    return { ok: true };
  });

  app.get("/auth/me", guard, async (req) => ({ user: req.user }));

  const webhookUrl = (token: string) => `${deps.publicUrl}/api/webhooks/razorpay/${token}`;

  app.get("/credentials", guard, async (req) => {
    const creds = await deps.credentials.forUser(req.user!.id);
    if (!creds) return { connected: false };
    return {
      connected: true,
      keyId: creds.keyId,
      webhookUrl: webhookUrl(creds.webhookToken),
      webhookSecret: creds.webhookSecret,
    };
  });

  app.put("/credentials", guard, async (req, reply) => {
    const body = keysBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "key id and secret are required" });
    if (!body.data.keyId.startsWith(TEST_KEY_PREFIX)) {
      return reply.code(400).send({ error: `only test mode keys (${TEST_KEY_PREFIX}…) are accepted` });
    }
    if (!(await deps.verifyKeys(body.data.keyId, body.data.keySecret))) {
      return reply.code(400).send({ error: "Razorpay rejected these keys" });
    }
    const creds = await deps.credentials.save(req.user!.id, body.data.keyId, body.data.keySecret);
    deps.runtimes.invalidate(req.user!.id);
    return { connected: true, keyId: creds.keyId, webhookUrl: webhookUrl(creds.webhookToken), webhookSecret: creds.webhookSecret };
  });

  app.delete("/credentials", guard, async (req) => {
    await deps.credentials.remove(req.user!.id);
    deps.runtimes.invalidate(req.user!.id);
    return { connected: false };
  });
}
