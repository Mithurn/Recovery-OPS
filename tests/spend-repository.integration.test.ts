import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Db } from "../src/persistence/pool.js";
import { PostgresSpendRepository } from "../src/persistence/spend-repository.js";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;

describe.runIf(appUrl && adminUrl)("PostgresSpendRepository", () => {
  let app: Db;
  let admin: Db;
  let userId: string;

  beforeAll(async () => {
    app = createPool(appUrl!);
    admin = createPool(adminUrl!);
    userId = randomUUID();
    await admin.query("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `spend_${userId}@example.com`]);
  });

  afterAll(async () => {
    await admin.query("DELETE FROM users WHERE id = $1", [userId]);
    await app.end();
    await admin.end();
  });

  it("returns null for a user with no recorded spend", async () => {
    expect(await new PostgresSpendRepository(app).load(userId)).toBeNull();
  });

  it("round-trips a snapshot as the app role", async () => {
    const repo = new PostgresSpendRepository(app);
    const snapshot = { usdUsed: 0.42, calls: 5, inputTokens: 1000, outputTokens: 200, callsWithoutUsage: 1 };
    await repo.save(userId, snapshot);
    expect(await repo.load(userId)).toEqual(snapshot);
  });

  it("never lowers recorded spend on a stale write", async () => {
    const repo = new PostgresSpendRepository(app);
    await repo.save(userId, { usdUsed: 1, calls: 10, inputTokens: 2000, outputTokens: 400, callsWithoutUsage: 2 });
    await repo.save(userId, { usdUsed: 0.1, calls: 1, inputTokens: 1, outputTokens: 1, callsWithoutUsage: 0 });
    expect(await repo.load(userId)).toMatchObject({ usdUsed: 1, calls: 10, callsWithoutUsage: 2 });
  });
});
