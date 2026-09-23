import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const validKey = Buffer.alloc(32, 7).toString("base64");

function baseEnv(): NodeJS.ProcessEnv {
  return {
    SOCIAL_MCP_HOST: "127.0.0.1",
    SOCIAL_MCP_PORT: "8810",
    SOCIAL_MCP_PUBLIC_URL: "http://localhost:8810",
    LINKEDIN_CLIENT_ID: "client-id",
    LINKEDIN_CLIENT_SECRET: "client-secret",
    LINKEDIN_REDIRECT_URI: "http://localhost:8810/oauth/linkedin/callback",
    LINKEDIN_VERSION: "202509",
    TOKEN_ENCRYPTION_KEY: validKey,
    SOCIAL_DATABASE_PATH: "./data/social-publisher.sqlite",
  };
}

describe("loadConfig", () => {
  it("loads a valid, complete environment", () => {
    const config = loadConfig(baseEnv());
    expect(config.linkedin.version).toBe("202509");
    expect(config.port).toBe(8810);
    expect(config.tokenEncryptionKey.byteLength).toBe(32);
  });

  it("throws a clear (non-stack-trace) error when a required var is missing", () => {
    const env = baseEnv();
    delete env.LINKEDIN_CLIENT_ID;
    expect(() => loadConfig(env)).toThrowError(/LINKEDIN_CLIENT_ID/);
  });

  it("rejects a LINKEDIN_VERSION that isn't exactly 6 digits", () => {
    const env = baseEnv();
    env.LINKEDIN_VERSION = "2025-09";
    expect(() => loadConfig(env)).toThrowError(/LINKEDIN_VERSION/);
  });

  it("rejects a LINKEDIN_VERSION with the wrong digit count", () => {
    const env = baseEnv();
    env.LINKEDIN_VERSION = "20259";
    expect(() => loadConfig(env)).toThrowError(/LINKEDIN_VERSION/);
  });

  it("rejects a TOKEN_ENCRYPTION_KEY that isn't 32 bytes once base64-decoded", () => {
    const env = baseEnv();
    env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => loadConfig(env)).toThrowError(/TOKEN_ENCRYPTION_KEY/);
  });

  it("rejects a non-numeric SOCIAL_MCP_PORT", () => {
    const env = baseEnv();
    env.SOCIAL_MCP_PORT = "not-a-port";
    expect(() => loadConfig(env)).toThrowError(/SOCIAL_MCP_PORT/);
  });
});
