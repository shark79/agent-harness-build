import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import type { Config } from "../config.js";
import type { PlatformAdapter } from "../platforms/types.js";
import { deleteConnection, saveConnection } from "../storage/connections.js";
import { getConnection } from "../storage/connections.js";
import { encrypt } from "../storage/encryption.js";
import { consumeOAuthState, createOAuthState } from "../storage/oauthStates.js";
import { sha256Text } from "../util/hash.js";

const PLATFORM = "linkedin";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMessagePage(message: string): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>LinkedIn connection</title></head>
  <body>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`;
}

export interface OAuthRouterDeps {
  config: Config;
  db: Database.Database;
  adapter: PlatformAdapter;
}

export function createLinkedInOAuthRouter(deps: OAuthRouterDeps): Router {
  const router = Router();
  const { config, db, adapter } = deps;

  router.get("/start", (_req: Request, res: Response) => {
    const state = randomBytes(32).toString("hex");
    const stateHash = sha256Text(state);
    const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
    createOAuthState(db, { stateHash, platform: PLATFORM, expiresAt });
    res.redirect(adapter.buildAuthorizationUrl(state));
  });

  router.get("/callback", async (req: Request, res: Response) => {
    const { error, error_description: errorDescription, code, state } = req.query;

    if (typeof error === "string") {
      res
        .status(400)
        .send(
          renderMessagePage(
            `LinkedIn authorization failed: ${error}${
              typeof errorDescription === "string" ? " - " + errorDescription : ""
            }. You may close this page and try again from /oauth/linkedin/start.`,
          ),
        );
      return;
    }

    if (typeof code !== "string" || typeof state !== "string" || !code || !state) {
      res.status(400).send(renderMessagePage("Missing code or state parameter. You may close this page and try again."));
      return;
    }

    const stateHash = sha256Text(state);
    const consumeResult = consumeOAuthState(db, { stateHash, platform: PLATFORM });
    if (!consumeResult.ok) {
      res
        .status(400)
        .send(
          renderMessagePage(
            "This authorization link is invalid, expired, or already used. Please restart the connection from /oauth/linkedin/start.",
          ),
        );
      return;
    }

    try {
      const token = await adapter.exchangeAuthorizationCode(code);
      const identity = await adapter.fetchIdentity(token.accessToken);
      const encryptedAccessToken = encrypt(token.accessToken, config.tokenEncryptionKey);
      const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

      saveConnection(db, {
        platform: PLATFORM,
        accountId: identity.externalAccountId,
        accountName: identity.displayName,
        authorUrn: identity.authorUrn,
        encryptedAccessToken,
        encryptedRefreshToken: null,
        scopes: token.scope.split(" ").filter(Boolean),
        expiresAt,
      });

      res.status(200).send(renderMessagePage("LinkedIn connected successfully. You may close this page."));
    } catch {
      // Never surface the raw upstream error (may contain sensitive details) to the browser.
      res
        .status(502)
        .send(
          renderMessagePage(
            "Could not complete the LinkedIn connection. Please try again from /oauth/linkedin/start.",
          ),
        );
    }
  });

  router.get("/status", (_req: Request, res: Response) => {
    const connection = getConnection(db, PLATFORM);
    if (!connection) {
      res.json({ connected: false });
      return;
    }
    res.json({
      connected: true,
      displayName: connection.accountName ?? undefined,
      authorUrn: connection.authorUrn,
      scopes: connection.scopes,
      expiresAt: connection.expiresAt,
    });
  });

  router.post("/disconnect", (_req: Request, res: Response) => {
    deleteConnection(db, PLATFORM);
    res.status(200).json({ disconnected: true });
  });

  return router;
}
