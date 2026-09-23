/**
 * Startup configuration loading + validation.
 *
 * Fails fast with a clear, single-line message (not a stack trace) when anything
 * required is missing or malformed - see index.ts for how this is surfaced.
 */

export interface Config {
  host: string;
  port: number;
  publicUrl: string;
  linkedin: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    /** LinkedIn-Version header value, e.g. "202509". Always read from env, never hardcoded elsewhere. */
    version: string;
  };
  /** Decoded 32-byte AES-256-GCM key. Never derived from the LinkedIn client secret. */
  tokenEncryptionKey: Buffer;
  databasePath: string;
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(
      `Missing required environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function parsePort(env: NodeJS.ProcessEnv): number {
  const raw = required(env, "SOCIAL_MCP_PORT");
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError(
      `SOCIAL_MCP_PORT must be a valid TCP port number, got "${raw}".`,
    );
  }
  return port;
}

function parseLinkedinVersion(env: NodeJS.ProcessEnv): string {
  const version = required(env, "LINKEDIN_VERSION");
  if (!/^\d{6}$/.test(version)) {
    throw new ConfigError(
      `LINKEDIN_VERSION must be exactly 6 digits in YYYYMM format (e.g. 202509), got "${version}".`,
    );
  }
  return version;
}

function parseEncryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const raw = required(env, "TOKEN_ENCRYPTION_KEY");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new ConfigError("TOKEN_ENCRYPTION_KEY must be valid base64.");
  }
  if (decoded.byteLength !== 32) {
    throw new ConfigError(
      `TOKEN_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256-GCM, got ${decoded.byteLength} bytes. Generate one with: openssl rand -base64 32`,
    );
  }
  return decoded;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.SOCIAL_MCP_HOST?.trim() || "127.0.0.1",
    port: parsePort(env),
    publicUrl: required(env, "SOCIAL_MCP_PUBLIC_URL"),
    linkedin: {
      clientId: required(env, "LINKEDIN_CLIENT_ID"),
      clientSecret: required(env, "LINKEDIN_CLIENT_SECRET"),
      redirectUri: required(env, "LINKEDIN_REDIRECT_URI"),
      version: parseLinkedinVersion(env),
    },
    tokenEncryptionKey: parseEncryptionKey(env),
    databasePath: env.SOCIAL_DATABASE_PATH?.trim() || "./data/social-publisher.sqlite",
  };
}
