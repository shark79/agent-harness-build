import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/storage/db.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe("openDatabase", () => {
  it("creates the parent directory and a migrated database file", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "social-mcp-db-"));
    const dbPath = join(tmpDir, "nested", "social-publisher.sqlite");

    const db = openDatabase(dbPath);
    try {
      expect(existsSync(dbPath)).toBe(true);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(["social_connections", "oauth_states", "social_drafts"]),
      );
    } finally {
      db.close();
    }
  });
});
