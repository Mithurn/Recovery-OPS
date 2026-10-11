import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function parseVaultKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) throw new Error(`VAULT_KEY must decode to ${KEY_BYTES} bytes`);
  return key;
}

export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(key: Buffer, payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + 16));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + 16)), decipher.final()]).toString("utf8");
}

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const hmac = (secret: string, value: string): string => createHmac("sha256", secret).update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
