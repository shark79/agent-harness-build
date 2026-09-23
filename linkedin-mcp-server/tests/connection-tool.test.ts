import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { saveConnection } from "../src/storage/connections.js";
import type { AppContext } from "../src/tools/context.js";
import type { PlatformAdapter } from "../src/platforms/types.js";
import { getLinkedInConnection } from "../src/tools/connection.js";

let db: Database.Database;
let ctx: AppContext;

const adapter: PlatformAdapter = {
  name: "linkedin",
  buildAuthorizationUrl: () => "unused",
  exchangeAuthorizationCode: async () => ({ accessToken: "t", expiresIn: 1, scope: "" }),
  fetchIdentity: async () => ({ externalAccountId: "1", authorUrn: "urn:li:person:1", displayName: "x" }),
  publishPost: async () => ({ postId: "x", postUrl: null }),
};

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
  ctx = {
    config: {
      host: "127.0.0.1",
      port: 8810,
      publicUrl: "http://localhost:8810",
      linkedin: { clientId: "a", clientSecret: "b", redirectUri: "c", version: "202509" },
      tokenEncryptionKey: Buffer.alloc(32),
      databasePath: ":memory:",
    },
    db,
    adapter,
    mediaRoot: "/tmp",
  };
});

afterEach(() => db.close());

describe("get_linkedin_connection", () => {
  it("reports not connected with an authorizationUrl pointing at /oauth/linkedin/start", async () => {
    const result = await getLinkedInConnection(ctx);
    expect(result).toEqual({
      connected: false,
      authorizationUrl: "http://localhost:8810/oauth/linkedin/start",
    });
  });

  it("reports connected details and a null authorizationUrl, with no token fields", async () => {
    saveConnection(db, {
      platform: "linkedin",
      accountId: "member-1",
      accountName: "Ada Lovelace",
      authorUrn: "urn:li:person:member-1",
      encryptedAccessToken: "iv.tag.ct",
      encryptedRefreshToken: null,
      scopes: ["openid", "profile", "w_member_social"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const result = await getLinkedInConnection(ctx);
    expect(result).toEqual({
      connected: true,
      displayName: "Ada Lovelace",
      authorUrn: "urn:li:person:member-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
      authorizationUrl: null,
    });
    expect(JSON.stringify(result)).not.toContain("iv.tag.ct");
  });
});
