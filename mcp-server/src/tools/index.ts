import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "./context.js";
import { getLinkedInConnection } from "./connection.js";
import {
  createLinkedInDraft,
  getLinkedInDraft,
  listLinkedInDrafts,
  updateLinkedInDraft,
} from "./drafts.js";
import { APPROVE_CONFIRMATION_PHRASE, approveLinkedInDraft, rejectLinkedInDraft } from "./approval.js";
import { PUBLISH_CONFIRMATION_PHRASE, getPublishStatus, publishLinkedInDraft } from "./publish.js";
import { toolErrorContent } from "./errors.js";

const DRAFT_STATUS_VALUES = [
  "draft",
  "awaiting_review",
  "approved",
  "publishing",
  "published",
  "rejected",
  "failed",
] as const;

/** Wraps a tool implementation so any thrown error (ToolError or otherwise) becomes the structured MCP error shape, never a raw exception. */
function wrap<Args extends object, Result extends object>(
  ctx: AppContext,
  fn: (ctx: AppContext, args: Args) => Promise<Result>,
) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      const result = await fn(ctx, args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return toolErrorContent(error);
    }
  };
}

export function registerLinkedInTools(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "get_linkedin_connection",
    {
      title: "Get LinkedIn connection status",
      description:
        "Reports whether a LinkedIn account is connected via OAuth. If not connected, returns an authorizationUrl to start the connection flow.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    wrap<Record<string, never>, Awaited<ReturnType<typeof getLinkedInConnection>>>(
      ctx,
      async (context) => getLinkedInConnection(context),
    ),
  );

  server.registerTool(
    "create_linkedin_draft",
    {
      title: "Create a LinkedIn draft",
      description:
        "Creates a LinkedIn post draft (status awaiting_review). Never publishes. Requires an existing LinkedIn connection. Accepts optional single-image media (png/jpeg/webp, <=10MB) located under this server's media root.",
      inputSchema: {
        text: z.string().describe("Post body text."),
        mediaPath: z
          .string()
          .optional()
          .describe("Optional path (absolute, or relative to the media root) to a png/jpeg/webp image."),
        campaignId: z
          .string()
          .optional()
          .describe(
            "Optional external campaign identifier. NOTE: accepted but not currently persisted (no column in social_drafts).",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    wrap(ctx, createLinkedInDraft),
  );

  server.registerTool(
    "get_linkedin_draft",
    {
      title: "Get a LinkedIn draft",
      description: "Fetches a single LinkedIn draft by id, including its current status and version.",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    wrap(ctx, getLinkedInDraft),
  );

  server.registerTool(
    "list_linkedin_drafts",
    {
      title: "List LinkedIn drafts",
      description: "Lists LinkedIn drafts, optionally filtered by status.",
      inputSchema: { status: z.enum(DRAFT_STATUS_VALUES).optional() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    wrap(ctx, listLinkedInDrafts),
  );

  server.registerTool(
    "update_linkedin_draft",
    {
      title: "Update a LinkedIn draft",
      description:
        "Updates a draft's text and/or media. Bumps its version, clears any prior approval, and resets status to awaiting_review. Never publishes.",
      inputSchema: {
        draftId: z.string(),
        text: z.string().optional(),
        mediaPath: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    wrap(ctx, updateLinkedInDraft),
  );

  server.registerTool(
    "approve_linkedin_draft",
    {
      title: "Approve a LinkedIn draft",
      description: `Marks a draft approved for publishing, pinning its exact text/media by hash. Requires confirmation === "${APPROVE_CONFIRMATION_PHRASE}" and expectedVersion to match the draft's current version. Never publishes.`,
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int(),
        approvedBy: z.string().describe("Identifier of the human approving this draft."),
        confirmation: z.string().describe(`Must exactly equal "${APPROVE_CONFIRMATION_PHRASE}".`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    wrap(ctx, approveLinkedInDraft),
  );

  server.registerTool(
    "reject_linkedin_draft",
    {
      title: "Reject a LinkedIn draft",
      description: "Marks a draft rejected. Never publishes.",
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int(),
        reason: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    wrap(ctx, rejectLinkedInDraft),
  );

  server.registerTool(
    "publish_linkedin_draft",
    {
      title: "Publish an approved LinkedIn draft",
      description: `THE SENSITIVE WRITE TOOL: publishes an already-approved draft to LinkedIn (external, irreversible side effect). Requires confirmation === "${PUBLISH_CONFIRMATION_PHRASE}", the draft's approved_version to match, and its text/media hashes to be unchanged since approval.`,
      inputSchema: {
        draftId: z.string(),
        expectedApprovedVersion: z.number().int(),
        confirmation: z.string().describe(`Must exactly equal "${PUBLISH_CONFIRMATION_PHRASE}".`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    wrap(ctx, publishLinkedInDraft),
  );

  server.registerTool(
    "get_publish_status",
    {
      title: "Get LinkedIn publish status",
      description: "Reports a draft's publish status, LinkedIn post id/URL (if published), and last error (if failed).",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    wrap(ctx, getPublishStatus),
  );
}
