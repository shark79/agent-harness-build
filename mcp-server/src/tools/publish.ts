import { LinkedInApiError } from "../platforms/linkedin/client.js";
import { ImageUploadError } from "../platforms/linkedin/adapter.js";
import { getConnection } from "../storage/connections.js";
import { decrypt } from "../storage/encryption.js";
import {
  getDraft,
  markFailed,
  markPublished,
  transitionToPublishing,
  type Draft,
} from "../storage/drafts.js";
import { sanitizeUpstreamMessage } from "../util/sanitize.js";
import { sha256Text } from "../util/hash.js";
import type { AppContext } from "./context.js";
import { ToolError } from "./errors.js";

export const PUBLISH_CONFIRMATION_PHRASE = "PUBLISH_APPROVED_LINKEDIN_POST";

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

export interface PublishDraftInput {
  draftId: string;
  expectedApprovedVersion: number;
  confirmation: string;
}

export async function publishLinkedInDraft(ctx: AppContext, input: PublishDraftInput): Promise<Draft> {
  if (input.confirmation !== PUBLISH_CONFIRMATION_PHRASE) {
    throw new ToolError(
      "INVALID_CONFIRMATION",
      `confirmation must exactly equal "${PUBLISH_CONFIRMATION_PHRASE}".`,
      { retryable: true, nextAction: `Retry with confirmation set to exactly "${PUBLISH_CONFIRMATION_PHRASE}".` },
    );
  }

  const draft = requireDraft(ctx, input.draftId);

  if (draft.status !== "approved") {
    throw new ToolError(
      "INVALID_DRAFT_STATE",
      `Draft is in status "${draft.status}" and cannot be published (only "approved" drafts can be).`,
      { retryable: false, nextAction: "Call get_publish_status / get_linkedin_draft to check its current status." },
    );
  }

  if (draft.approvedVersion !== input.expectedApprovedVersion) {
    throw new ToolError(
      "STALE_VERSION",
      `expectedApprovedVersion ${input.expectedApprovedVersion} does not match the draft's approved_version ${draft.approvedVersion}.`,
      { retryable: true, nextAction: "Call get_linkedin_draft to fetch the current approved_version, then retry." },
    );
  }

  if (sha256Text(draft.text) !== draft.approvedTextSha256) {
    throw new ToolError(
      "DRAFT_CHANGED_SINCE_APPROVAL",
      "The draft's text has changed since it was approved.",
      { retryable: false, nextAction: "Re-approve the current text with approve_linkedin_draft before publishing." },
    );
  }

  if ((draft.mediaSha256 ?? null) !== (draft.approvedMediaSha256 ?? null)) {
    throw new ToolError(
      "DRAFT_CHANGED_SINCE_APPROVAL",
      "The draft's media attachment has changed since it was approved.",
      { retryable: false, nextAction: "Re-approve the current media with approve_linkedin_draft before publishing." },
    );
  }

  const connection = getConnection(ctx.db, "linkedin");
  if (!connection) {
    throw new ToolError("NOT_CONNECTED", "No LinkedIn connection is configured.", {
      retryable: false,
      nextAction: "Reconnect via get_linkedin_connection's authorizationUrl, then retry.",
    });
  }

  if (connection.authorUrn !== draft.authorUrn) {
    throw new ToolError(
      "INVALID_AUTHOR_URN",
      "The connected LinkedIn account has changed since this draft was approved.",
      { retryable: false, nextAction: "Re-approve the draft under the currently connected account." },
    );
  }

  if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now()) {
    throw new ToolError("TOKEN_EXPIRED", "The stored LinkedIn access token has expired.", {
      retryable: false,
      nextAction: "Reconnect via get_linkedin_connection's authorizationUrl, then retry.",
    });
  }

  // Atomic approved -> publishing guard: the real duplicate-publish defense.
  const transitioned = transitionToPublishing(ctx.db, {
    id: draft.id,
    expectedApprovedVersion: input.expectedApprovedVersion,
  });
  if (!transitioned) {
    throw new ToolError(
      "DUPLICATE_PUBLISH_ATTEMPT",
      "Another publish attempt for this draft is already in progress or completed.",
      { retryable: false, nextAction: "Call get_publish_status to see the outcome of the other attempt." },
    );
  }

  try {
    const accessToken = decrypt(connection.encryptedAccessToken, ctx.config.tokenEncryptionKey);
    const result = await ctx.adapter.publishPost({
      accessToken,
      authorUrn: connection.authorUrn,
      content: {
        text: draft.text,
        mediaAbsolutePath: draft.mediaPath ?? undefined,
      },
    });
    return markPublished(ctx.db, { id: draft.id, postId: result.postId, publishedUrl: result.postUrl });
  } catch (error) {
    const message = sanitizeUpstreamMessage(error instanceof Error ? error.message : "Publish failed");
    markFailed(ctx.db, { id: draft.id, error: message });

    if (error instanceof ImageUploadError) {
      throw new ToolError("IMAGE_UPLOAD_FAILED", message, {
        retryable: true,
        nextAction: "Check the media file, then re-approve and retry publish_linkedin_draft.",
      });
    }
    if (error instanceof LinkedInApiError && error.status === 429) {
      throw new ToolError("RATE_LIMITED", message, {
        retryable: true,
        nextAction: "Wait before retrying; the draft was marked failed, not published.",
      });
    }
    if (error instanceof LinkedInApiError) {
      throw new ToolError("LINKEDIN_REJECTED_POST", message, {
        retryable: false,
        nextAction: "Inspect the failure via get_publish_status, fix the issue, re-approve, and retry.",
      });
    }
    throw new ToolError("NETWORK_TIMEOUT", message, {
      retryable: true,
      nextAction: "Check network connectivity and retry; the draft was marked failed, not published.",
    });
  }
}

export async function getPublishStatus(
  ctx: AppContext,
  input: { draftId: string },
): Promise<{ status: string; postId: string | null; publishedUrl: string | null; error: string | null }> {
  const draft = requireDraft(ctx, input.draftId);
  return {
    status: draft.status,
    postId: draft.publishedPostId,
    publishedUrl: draft.publishedUrl,
    error: draft.publishError,
  };
}
