import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type DraftStatus =
  | "draft"
  | "awaiting_review"
  | "approved"
  | "publishing"
  | "published"
  | "rejected"
  | "failed";

export interface Draft {
  id: string;
  platform: string;
  accountId: string;
  authorUrn: string;
  text: string;
  mediaPath: string | null;
  mediaSha256: string | null;
  status: DraftStatus;
  version: number;
  approvedVersion: number | null;
  approvedTextSha256: string | null;
  approvedMediaSha256: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedPostId: string | null;
  publishedUrl: string | null;
  publishError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDraftInput {
  platform: string;
  accountId: string;
  authorUrn: string;
  text: string;
  mediaPath: string | null;
  mediaSha256: string | null;
}

interface DraftRow {
  id: string;
  platform: string;
  account_id: string;
  author_urn: string;
  text: string;
  media_path: string | null;
  media_sha256: string | null;
  status: DraftStatus;
  version: number;
  approved_version: number | null;
  approved_text_sha256: string | null;
  approved_media_sha256: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_post_id: string | null;
  published_url: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

function toDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    authorUrn: row.author_urn,
    text: row.text,
    mediaPath: row.media_path,
    mediaSha256: row.media_sha256,
    status: row.status,
    version: row.version,
    approvedVersion: row.approved_version,
    approvedTextSha256: row.approved_text_sha256,
    approvedMediaSha256: row.approved_media_sha256,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    publishedPostId: row.published_post_id,
    publishedUrl: row.published_url,
    publishError: row.publish_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraft(db: Database.Database, input: NewDraftInput): Draft {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO social_drafts (
      id, platform, account_id, author_urn, text, media_path, media_sha256,
      status, version, approved_version, approved_text_sha256, approved_media_sha256,
      approved_by, approved_at, published_post_id, published_url, publish_error,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_review', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
  ).run(
    id,
    input.platform,
    input.accountId,
    input.authorUrn,
    input.text,
    input.mediaPath,
    input.mediaSha256,
    now,
    now,
  );
  return getDraft(db, id)!;
}

export function getDraft(db: Database.Database, id: string): Draft | undefined {
  const row = db.prepare(`SELECT * FROM social_drafts WHERE id = ?`).get(id) as
    | DraftRow
    | undefined;
  return row ? toDraft(row) : undefined;
}

export function listDrafts(
  db: Database.Database,
  filter: { status?: DraftStatus },
): Draft[] {
  const rows = filter.status
    ? (db
        .prepare(`SELECT * FROM social_drafts WHERE status = ? ORDER BY created_at DESC`)
        .all(filter.status) as DraftRow[])
    : (db.prepare(`SELECT * FROM social_drafts ORDER BY created_at DESC`).all() as DraftRow[]);
  return rows.map(toDraft);
}

export function updateDraftContent(
  db: Database.Database,
  id: string,
  changes: { text?: string; mediaPath?: string | null; mediaSha256?: string | null },
): Draft | undefined {
  const existing = getDraft(db, id);
  if (!existing) return undefined;

  const nextText = changes.text ?? existing.text;
  // `undefined` means "leave as-is"; an explicit `null` clears the attachment.
  const nextMediaPath = changes.mediaPath !== undefined ? changes.mediaPath : existing.mediaPath;
  const nextMediaSha256 =
    changes.mediaSha256 !== undefined ? changes.mediaSha256 : existing.mediaSha256;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE social_drafts
     SET text = ?,
         media_path = ?,
         media_sha256 = ?,
         version = version + 1,
         approved_version = NULL,
         approved_text_sha256 = NULL,
         approved_media_sha256 = NULL,
         approved_by = NULL,
         approved_at = NULL,
         status = 'awaiting_review',
         updated_at = ?
     WHERE id = ?`,
  ).run(nextText, nextMediaPath, nextMediaSha256, now, id);

  return getDraft(db, id);
}

export type RepoResult = { ok: true } | { ok: false };

export function approveDraft(
  db: Database.Database,
  input: {
    id: string;
    expectedVersion: number;
    approvedBy: string;
    approvedTextSha256: string;
    approvedMediaSha256: string | null;
  },
): RepoResult {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE social_drafts
       SET status = 'approved',
           approved_version = version,
           approved_text_sha256 = ?,
           approved_media_sha256 = ?,
           approved_by = ?,
           approved_at = ?,
           updated_at = ?
       WHERE id = ? AND version = ? AND status = 'awaiting_review'`,
    )
    .run(
      input.approvedTextSha256,
      input.approvedMediaSha256,
      input.approvedBy,
      now,
      now,
      input.id,
      input.expectedVersion,
    );
  return result.changes > 0 ? { ok: true } : { ok: false };
}

export function rejectDraft(
  db: Database.Database,
  input: { id: string; expectedVersion: number },
): RepoResult {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE social_drafts
       SET status = 'rejected', updated_at = ?
       WHERE id = ? AND version = ?
         AND status IN ('awaiting_review', 'approved')`,
    )
    .run(now, input.id, input.expectedVersion);
  return result.changes > 0 ? { ok: true } : { ok: false };
}

/**
 * Atomic approved -> publishing guard: a conditional UPDATE that only affects a
 * row still sitting in `approved` at the expected approved_version. This is the
 * idempotency/duplicate-publish guard (a `WHERE status = 'approved'` conditional
 * update, not an in-memory lock, so it survives a restart).
 */
export function transitionToPublishing(
  db: Database.Database,
  input: { id: string; expectedApprovedVersion: number },
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE social_drafts
       SET status = 'publishing', updated_at = ?
       WHERE id = ? AND status = 'approved' AND approved_version = ?`,
    )
    .run(now, input.id, input.expectedApprovedVersion);
  return result.changes > 0;
}

export function markPublished(
  db: Database.Database,
  input: { id: string; postId: string; publishedUrl: string | null },
): Draft {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE social_drafts
     SET status = 'published', published_post_id = ?, published_url = ?, publish_error = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(input.postId, input.publishedUrl, now, input.id);
  return getDraft(db, input.id)!;
}

export function markFailed(db: Database.Database, input: { id: string; error: string }): Draft {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE social_drafts SET status = 'failed', publish_error = ?, updated_at = ? WHERE id = ?`,
  ).run(input.error, now, input.id);
  return getDraft(db, input.id)!;
}
