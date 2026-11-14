import type { Db } from "./pool.js";

export type SpendSnapshot = {
  usdUsed: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  callsWithoutUsage: number;
};

export interface SpendStore {
  load(userId: string): Promise<SpendSnapshot | null>;
  save(userId: string, snapshot: SpendSnapshot): Promise<void>;
}

export class PostgresSpendRepository implements SpendStore {
  constructor(private readonly db: Db) {}

  async load(userId: string): Promise<SpendSnapshot | null> {
    const { rows } = await this.db.query(
      `SELECT usd_used, calls, input_tokens, output_tokens, calls_without_usage
         FROM user_spend WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0] as Record<string, number> | undefined;
    if (!row) return null;
    return {
      usdUsed: Number(row.usd_used),
      calls: Number(row.calls),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      callsWithoutUsage: Number(row.calls_without_usage),
    };
  }

  async save(userId: string, s: SpendSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO user_spend (user_id, usd_used, calls, input_tokens, output_tokens, calls_without_usage)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET
         usd_used = GREATEST(user_spend.usd_used, EXCLUDED.usd_used),
         calls = GREATEST(user_spend.calls, EXCLUDED.calls),
         input_tokens = GREATEST(user_spend.input_tokens, EXCLUDED.input_tokens),
         output_tokens = GREATEST(user_spend.output_tokens, EXCLUDED.output_tokens),
         calls_without_usage = GREATEST(user_spend.calls_without_usage, EXCLUDED.calls_without_usage),
         updated_at = now()`,
      [userId, s.usdUsed, s.calls, s.inputTokens, s.outputTokens, s.callsWithoutUsage],
    );
  }
}
