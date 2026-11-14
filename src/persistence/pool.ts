import pg from "pg";
import { RUNTIME_DEFAULTS } from "../config.js";

export type Db = pg.Pool;

export type PoolOptions = {
  max?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
};

// BIGINT arrives as a string by default; every bigint column here is paise and fits in a Number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export function createPool(connectionString: string, options: PoolOptions = {}): Db {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? RUNTIME_DEFAULTS.pgPoolMax,
    idleTimeoutMillis: options.idleTimeoutMs ?? RUNTIME_DEFAULTS.pgIdleTimeoutMs,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? RUNTIME_DEFAULTS.pgConnectionTimeoutMs,
    statement_timeout: options.statementTimeoutMs ?? RUNTIME_DEFAULTS.pgStatementTimeoutMs,
  });
  pool.on("error", (err) => {
    console.error("postgres idle client error", err);
  });
  return pool;
}
