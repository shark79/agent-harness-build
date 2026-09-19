import { timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

export type ConsumeStateResult =
  | { ok: true }
  | { ok: false; reason: "unknown" | "expired" | "already_consumed" };

function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual requires equal-length buffers; differing length is a
  // legitimate (and safe to short-circuit on) non-match.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createOAuthState(
  db: Database.Database,
  input: { stateHash: string; platform: string; expiresAt: string },
): void {
  db.prepare(
    `INSERT INTO oauth_states (state_hash, platform, expires_at, consumed_at, created_at)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(input.stateHash, input.platform, input.expiresAt, new Date().toISOString());
}

/**
 * Finds the matching state via a constant-time comparison of the hash (not a
 * naive `===`/SQL `WHERE state_hash = ?` string match) and then atomically
 * consumes it (a `WHERE consumed_at IS NULL` conditional UPDATE keyed on the
 * now-confirmed row, guarding against a second concurrent consume of the same
 * state). Local-scale table (a handful of pending states at most), so
 * scanning all not-yet-expired rows for the platform is cheap.
 */
export function consumeOAuthState(
  db: Database.Database,
  input: { stateHash: string; platform: string },
): ConsumeStateResult {
  const now = new Date().toISOString();
  const candidates = db
    .prepare(`SELECT state_hash, expires_at, consumed_at FROM oauth_states WHERE platform = ?`)
    .all(input.platform) as Array<{
    state_hash: string;
    expires_at: string;
    consumed_at: string | null;
  }>;

  const match = candidates.find((row) => hashesMatch(row.state_hash, input.stateHash));
  if (!match) return { ok: false, reason: "unknown" };
  if (match.consumed_at) return { ok: false, reason: "already_consumed" };
  if (match.expires_at <= now) return { ok: false, reason: "expired" };

  const result = db
    .prepare(`UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL`)
    .run(now, match.state_hash);

  return result.changes > 0 ? { ok: true } : { ok: false, reason: "already_consumed" };
}
