CREATE TABLE IF NOT EXISTS user_spend (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  usd_used           DOUBLE PRECISION NOT NULL DEFAULT 0,
  calls              BIGINT      NOT NULL DEFAULT 0,
  input_tokens       BIGINT      NOT NULL DEFAULT 0,
  output_tokens      BIGINT      NOT NULL DEFAULT 0,
  calls_without_usage BIGINT     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON user_spend TO recovery_app;
