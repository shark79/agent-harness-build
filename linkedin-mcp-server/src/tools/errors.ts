/**
 * Structured MCP tool errors: every documented failure condition maps to one
 * of these codes, always with a `retryable` hint and a concrete `nextAction`
 * so the calling agent knows what to do next - never a bare thrown string.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { sanitizeUpstreamMessage } from "../util/sanitize.js";

export type ToolErrorCode =
  | "NOT_CONNECTED"
  | "OAUTH_DENIED"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_CODE_EXCHANGE_FAILED"
  | "OAUTH_MISSING_SCOPE"
  | "TOKEN_EXPIRED"
  | "USERINFO_FAILED"
  | "INVALID_AUTHOR_URN"
  | "DRAFT_NOT_FOUND"
  | "INVALID_DRAFT_STATE"
  | "STALE_VERSION"
  | "DRAFT_CHANGED_SINCE_APPROVAL"
  | "INVALID_CONFIRMATION"
  | "TEXT_INVALID"
  | "MEDIA_MISSING_OR_UNSUPPORTED"
  | "IMAGE_UPLOAD_FAILED"
  | "LINKEDIN_REJECTED_POST"
  | "DUPLICATE_PUBLISH_ATTEMPT"
  | "SQLITE_ERROR"
  | "NETWORK_TIMEOUT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ToolErrorOptions {
  retryable: boolean;
  nextAction: string;
}

export class ToolError extends Error {
  errorCode: ToolErrorCode;
  retryable: boolean;
  nextAction: string;

  constructor(errorCode: ToolErrorCode, message: string, options: ToolErrorOptions) {
    super(message);
    this.name = "ToolError";
    this.errorCode = errorCode;
    this.retryable = options.retryable;
    this.nextAction = options.nextAction;
  }
}

export interface ToolErrorBody {
  errorCode: ToolErrorCode;
  message: string;
  retryable: boolean;
  nextAction: string;
}

export interface ToolErrorContentResult {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ToolErrorBody;
}

/**
 * Converts any thrown value into the structured MCP tool error shape,
 * sanitizing anything not already a known ToolError. Declared to return
 * `Record<string, unknown>` (rather than the narrower ToolErrorContentResult)
 * purely so it structurally satisfies the MCP SDK's index-signature-bearing
 * CallToolResult type at the registerTool callback boundary - the runtime
 * shape is always exactly ToolErrorContentResult.
 */
export function toolErrorContent(error: unknown): CallToolResult {
  const body: ToolErrorBody =
    error instanceof ToolError
      ? {
          errorCode: error.errorCode,
          message: error.message,
          retryable: error.retryable,
          nextAction: error.nextAction,
        }
      : {
          errorCode: "INTERNAL_ERROR",
          message: sanitizeUpstreamMessage(
            error instanceof Error ? error.message : "An unexpected internal error occurred.",
          ),
          retryable: false,
          nextAction: "Check the server logs. This is not a documented failure condition.",
        };

  const result: ToolErrorContentResult = {
    isError: true,
    content: [{ type: "text", text: `${body.errorCode}: ${body.message}` }],
    structuredContent: body,
  };
  return result as unknown as CallToolResult;
}
