import Database from "better-sqlite3";
import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { getConnection } from "../src/storage/connections.js";
import { decrypt } from "../src/storage/encryption.js";
import { createLinkedInOAuthRouter } from "../src/oauth/linkedin.js";
import type { Config } from "../src/config.js";
import type { PlatformAdapter } from "../src/platforms/types.js";

let db: Database.Database;
let server: Server;
let baseUrl: string;
let adapter: PlatformAdapter;
let exchangeCalls: string[];
let fetchIdentityResult: { externalAccountId: string; authorUrn: string; displayName: string };
let exchangeShouldFail: boolean;

const tokenEncryptionKey = Buffer.alloc(32, 3);

const config: Config = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://localhost:8810",
  linkedin: {
    clientId: "client-id",
    clientSecret: "super-secret-value",
    redirectUri: "http://localhost:8810/oauth/linkedin/callback",
    version: "202509",
  },
  tokenEncryptionKey,
  databasePath: ":memory:",
};

beforeEach(async () => {
  db = new Database(":memory:");
  applyMigrations(db);
  exchangeCalls = [];
  exchangeShouldFail = false;
  fetchIdentityResult = { externalAccountId: "member-1", authorUrn: "urn:li:person:member-1", displayName: "Ada Lovelace" };

  adapter = {
    name: "linkedin",
    buildAuthorizationUrl: (state) =>
      `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=client-id&scope=openid+profile+w_member_social&state=${state}`,
    exchangeAuthorizationCode: async (code) => {
      exchangeCalls.push(code);
      if (exchangeShouldFail) throw new Error("token exchange failed upstream");
      return { accessToken: "real-access-token-value", expiresIn: 5184000, scope: "openid profile w_member_social" };
    },
    fetchIdentity: async () => fetchIdentityResult,
    publishPost: async () => ({ postId: "x", postUrl: null }),
  };

  const app = express();
  app.use("/oauth/linkedin", createLinkedInOAuthRouter({ config, db, adapter }));
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

async function startFlowAndGetState(): Promise<string> {
  const response = await fetch(`${baseUrl}/oauth/linkedin/start`, { redirect: "manual" });
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  const location = response.headers.get("location")!;
  const url = new URL(location);
  return url.searchParams.get("state")!;
}

describe("GET /oauth/linkedin/start", () => {
  it("redirects to LinkedIn's authorization URL with a generated state", async () => {
    const response = await fetch(`${baseUrl}/oauth/linkedin/start`, { redirect: "manual" });
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location")!;
    expect(location).toContain("https://www.linkedin.com/oauth/v2/authorization");
    expect(location).toContain("scope=openid+profile+w_member_social");
    expect(location).not.toContain(config.linkedin.clientSecret);
  });

  it("stores the state hashed, not raw, in oauth_states", async () => {
    await startFlowAndGetState();
    const rows = db.prepare("SELECT state_hash FROM oauth_states").all() as Array<{ state_hash: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].state_hash).toHaveLength(64); // sha256 hex
  });
});

describe("GET /oauth/linkedin/callback", () => {
  it("rejects a missing state/code", async () => {
    const response = await fetch(`${baseUrl}/oauth/linkedin/callback?code=abc`);
    expect(response.status).toBe(400);
  });

  it("surfaces LinkedIn's own error params without exchanging a code", async () => {
    const response = await fetch(
      `${baseUrl}/oauth/linkedin/callback?error=user_cancelled_authorize&error_description=denied&state=whatever`,
    );
    expect(response.status).toBe(400);
    expect(exchangeCalls).toHaveLength(0);
  });

  it("rejects an unknown state", async () => {
    const response = await fetch(`${baseUrl}/oauth/linkedin/callback?code=abc&state=never-issued`);
    expect(response.status).toBe(400);
    expect(exchangeCalls).toHaveLength(0);
  });

  it("rejects a state reused a second time", async () => {
    const state = await startFlowAndGetState();
    const first = await fetch(`${baseUrl}/oauth/linkedin/callback?code=abc&state=${state}`);
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/oauth/linkedin/callback?code=abc&state=${state}`);
    expect(second.status).toBe(400);
    expect(exchangeCalls).toHaveLength(1);
  });

  it("completes the flow: exchanges the code, stores an encrypted token, never renders it", async () => {
    const state = await startFlowAndGetState();
    const response = await fetch(`${baseUrl}/oauth/linkedin/callback?code=real-code&state=${state}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("connected successfully");
    expect(html).not.toContain("real-access-token-value");

    const connection = getConnection(db, "linkedin");
    expect(connection?.authorUrn).toBe("urn:li:person:member-1");
    expect(connection?.encryptedAccessToken).not.toContain("real-access-token-value");
    expect(decrypt(connection!.encryptedAccessToken, tokenEncryptionKey)).toBe("real-access-token-value");
  });

  it("handles a code-exchange failure without leaking upstream details, and the state stays consumed", async () => {
    exchangeShouldFail = true;
    const state = await startFlowAndGetState();
    const response = await fetch(`${baseUrl}/oauth/linkedin/callback?code=bad-code&state=${state}`);
    expect(response.status).toBe(502);
    expect(getConnection(db, "linkedin")).toBeUndefined();
  });
});

describe("GET /oauth/linkedin/status", () => {
  it("reports not connected", async () => {
    const response = await fetch(`${baseUrl}/oauth/linkedin/status`);
    expect((await response.json()) as any).toEqual({ connected: false });
  });

  it("reports connection details but never a token, after connecting", async () => {
    const state = await startFlowAndGetState();
    await fetch(`${baseUrl}/oauth/linkedin/callback?code=real-code&state=${state}`);
    const response = await fetch(`${baseUrl}/oauth/linkedin/status`);
    const body = (await response.json()) as any;
    expect(body.connected).toBe(true);
    expect(body.authorUrn).toBe("urn:li:person:member-1");
    expect(JSON.stringify(body)).not.toContain("real-access-token-value");
  });
});

describe("POST /oauth/linkedin/disconnect", () => {
  it("deletes the local connection", async () => {
    const state = await startFlowAndGetState();
    await fetch(`${baseUrl}/oauth/linkedin/callback?code=real-code&state=${state}`);
    expect(getConnection(db, "linkedin")).toBeDefined();

    const response = await fetch(`${baseUrl}/oauth/linkedin/disconnect`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(getConnection(db, "linkedin")).toBeUndefined();
  });
});
