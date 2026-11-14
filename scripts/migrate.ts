import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? "db/migrations");
const MIGRATION_FILE = /^\d+_.+\.sql$/;
const ADVISORY_LOCK_KEY = 727_001;

const url = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("ADMIN_DATABASE_URL or DATABASE_URL is required");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied = new Set(
    (await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
  );

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => MIGRATION_FILE.test(f)).sort();
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed`, { cause: err });
    }
    console.log(`applied ${file}`);
    ran += 1;
  }
  console.log(ran === 0 ? "database is up to date" : `applied ${ran} migration(s)`);
} finally {
  await client.end();
}
