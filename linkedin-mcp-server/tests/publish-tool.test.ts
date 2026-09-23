import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { saveConnection } from "../src/storage/connections.js";
import { getDraft } from "../src/storage/drafts.js";
import type { AppContext } from "../src/tools/context.js";
import type { PlatformAdapter } from "../src/platforms/types.js";
import { APPROVE_CONFIRMATION_PHRASE, approveLinkedInDraft } from "../src/tools/approval.js";
import { createLinkedInDraft } from "../src/tools/drafts.js";
import {
  getPublishStatus,
  PUBLISH_CONFIRMATION_PHRASE,
  publishLinkedInDraft,
} from "../src/tools/publish.js";
import { encrypt } from "../src/storage/encryption.js";
import { LinkedInApiError } from "../src/platforms/linkedin/client.js";

let db: Database.Database;
let ctx: AppContext;
let publishPost: ReturnType<typeof vi.fn>;

const tokenEncryptionKey = Buffer.alloc(32, 1);

function makeAdapter(): PlatformAdapter {
  publishPost = vi.fn().mockResolvedValue({ postId: "urn:li:share:999", postUrl: "https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A999/" });
  return {
    name: "linkedin",
    buildAuthorizationUrl: () => "https://example.com/authorize",
    exchangeAuthorizationCode: async () => ({ accessToken: "tok", expiresIn: 1000, scope: "" }),
    fetchIdentity: async () => ({ externalAccountId: "1", authorUrn: "urn:li:person:member-1", displayName: "x" }),
    publishPost: publishPost as unknown as PlatformAdapter["publishPost"],
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
  ctx = {
    config: {
      host: "127.0.0.1",
      port: 8810,
      publicUrl: "http://localhost:8810",
      linkedin: {
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "http://localhost:8810/oauth/linkedin/callback",
        version: "202509",
      },
      tokenEncryptionKey,
      databasePath: ":memory:",
    },
    db,
    adapter: makeAdapter(),
    mediaRoot: "/tmp/unused",
  };
});

afterEach(() => {
  db.close();
});

function connect(overrides: Partial<Parameters<typeof saveConnection>[1]> = {}) {
  saveConnection(db, {
    platform: "linkedin",
    accountId: "member-1",
    accountName: "Ada",
    authorUrn: "urn:li:person:member-1",
    encryptedAccessToken: encrypt("real-access-token", tokenEncryptionKey),
    encryptedRefreshToken: null,
    scopes: ["openid", "profile", "w_member_social"],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  });
}

async function createApprovedDraft(text = "Hello LinkedIn") {
  const draft = await createLinkedInDraft(ctx, { text });
  const approved = await approveLinkedInDraft(ctx, {
    draftId: draft.id,
    expectedVersion: draft.version,
    approvedBy: "shashank",
    confirmation: APPROVE_CONFIRMATION_PHRASE,
  });
  return approved;
}

describe("publish_linkedin_draft", () => {
  it("rejects a confirmation string that doesn't match exactly", async () => {
    connect();
    const draft = await createApprovedDraft();
    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: "publish now please",
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_CONFIRMATION" });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("rejects publishing an unapproved (awaiting_review) draft", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Not approved yet" });
    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: 1,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_DRAFT_STATE" });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("rejects publishing a rejected draft", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Will be rejected" });
    const { rejectLinkedInDraft } = await import("../src/tools/approval.js");
    await rejectLinkedInDraft(ctx, { draftId: draft.id, expectedVersion: draft.version, reason: "no" });
    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: 1,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_DRAFT_STATE" });
  });

  it("rejects a stale expectedApprovedVersion", async () => {
    connect();
    const draft = await createApprovedDraft();
    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: 999,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "STALE_VERSION" });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("detects text changed since approval and blocks publish", async () => {
    connect();
    const draft = await createApprovedDraft();
    // Force the text to differ from the approved hash while keeping status 'approved'
    // (simulates a bypass / bug elsewhere) to exercise the hash re-check directly.
    db.prepare("UPDATE social_drafts SET text = ? WHERE id = ?").run("Tampered text", draft.id);

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "DRAFT_CHANGED_SINCE_APPROVAL" });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("detects media changed since approval and blocks publish", async () => {
    connect();
    const draft = await createApprovedDraft();
    db.prepare("UPDATE social_drafts SET media_sha256 = ? WHERE id = ?").run("different-hash", draft.id);

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "DRAFT_CHANGED_SINCE_APPROVAL" });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("rejects when the token has expired", async () => {
    connect({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const draft = await createApprovedDraft();
    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "TOKEN_EXPIRED" });
  });

  it("publishes an approved, unchanged draft and records the post id/url", async () => {
    connect();
    const draft = await createApprovedDraft();
    const result = await publishLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedApprovedVersion: draft.approvedVersion!,
      confirmation: PUBLISH_CONFIRMATION_PHRASE,
    });

    expect(result.status).toBe("published");
    expect(result.publishedPostId).toBe("urn:li:share:999");
    expect(publishPost).toHaveBeenCalledTimes(1);

    // Never leaks the decrypted token anywhere in the tool's return value.
    expect(JSON.stringify(result)).not.toContain("real-access-token");
  });

  it("rejects publishing an already-published draft again", async () => {
    connect();
    const draft = await createApprovedDraft();
    await publishLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedApprovedVersion: draft.approvedVersion!,
      confirmation: PUBLISH_CONFIRMATION_PHRASE,
    });

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_DRAFT_STATE" });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("marks the draft failed (not published) when LinkedIn rejects the post, with a sanitized error", async () => {
    connect();
    const draft = await createApprovedDraft();
    publishPost.mockRejectedValueOnce(
      new LinkedInApiError(422, "upstream said Bearer abcdefghijklmnopqrstuvwxyz0123456789 invalid"),
    );

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "LINKEDIN_REJECTED_POST" });

    const reloaded = getDraft(db, draft.id)!;
    expect(reloaded.status).toBe("failed");
    expect(reloaded.publishError).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("maps a 429 upstream response to RATE_LIMITED and marks the draft failed", async () => {
    connect();
    const draft = await createApprovedDraft();
    publishPost.mockRejectedValueOnce(new LinkedInApiError(429, "Too many requests"));

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "RATE_LIMITED" });
    expect(getDraft(db, draft.id)!.status).toBe("failed");
  });

  it("maps a network-level failure to NETWORK_TIMEOUT and marks the draft failed", async () => {
    connect();
    const draft = await createApprovedDraft();
    publishPost.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      publishLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedApprovedVersion: draft.approvedVersion!,
        confirmation: PUBLISH_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "NETWORK_TIMEOUT" });
    expect(getDraft(db, draft.id)!.status).toBe("failed");
  });
});

describe("get_publish_status", () => {
  it("reports status/postId/url/error", async () => {
    connect();
    const draft = await createApprovedDraft();
    await publishLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedApprovedVersion: draft.approvedVersion!,
      confirmation: PUBLISH_CONFIRMATION_PHRASE,
    });
    const status = await getPublishStatus(ctx, { draftId: draft.id });
    expect(status).toEqual({
      status: "published",
      postId: "urn:li:share:999",
      publishedUrl: "https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A999/",
      error: null,
    });
  });
});
