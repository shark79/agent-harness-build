import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface Connection {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  authorUrn: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewConnectionInput {
  platform: string;
  accountId: string;
  accountName: string | null;
  authorUrn: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
}

interface ConnectionRow {
  id: string;
  platform: string;
  account_id: string;
  account_name: string | null;
  author_urn: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  scopes_json: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    accountName: row.account_name,
    authorUrn: row.author_urn,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token,
    scopes: JSON.parse(row.scopes_json) as string[],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Replaces any existing connection for the platform (single-operator, one connection per platform). */
export function saveConnection(db: Database.Database, input: NewConnectionInput): Connection {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(`DELETE FROM social_connections WHERE platform = ?`).run(input.platform);
    db.prepare(
      `INSERT INTO social_connections (
        id, platform, account_id, account_name, author_urn,
        encrypted_access_token, encrypted_refresh_token, scopes_json,
        expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.platform,
      input.accountId,
      input.accountName,
      input.authorUrn,
      input.encryptedAccessToken,
      input.encryptedRefreshToken,
      JSON.stringify(input.scopes),
      input.expiresAt,
      now,
      now,
    );
  })();
  return getConnection(db, input.platform)!;
}

export function getConnection(db: Database.Database, platform: string): Connection | undefined {
  const row = db
    .prepare(`SELECT * FROM social_connections WHERE platform = ?`)
    .get(platform) as ConnectionRow | undefined;
  return row ? toConnection(row) : undefined;
}

export function deleteConnection(db: Database.Database, platform: string): boolean {
  const result = db.prepare(`DELETE FROM social_connections WHERE platform = ?`).run(platform);
  return result.changes > 0;
}
