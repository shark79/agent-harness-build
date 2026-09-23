import { getConnection } from "../storage/connections.js";
import type { AppContext } from "./context.js";

export interface ConnectionStatusResult {
  connected: boolean;
  displayName?: string;
  authorUrn?: string;
  expiresAt?: string | null;
  authorizationUrl: string | null;
}

export async function getLinkedInConnection(ctx: AppContext): Promise<ConnectionStatusResult> {
  const connection = getConnection(ctx.db, "linkedin");
  if (!connection) {
    return {
      connected: false,
      authorizationUrl: `${ctx.config.publicUrl}/oauth/linkedin/start`,
    };
  }
  return {
    connected: true,
    displayName: connection.accountName ?? undefined,
    authorUrn: connection.authorUrn,
    expiresAt: connection.expiresAt,
    authorizationUrl: null,
  };
}
