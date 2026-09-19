import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../src/storage/migrations.js";
import { saveConnection } from "../src/storage/connections.js";
import type { AppContext } from "../src/tools/context.js";
import type { PlatformAdapter } from "../src/platforms/types.js";
import {
  approveLinkedInDraft,
  APPROVE_CONFIRMATION_PHRASE,
} from "../src/tools/approval.js";
import { rejectLinkedInDraft } from "../src/tools/approval.js";
import {
  createLinkedInDraft,
  getLinkedInDraft,
  listLinkedInDrafts,
  updateLinkedInDraft,
} from "../src/tools/drafts.js";
import { ToolError } from "../src/tools/errors.js";

let db: Database.Database;
let mediaRoot: string;
let ctx: AppContext;

const noopAdapter: PlatformAdapter = {
  name: "linkedin",
  buildAuthorizationUrl: () => "https://example.com/authorize",
  exchangeAuthorizationCode: async () => ({ accessToken: "tok", expiresIn: 1000, scope: "" }),
  fetchIdentity: async () => ({ externalAccountId: "1", authorUrn: "urn:li:person:1", displayName: "x" }),
  publishPost: async () => ({ postId: "urn:li:share:1", postUrl: null }),
};

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
  mediaRoot = mkdtempSync(join(tmpdir(), "social-mcp-media-"));
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
      tokenEncryptionKey: Buffer.alloc(32, 1),
      databasePath: ":memory:",
    },
    db,
    adapter: noopAdapter,
    mediaRoot,
  };
});

afterEach(() => {
  db.close();
  rmSync(mediaRoot, { recursive: true, force: true });
});

function connect() {
  saveConnection(db, {
    platform: "linkedin",
    accountId: "member-1",
    accountName: "Ada",
    authorUrn: "urn:li:person:member-1",
    encryptedAccessToken: "iv.tag.ct",
    encryptedRefreshToken: null,
    scopes: ["openid", "profile", "w_member_social"],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
}

describe("create_linkedin_draft", () => {
  it("requires an existing LinkedIn connection", async () => {
    await expect(createLinkedInDraft(ctx, { text: "Hello" })).rejects.toMatchObject({
      errorCode: "NOT_CONNECTED",
    });
  });

  it("creates a draft in awaiting_review status and never publishes", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Hello LinkedIn" });
    expect(draft.status).toBe("awaiting_review");
    expect(draft.publishedPostId).toBeNull();
  });

  it("rejects empty text", async () => {
    connect();
    await expect(createLinkedInDraft(ctx, { text: "   " })).rejects.toMatchObject({
      errorCode: "TEXT_INVALID",
    });
  });

  it("accepts a valid image under the media root and records its hash", async () => {
    connect();
    const imgPath = join(mediaRoot, "photo.png");
    writeFileSync(imgPath, Buffer.from([1, 2, 3]));
    const draft = await createLinkedInDraft(ctx, { text: "With image", mediaPath: imgPath });
    expect(draft.mediaSha256).toHaveLength(64);
  });

  it("rejects an unsupported media type", async () => {
    connect();
    const filePath = join(mediaRoot, "doc.pdf");
    writeFileSync(filePath, Buffer.from([1]));
    await expect(createLinkedInDraft(ctx, { text: "x", mediaPath: filePath })).rejects.toMatchObject({
      errorCode: "MEDIA_MISSING_OR_UNSUPPORTED",
    });
  });
});

describe("get/list/update drafts", () => {
  it("get returns the draft, list filters by status", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "One" });
    const fetched = await getLinkedInDraft(ctx, { draftId: draft.id });
    expect(fetched.text).toBe("One");

    const all = await listLinkedInDrafts(ctx, {});
    expect(all.drafts).toHaveLength(1);
    const filtered = await listLinkedInDrafts(ctx, { status: "rejected" });
    expect(filtered.drafts).toHaveLength(0);
  });

  it("get on a missing draft throws DRAFT_NOT_FOUND", async () => {
    await expect(getLinkedInDraft(ctx, { draftId: "nope" })).rejects.toMatchObject({
      errorCode: "DRAFT_NOT_FOUND",
    });
  });

  it("update bumps version and never publishes", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Original" });
    const updated = await updateLinkedInDraft(ctx, { draftId: draft.id, text: "Updated" });
    expect(updated.version).toBe(2);
    expect(updated.status).toBe("awaiting_review");
  });

  it("updating a draft invalidates a prior approval", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Original" });
    await approveLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedVersion: draft.version,
      approvedBy: "shashank",
      confirmation: APPROVE_CONFIRMATION_PHRASE,
    });
    const updated = await updateLinkedInDraft(ctx, { draftId: draft.id, text: "Changed my mind" });
    expect(updated.status).toBe("awaiting_review");
    expect(updated.approvedVersion).toBeNull();
  });
});

describe("approve_linkedin_draft", () => {
  it("rejects a confirmation string that doesn't match exactly", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Hello" });
    await expect(
      approveLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedVersion: draft.version,
        approvedBy: "shashank",
        confirmation: "approve_linkedin_post",
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_CONFIRMATION" });
  });

  it("rejects a stale expectedVersion", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Hello" });
    await expect(
      approveLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedVersion: 999,
        approvedBy: "shashank",
        confirmation: APPROVE_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "STALE_VERSION" });
  });

  it("approves with the exact confirmation phrase and matching version", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Hello" });
    const approved = await approveLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedVersion: draft.version,
      approvedBy: "shashank",
      confirmation: APPROVE_CONFIRMATION_PHRASE,
    });
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("shashank");
  });
});

describe("reject_linkedin_draft", () => {
  it("rejects a draft and blocks approval afterwards", async () => {
    connect();
    const draft = await createLinkedInDraft(ctx, { text: "Hello" });
    const rejected = await rejectLinkedInDraft(ctx, {
      draftId: draft.id,
      expectedVersion: draft.version,
      reason: "Not on-brand",
    });
    expect(rejected.status).toBe("rejected");

    await expect(
      approveLinkedInDraft(ctx, {
        draftId: draft.id,
        expectedVersion: draft.version,
        approvedBy: "shashank",
        confirmation: APPROVE_CONFIRMATION_PHRASE,
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_DRAFT_STATE" });
  });
});

// Ensure the ToolError constructor really is what .rejects.toMatchObject compares against.
describe("sanity", () => {
  it("ToolError is thrown, not a plain object", async () => {
    let caught: unknown;
    try {
      await getLinkedInDraft(ctx, { draftId: "missing" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
  });
});
