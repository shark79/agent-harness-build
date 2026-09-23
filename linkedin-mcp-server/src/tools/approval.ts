import { sha256Text } from "../util/hash.js";
import { approveDraft, getDraft, rejectDraft, type Draft } from "../storage/drafts.js";
import type { AppContext } from "./context.js";
import { ToolError } from "./errors.js";

export const APPROVE_CONFIRMATION_PHRASE = "APPROVE_LINKEDIN_POST";

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

export interface ApproveDraftInput {
  draftId: string;
  expectedVersion: number;
  approvedBy: string;
  confirmation: string;
}

export async function approveLinkedInDraft(ctx: AppContext, input: ApproveDraftInput): Promise<Draft> {
  if (input.confirmation !== APPROVE_CONFIRMATION_PHRASE) {
    throw new ToolError(
      "INVALID_CONFIRMATION",
      `confirmation must exactly equal "${APPROVE_CONFIRMATION_PHRASE}".`,
      {
        retryable: true,
        nextAction: `Retry with confirmation set to exactly "${APPROVE_CONFIRMATION_PHRASE}".`,
      },
    );
  }

  const draft = requireDraft(ctx, input.draftId);

  if (draft.version !== input.expectedVersion) {
    throw new ToolError(
      "STALE_VERSION",
      `expectedVersion ${input.expectedVersion} does not match the draft's current version ${draft.version}.`,
      {
        retryable: true,
        nextAction: "Call get_linkedin_draft to fetch the current version, then retry.",
      },
    );
  }

  if (draft.status !== "awaiting_review") {
    throw new ToolError(
      "INVALID_DRAFT_STATE",
      `Draft is in status "${draft.status}" and cannot be approved (only "awaiting_review" drafts can be).`,
      {
        retryable: false,
        nextAction: "Call get_linkedin_draft to check its current status.",
      },
    );
  }

  const result = approveDraft(ctx.db, {
    id: draft.id,
    expectedVersion: input.expectedVersion,
    approvedBy: input.approvedBy,
    approvedTextSha256: sha256Text(draft.text),
    approvedMediaSha256: draft.mediaSha256,
  });

  if (!result.ok) {
    throw new ToolError(
      "STALE_VERSION",
      "The draft changed concurrently and could not be approved at the expected version.",
      { retryable: true, nextAction: "Call get_linkedin_draft to fetch the current version, then retry." },
    );
  }

  return getDraft(ctx.db, draft.id)!;
}

export interface RejectDraftInput {
  draftId: string;
  expectedVersion: number;
  reason: string;
}

export async function rejectLinkedInDraft(ctx: AppContext, input: RejectDraftInput): Promise<Draft> {
  const draft = requireDraft(ctx, input.draftId);

  if (draft.version !== input.expectedVersion) {
    throw new ToolError(
      "STALE_VERSION",
      `expectedVersion ${input.expectedVersion} does not match the draft's current version ${draft.version}.`,
      { retryable: true, nextAction: "Call get_linkedin_draft to fetch the current version, then retry." },
    );
  }

  const result = rejectDraft(ctx.db, { id: draft.id, expectedVersion: input.expectedVersion });
  if (!result.ok) {
    throw new ToolError(
      "INVALID_DRAFT_STATE",
      `Draft is in status "${draft.status}" and cannot be rejected.`,
      { retryable: false, nextAction: "Call get_linkedin_draft to check its current status." },
    );
  }

  // Note: `reason` has no column in the (exactly-as-specified) social_drafts
  // schema, so it isn't persisted - it's only echoed back in this call's own
  // response for the human's immediate visibility. See README "Known limitations".
  return getDraft(ctx.db, draft.id)!;
}
