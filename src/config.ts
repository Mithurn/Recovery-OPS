import { z } from "zod";

const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  OPENROUTER_API_KEY: optionalString,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  // gemini-2.5-flash and gemini-2.0-flash are both retired; 3.6-flash is the successor.
  AGENT_MODEL: z.string().default("minimax/minimax-m3:free"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  VAULT_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  RESEND_API_KEY: optionalString,
  MAIL_FROM: z.string().default("Recovery OPS <onboarding@resend.dev>"),
  OTP_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(20),
  MAX_CASES_PER_USER: z.coerce.number().int().positive().default(25),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  AGENT_STEP_BUDGET: z.coerce.number().int().positive().default(6),
  AGENT_USER_CAP_USD: z.coerce.number().positive().default(0.1),
  // Token counts are measured off the provider's usage block; these rates turn them into money and
  // are a declared input, not a measurement. Defaults are the Gemini API standard tier — change
  // them with the model, and after any pricing change.
  AGENT_USD_PER_M_INPUT: z.coerce.number().nonnegative().default(1.5),
  AGENT_USD_PER_M_OUTPUT: z.coerce.number().nonnegative().default(7.5),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("localhost"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
