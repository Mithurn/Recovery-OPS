import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthService, User } from "../auth/service.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../auth/config.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  const flags = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (secure) flags.push("Secure");
  reply.header("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags.join("; ")}`);
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.header("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
}

export function sessionToken(req: FastifyRequest): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}

export function requireUser(auth: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = sessionToken(req);
    const user = token ? await auth.userForToken(token) : null;
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    req.user = user;
  };
}
