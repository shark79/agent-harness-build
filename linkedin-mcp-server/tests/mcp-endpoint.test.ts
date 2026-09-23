import Database from "better-sqlite3";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { createApp } from "../src/server.js";
import type { AppContext } from "../src/tools/context.js";
import type { PlatformAdapter } from "../src/platforms/types.js";
import type { Config } from "../src/config.js";

let db: Database.Database;
let server: Server;
let baseUrl: string;

const config: Config = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://localhost:8810",
  linkedin: {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "http://localhost:8810/oauth/linkedin/callback",
    version: "202509",
  },
  tokenEncryptionKey: Buffer.alloc(32, 9),
  databasePath: ":memory:",
};

const adapter: PlatformAdapter = {
  name: "linkedin",
  buildAuthorizationUrl: () => "https://www.linkedin.com/oauth/v2/authorization?unused=1",
  exchangeAuthorizationCode: async () => ({ accessToken: "t", expiresIn: 1, scope: "" }),
  fetchIdentity: async () => ({ externalAccountId: "1", authorUrn: "urn:li:person:1", displayName: "x" }),
  publishPost: async () => ({ postId: "x", postUrl: null }),
};

beforeEach(async () => {
  db = new Database(":memory:");
  applyMigrations(db);
  const ctx: AppContext = { config, db, adapter, mediaRoot: "/tmp" };
  const app = createApp(ctx);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  db.close();
  await new Promise((resolve) => server.close(resolve));
});

describe("POST /mcp", () => {
  it("responds to an MCP initialize handshake", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.0.1" },
        },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.result.serverInfo.name).toBe("linkedin-social-publisher");
  });

  it("lists all 9 LinkedIn tools", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "approve_linkedin_draft",
        "create_linkedin_draft",
        "get_linkedin_connection",
        "get_linkedin_draft",
        "get_publish_status",
        "list_linkedin_drafts",
        "publish_linkedin_draft",
        "reject_linkedin_draft",
        "update_linkedin_draft",
      ].sort(),
    );
  });

  it("marks publish_linkedin_draft with a destructive annotation", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    const body = (await response.json()) as any;
    const publishTool = (body.result.tools as Array<{ name: string; annotations?: { destructiveHint?: boolean } }>).find(
      (t) => t.name === "publish_linkedin_draft",
    );
    expect(publishTool?.annotations?.destructiveHint).toBe(true);
  });
});

describe("GET /mcp", () => {
  it("returns 405 (stateless server, no GET stream)", async () => {
    const response = await fetch(`${baseUrl}/mcp`);
    expect(response.status).toBe(405);
  });
});
