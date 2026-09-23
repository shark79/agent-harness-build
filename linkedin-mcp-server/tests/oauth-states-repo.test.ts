import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { createOAuthState, consumeOAuthState } from "../src/storage/oauthStates.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
});

afterEach(() => {
  db.close();
});

const FUTURE = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

describe("oauth state store", () => {
  it("consumes a freshly created, unexpired state exactly once", () => {
    createOAuthState(db, { stateHash: "hash-a", platform: "linkedin", expiresAt: FUTURE });

    const first = consumeOAuthState(db, { stateHash: "hash-a", platform: "linkedin" });
    expect(first.ok).toBe(true);

    const second = consumeOAuthState(db, { stateHash: "hash-a", platform: "linkedin" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_consumed");
  });

  it("rejects an unknown state hash", () => {
    const result = consumeOAuthState(db, { stateHash: "never-created", platform: "linkedin" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown");
  });

  it("rejects an expired state", () => {
    createOAuthState(db, { stateHash: "hash-expired", platform: "linkedin", expiresAt: PAST });
    const result = consumeOAuthState(db, { stateHash: "hash-expired", platform: "linkedin" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });
});
