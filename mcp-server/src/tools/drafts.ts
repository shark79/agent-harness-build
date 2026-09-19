import { getConnection } from "../storage/connections.js";
import {
  createDraft,
  getDraft,
  listDrafts,
  updateDraftContent,
  type Draft,
  type DraftStatus,
} from "../storage/drafts.js";
import { MediaValidationError, validateMediaFile } from "../validation/media.js";
import { TextValidationError, validatePostText } from "../validation/text.js";
import type { AppContext } from "./context.js";
import { ToolError } from "./errors.js";

function requireLinkedInConnection(ctx: AppContext) {
  const connection = getConnection(ctx.db, "linkedin");
  if (!connection) {
    throw new ToolError(
      "NOT_CONNECTED",
      "No LinkedIn connection is configured yet.",
      {
        retryable: false,
        nextAction:
          "Call get_linkedin_connection, open its authorizationUrl in a browser, and complete the OAuth flow, then retry.",
      },
    );
  }
  return connection;
}

function requireDraft(ctx: AppContext, draftId: string): Draft {
  const draft = getDraft(ctx.db, draftId);
  if (!draft) {
    throw new ToolError("DRAFT_NOT_FOUND", `No draft with id "${draftId}".`, {
      retryable: false,
      nextAction: "Call list_linkedin_drafts to find a valid draftId.",
    });
  }
  return draft;
}

function validateText(text: string): void {
  try {
    validatePostText(text);
  } catch (error) {
    if (error instanceof TextValidationError) {
      throw new ToolError("TEXT_INVALID", error.message, {
        retryable: true,
        nextAction: "Shorten or fix the text and retry.",
      });
    }
    throw error;
  }
}

/** Returns {absolutePath, sha256} for a validated media path, or undefined if none was given. */
function validateMedia(
  ctx: AppContext,
  mediaPath: string | undefined,
): { absolutePath: string; sha256: string } | undefined {
  if (!mediaPath) return undefined;
  try {
    const media = validateMediaFile(mediaPath, ctx.mediaRoot);
    return { absolutePath: media.absolutePath, sha256: media.sha256 };
  } catch (error) {
    if (error instanceof MediaValidationError) {
      throw new ToolError("MEDIA_MISSING_OR_UNSUPPORTED", error.message, {
        retryable: true,
        nextAction: `Provide a valid png/jpeg/webp file (max 10MB) located under ${ctx.mediaRoot} and retry.`,
      });
    }
    throw error;
  }
}

export interface CreateDraftInput {
  text: string;
  mediaPath?: string;
  /**
   * Accepted for forward compatibility with campaign tooling but NOT currently
   * persisted - the social_drafts schema (defined exactly as specified) has no
   * campaign_id column. See README "Known limitations".
   */
  campaignId?: string;
}

export async function createLinkedInDraft(ctx: AppContext, input: CreateDraftInput): Promise<Draft> {
  const connection = requireLinkedInConnection(ctx);
  validateText(input.text);
  const media = validateMedia(ctx, input.mediaPath);

  return createDraft(ctx.db, {
    platform: "linkedin",
    accountId: connection.accountId,
    authorUrn: connection.authorUrn,
    text: input.text,
    mediaPath: media?.absolutePath ?? null,
    mediaSha256: media?.sha256 ?? null,
  });
}

export async function getLinkedInDraft(ctx: AppContext, input: { draftId: string }): Promise<Draft> {
  return requireDraft(ctx, input.draftId);
}

export async function listLinkedInDrafts(
  ctx: AppContext,
  input: { status?: DraftStatus },
): Promise<{ drafts: Draft[] }> {
  return { drafts: listDrafts(ctx.db, { status: input.status }) };
}

export interface UpdateDraftInput {
  draftId: string;
  text?: string;
  mediaPath?: string;
}

export async function updateLinkedInDraft(ctx: AppContext, input: UpdateDraftInput): Promise<Draft> {
  requireDraft(ctx, input.draftId);

  if (input.text !== undefined) validateText(input.text);
  const media = input.mediaPath !== undefined ? validateMedia(ctx, input.mediaPath) : undefined;

  const updated = updateDraftContent(ctx.db, input.draftId, {
    text: input.text,
    mediaPath: input.mediaPath !== undefined ? media?.absolutePath : undefined,
    mediaSha256: input.mediaPath !== undefined ? media?.sha256 : undefined,
  });
  // requireDraft above already guaranteed existence.
  return updated!;
}
