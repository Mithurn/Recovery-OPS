import type { FastifyRequest } from "fastify";

export const CLIENT_IP_HEADER = "x-client-ip";

export const VERIFY_PER_IP_LIMIT = 10;
export const VERIFY_PER_EMAIL_LIMIT = 20;
export const VERIFY_WINDOW_MS = 15 * 60_000;
export const WEBHOOK_PER_TOKEN_LIMIT = 120;
export const WEBHOOK_WINDOW_MS = 60_000;
export const STREAM_NEGATIVE_TTL_MS = 30_000;
export const READINESS_TIMEOUT_MS = 2_000;
export const SHUTDOWN_MARGIN_MS = 15_000;

export function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers[CLIENT_IP_HEADER];
  return typeof forwarded === "string" && forwarded ? forwarded : req.ip;
}

const WEBHOOK_PATH = /^(\/api\/webhooks\/razorpay\/)[^/?#]+/;

export function redactWebhookToken(url: string): string {
  return url.replace(WEBHOOK_PATH, "$1[redacted]");
}
