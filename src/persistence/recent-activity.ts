import type { StoredEvent } from "../domain/events.js";
import { recoveryEventType } from "../domain/events.js";
import type { Db } from "./pool.js";

export interface RecentActivity {
  forMerchant(merchantRef: string, limit: number): Promise<StoredEvent[]>;
}

export class PostgresRecentActivity implements RecentActivity {
  constructor(private readonly db: Db) {}

  async forMerchant(merchantRef: string, limit: number): Promise<StoredEvent[]> {
    const { rows } = await this.db.query(
      `SELECT e.id, e.case_id, e.type, e.payload, e.created_at
         FROM recovery_events e
         JOIN recovery_cases c ON c.id = e.case_id
        WHERE c.merchant_ref = $1 AND c.run_id IS NULL
        ORDER BY e.id DESC
        LIMIT $2`,
      [merchantRef, limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      caseId: r.case_id,
      type: recoveryEventType.parse(r.type),
      payload: r.payload,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }
}
