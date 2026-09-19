import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { deleteConnection, getConnection, saveConnection } from "../src/storage/connections.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
});

afterEach(() => {
  db.close();
});

const baseInput = {
  platform: "linkedin",
  accountId: "member-123",
  accountName: "Ada Lovelace",
  authorUrn: "urn:li:person:member-123",
  encryptedAccessToken: "iv.tag.ciphertext",
  encryptedRefreshToken: null,
  scopes: ["openid", "profile", "w_member_social"],
  expiresAt: new Date(Date.now() + 1000).toISOString(),
};

describe("connections repository", () => {
  it("returns undefined when there is no connection yet", () => {
    expect(getConnection(db, "linkedin")).toBeUndefined();
  });

  it("saves and retrieves a connection, storing scopes as JSON", () => {
    saveConnection(db, baseInput);
    const connection = getConnection(db, "linkedin");
    expect(connection?.authorUrn).toBe("urn:li:person:member-123");
    expect(connection?.scopes).toEqual(["openid", "profile", "w_member_social"]);
    expect(connection?.encryptedAccessToken).toBe("iv.tag.ciphertext");
  });

  it("replaces a prior connection for the same platform on reconnect", () => {
    saveConnection(db, baseInput);
    saveConnection(db, { ...baseInput, accountId: "member-456", authorUrn: "urn:li:person:member-456" });

    const connection = getConnection(db, "linkedin");
    expect(connection?.accountId).toBe("member-456");

    const all = db.prepare("SELECT COUNT(*) as count FROM social_connections").get() as {
      count: number;
    };
    expect(all.count).toBe(1);
  });

  it("deletes a connection and reports whether a row was removed", () => {
    saveConnection(db, baseInput);
    expect(deleteConnection(db, "linkedin")).toBe(true);
    expect(getConnection(db, "linkedin")).toBeUndefined();
    expect(deleteConnection(db, "linkedin")).toBe(false);
  });
});
