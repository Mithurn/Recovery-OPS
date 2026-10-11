import { randomInt, randomUUID } from "node:crypto";
import type { Db } from "../persistence/pool.js";
import { hmac, randomToken, safeEqual, sha256 } from "./crypto.js";
import type { OtpMailer } from "./mailer.js";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, SESSION_TTL_MS } from "./config.js";

export type User = { id: string; email: string };

export type RequestCodeResult = { ok: true } | { ok: false; retryAfterMs: number };
export type VerifyResult = { ok: true; token: string; user: User } | { ok: false; reason: "invalid" | "expired" | "locked" };

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly mailer: OtpMailer,
    private readonly secret: string,
  ) {}

  async requestCode(email: string): Promise<RequestCodeResult> {
    const { rows } = await this.db.query("SELECT created_at FROM otp_codes WHERE email = $1", [email]);
    if (rows.length) {
      const elapsed = Date.now() - (rows[0].created_at as Date).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) return { ok: false, retryAfterMs: OTP_RESEND_COOLDOWN_MS - elapsed };
    }
    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
    await this.db.query(
      `INSERT INTO otp_codes (email, code_hash, attempts, expires_at, created_at)
       VALUES ($1, $2, 0, $3, now())
       ON CONFLICT (email) DO UPDATE
         SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
      [email, this.codeHash(email, code), new Date(Date.now() + OTP_TTL_MS)],
    );
    await this.mailer.sendCode(email, code);
    return { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<VerifyResult> {
    const { rows } = await this.db.query(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING code_hash, attempts, expires_at",
      [email],
    );
    if (!rows.length) return { ok: false, reason: "invalid" };
    const row = rows[0] as { code_hash: string; attempts: number; expires_at: Date };
    if (row.attempts > OTP_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
    if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (!safeEqual(row.code_hash, this.codeHash(email, code))) return { ok: false, reason: "invalid" };

    await this.db.query("DELETE FROM otp_codes WHERE email = $1", [email]);
    const user = await this.upsertUser(email);
    const token = randomToken();
    await this.db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
      sha256(token),
      user.id,
      new Date(Date.now() + SESSION_TTL_MS),
    ]);
    return { ok: true, token, user };
  }

  async userForToken(token: string): Promise<User | null> {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    return rows.length ? (rows[0] as User) : null;
  }

  async endSession(token: string): Promise<void> {
    await this.db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  }

  private codeHash(email: string, code: string): string {
    return hmac(this.secret, `${email}:${code}`);
  }

  private async upsertUser(email: string): Promise<User> {
    const { rows } = await this.db.query(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email`,
      [randomUUID(), email],
    );
    return rows[0] as User;
  }
}
