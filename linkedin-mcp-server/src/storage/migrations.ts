/**
 * Versioned SQLite migrations, applied idempotently on startup.
 *
 * Each migration runs at most once, tracked in `schema_migrations`. Add new
 * migrations by appending to the `migrations` array below - never edit an
 * already-shipped migration's SQL.
 */
import type Database from "better-sqlite3";

interface Migration {
  id: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: "0001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS social_connections (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          account_id TEXT NOT NULL,
          account_name TEXT,
          author_urn TEXT NOT NULL,
          encrypted_access_token TEXT NOT NULL,
          encrypted_refresh_token TEXT,
          scopes_json TEXT NOT NULL,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_states (
          state_hash TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_drafts (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          account_id TEXT NOT NULL,
          author_urn TEXT NOT NULL,
          text TEXT NOT NULL,
          media_path TEXT,
          media_sha256 TEXT,
          status TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          approved_version INTEGER,
          approved_text_sha256 TEXT,
          approved_media_sha256 TEXT,
          approved_by TEXT,
          approved_at TEXT,
          published_post_id TEXT,
          published_url TEXT,
          publish_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_social_drafts_status ON social_drafts(status);
      CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections(platform);
    `,
  },
];

export function applyMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const alreadyApplied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map(
      (row) => row.id,
    ),
  );

  const markApplied = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (alreadyApplied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      markApplied.run(migration.id, new Date().toISOString());
    })();
  }
}
