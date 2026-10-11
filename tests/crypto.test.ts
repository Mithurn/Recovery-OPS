import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, parseVaultKey, safeEqual } from "../src/auth/crypto.js";

describe("vault crypto", () => {
  const key = randomBytes(32);

  it("round-trips a secret and never stores it in the clear", () => {
    const sealed = encrypt(key, "rzp_secret_value");
    expect(sealed).not.toContain("rzp_secret_value");
    expect(decrypt(key, sealed)).toBe("rzp_secret_value");
  });

  it("rejects a tampered payload and a wrong key", () => {
    const sealed = Buffer.from(encrypt(key, "secret"), "base64");
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1;
    expect(() => decrypt(key, sealed.toString("base64"))).toThrow();
    expect(() => decrypt(randomBytes(32), encrypt(key, "secret"))).toThrow();
  });

  it("requires a 32 byte vault key", () => {
    expect(() => parseVaultKey(randomBytes(16).toString("base64"))).toThrow();
    expect(parseVaultKey(key.toString("base64"))).toHaveLength(32);
  });

  it("compares strings of different length without throwing", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
  });
});
