import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const required = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  VAULT_KEY: "dmF1bHQ=",
  SESSION_SECRET: "0123456789abcdef",
};

describe("loadConfig", () => {
  it("applies defaults for everything optional", () => {
    const config = loadConfig(required);
    expect(config).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      HOST: "localhost",
      PUBLIC_URL: "http://localhost:5173",
      AGENT_STEP_BUDGET: 6,
      AGENT_TIMEOUT_MS: 90_000,
      OTP_REQUESTS_PER_HOUR: 20,
      MAX_CASES_PER_USER: 25,
    });
    expect(config.RESEND_API_KEY).toBeUndefined();
  });

  it("coerces numeric strings", () => {
    const config = loadConfig({ ...required, PORT: "8080", AGENT_USER_CAP_USD: "0.25" });
    expect(config.PORT).toBe(8080);
    expect(config.AGENT_USER_CAP_USD).toBe(0.25);
  });

  it("treats empty optional strings as unset", () => {
    const config = loadConfig({ ...required, OPENROUTER_API_KEY: "", RESEND_API_KEY: "" });
    expect(config.OPENROUTER_API_KEY).toBeUndefined();
    expect(config.RESEND_API_KEY).toBeUndefined();
  });

  it("lists every missing or invalid variable in one error", () => {
    expect(() => loadConfig({ DATABASE_URL: "not a url", SESSION_SECRET: "short" })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*VAULT_KEY[\s\S]*SESSION_SECRET/,
    );
  });

  it("rejects an unknown NODE_ENV and non-positive numbers", () => {
    expect(() => loadConfig({ ...required, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ ...required, PORT: "0" })).toThrow(/PORT/);
  });
});
