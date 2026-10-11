import { randomToken } from "../auth/crypto.js";
import { decrypt, encrypt } from "../auth/crypto.js";
import type { Db } from "../persistence/pool.js";

export const TEST_KEY_PREFIX = "rzp_test_";

export type TenantCredentials = {
  userId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  webhookToken: string;
};

type CredentialRow = {
  user_id: string;
  key_id: string;
  key_secret_enc: string;
  webhook_secret_enc: string;
  webhook_token: string;
};

export class CredentialStore {
  constructor(
    private readonly db: Db,
    private readonly vaultKey: Buffer,
  ) {}

  async save(userId: string, keyId: string, keySecret: string): Promise<TenantCredentials> {
    const webhookSecret = randomToken(24);
    const webhookToken = randomToken(18);
    await this.db.query(
      `INSERT INTO tenant_credentials (user_id, key_id, key_secret_enc, webhook_secret_enc, webhook_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET key_id = EXCLUDED.key_id, key_secret_enc = EXCLUDED.key_secret_enc,
             webhook_secret_enc = EXCLUDED.webhook_secret_enc, webhook_token = EXCLUDED.webhook_token,
             updated_at = now()`,
      [userId, keyId, encrypt(this.vaultKey, keySecret), encrypt(this.vaultKey, webhookSecret), webhookToken],
    );
    return { userId, keyId, keySecret, webhookSecret, webhookToken };
  }

  async forUser(userId: string): Promise<TenantCredentials | null> {
    const { rows } = await this.db.query("SELECT * FROM tenant_credentials WHERE user_id = $1", [userId]);
    return rows.length ? this.open(rows[0]) : null;
  }

  async forWebhookToken(token: string): Promise<TenantCredentials | null> {
    const { rows } = await this.db.query("SELECT * FROM tenant_credentials WHERE webhook_token = $1", [token]);
    return rows.length ? this.open(rows[0]) : null;
  }

  async remove(userId: string): Promise<void> {
    await this.db.query("DELETE FROM tenant_credentials WHERE user_id = $1", [userId]);
  }

  private open(row: CredentialRow): TenantCredentials {
    return {
      userId: row.user_id,
      keyId: row.key_id,
      keySecret: decrypt(this.vaultKey, row.key_secret_enc),
      webhookSecret: decrypt(this.vaultKey, row.webhook_secret_enc),
      webhookToken: row.webhook_token,
    };
  }
}

export async function verifyRazorpayKeys(keyId: string, keySecret: string): Promise<boolean> {
  const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
    headers: { authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64") },
  });
  return res.ok;
}
