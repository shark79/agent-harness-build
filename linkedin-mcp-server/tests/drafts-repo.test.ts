import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import {
  approveDraft,
  createDraft,
  getDraft,
  listDrafts,
  markFailed,
  markPublished,
  rejectDraft,
  transitionToPublishing,
  updateDraftContent,
} from "../src/storage/drafts.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
});

afterEach(() => {
  db.close();
});

const newDraftInput = {
  platform: "linkedin",
  accountId: "member-1",
  authorUrn: "urn:li:person:member-1",
  text: "Hello LinkedIn",
  mediaPath: null,
  mediaSha256: null,
};

describe("drafts repository", () => {
  it("creates a draft in awaiting_review status at version 1", () => {
    const draft = createDraft(db, newDraftInput);
    expect(draft.status).toBe("awaiting_review");
    expect(draft.version).toBe(1);
    expect(draft.approvedVersion).toBeNull();
  });

  it("gets and lists drafts, optionally filtered by status", () => {
    const a = createDraft(db, newDraftInput);
    const b = createDraft(db, { ...newDraftInput, text: "Second draft" });
    expect(getDraft(db, a.id)?.text).toBe("Hello LinkedIn");

    rejectDraft(db, { id: b.id, expectedVersion: 1 });

    expect(listDrafts(db, {}).length).toBe(2);
    expect(listDrafts(db, { status: "rejected" }).map((d) => d.id)).toEqual([b.id]);
    expect(listDrafts(db, { status: "awaiting_review" }).map((d) => d.id)).toEqual([a.id]);
  });

  it("updating only text leaves an existing media attachment untouched", () => {
    const draft = createDraft(db, { ...newDraftInput, mediaPath: "generated/photo.png", mediaSha256: "hash1" });
    const updated = updateDraftContent(db, draft.id, { text: "New text only" });
    expect(updated?.mediaPath).toBe("generated/photo.png");
    expect(updated?.mediaSha256).toBe("hash1");
  });

  it("updating content bumps version, clears approval fields, and resets status", () => {
    const draft = createDraft(db, newDraftInput);
    approveDraft(db, {
      id: draft.id,
      expectedVersion: 1,
      approvedBy: "shashank",
      approvedTextSha256: "abc",
      approvedMediaSha256: null,
    });

    const updated = updateDraftContent(db, draft.id, { text: "Edited text" });
    expect(updated?.version).toBe(2);
    expect(updated?.status).toBe("awaiting_review");
    expect(updated?.approvedVersion).toBeNull();
    expect(updated?.approvedTextSha256).toBeNull();
    expect(updated?.approvedBy).toBeNull();
  });

  it("approve requires the expected current version, and stores approval hashes", () => {
    const draft = createDraft(db, newDraftInput);
    const staleResult = approveDraft(db, {
      id: draft.id,
      expectedVersion: 999,
      approvedBy: "shashank",
      approvedTextSha256: "abc",
      approvedMediaSha256: null,
    });
    expect(staleResult.ok).toBe(false);

    const result = approveDraft(db, {
      id: draft.id,
      expectedVersion: 1,
      approvedBy: "shashank",
      approvedTextSha256: "abc",
      approvedMediaSha256: null,
    });
    expect(result.ok).toBe(true);
    const reloaded = getDraft(db, draft.id);
    expect(reloaded?.status).toBe("approved");
    expect(reloaded?.approvedVersion).toBe(1);
    expect(reloaded?.approvedBy).toBe("shashank");
  });

  it("reject only succeeds for the expected version and sets status rejected", () => {
    const draft = createDraft(db, newDraftInput);
    const stale = rejectDraft(db, { id: draft.id, expectedVersion: 999 });
    expect(stale.ok).toBe(false);

    const result = rejectDraft(db, { id: draft.id, expectedVersion: 1 });
    expect(result.ok).toBe(true);
    expect(getDraft(db, draft.id)?.status).toBe("rejected");
  });

  it("transitionToPublishing only succeeds from approved with the matching approved_version, atomically", () => {
    const draft = createDraft(db, newDraftInput);
    approveDraft(db, {
      id: draft.id,
      expectedVersion: 1,
      approvedBy: "shashank",
      approvedTextSha256: "abc",
      approvedMediaSha256: null,
    });

    const wrongVersion = transitionToPublishing(db, { id: draft.id, expectedApprovedVersion: 999 });
    expect(wrongVersion).toBe(false);
    expect(getDraft(db, draft.id)?.status).toBe("approved");

    const ok = transitionToPublishing(db, { id: draft.id, expectedApprovedVersion: 1 });
    expect(ok).toBe(true);
    expect(getDraft(db, draft.id)?.status).toBe("publishing");

    // A second attempt must fail - this is the duplicate-publish guard.
    const again = transitionToPublishing(db, { id: draft.id, expectedApprovedVersion: 1 });
    expect(again).toBe(false);
  });

  it("markPublished records the post id/url and sets status published", () => {
    const draft = createDraft(db, newDraftInput);
    const published = markPublished(db, {
      id: draft.id,
      postId: "urn:li:share:123",
      publishedUrl: "https://www.linkedin.com/feed/update/urn:li:share:123/",
    });
    expect(published.status).toBe("published");
    expect(published.publishedPostId).toBe("urn:li:share:123");
  });

  it("markFailed records a sanitized error and sets status failed", () => {
    const draft = createDraft(db, newDraftInput);
    const failed = markFailed(db, { id: draft.id, error: "LinkedIn rejected the request (400)" });
    expect(failed.status).toBe("failed");
    expect(failed.publishError).toBe("LinkedIn rejected the request (400)");
  });
});
