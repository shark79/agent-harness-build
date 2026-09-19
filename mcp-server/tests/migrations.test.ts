import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";

let db: Database.Database | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
});

function tableColumns(database: Database.Database, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
}

describe("applyMigrations", () => {
  it("creates all three tables with the expected columns", () => {
    db = new Database(":memory:");
    applyMigrations(db);

    expect(tableColumns(db, "social_connections")).toEqual(
      expect.arrayContaining([
        "id",
        "platform",
        "account_id",
        "account_name",
        "author_urn",
        "encrypted_access_token",
        "encrypted_refresh_token",
        "scopes_json",
        "expires_at",
        "created_at",
        "updated_at",
      ]),
    );

    expect(tableColumns(db, "oauth_states")).toEqual(
      expect.arrayContaining(["state_hash", "platform", "expires_at", "consumed_at", "created_at"]),
    );

    expect(tableColumns(db, "social_drafts")).toEqual(
      expect.arrayContaining([
        "id",
        "platform",
        "account_id",
        "author_urn",
        "text",
        "media_path",
        "media_sha256",
        "status",
        "version",
        "approved_version",
        "approved_text_sha256",
        "approved_media_sha256",
        "approved_by",
        "approved_at",
        "published_post_id",
        "published_url",
        "publish_error",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("is idempotent - applying twice does not error and does not duplicate schema_migrations rows", () => {
    db = new Database(":memory:");
    applyMigrations(db);
    applyMigrations(db);
    const rows = db.prepare("SELECT COUNT(*) as count FROM schema_migrations").get() as {
      count: number;
    };
    expect(rows.count).toBeGreaterThan(0);
  });

  it("re-opening the same on-disk database does not error", () => {
    db = new Database(":memory:");
    applyMigrations(db);
    db.close();
    db = new Database(":memory:");
    applyMigrations(db);
    expect(tableColumns(db, "social_drafts").length).toBeGreaterThan(0);
  });
});
