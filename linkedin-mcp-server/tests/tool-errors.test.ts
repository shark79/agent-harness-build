import { describe, expect, it } from "vitest";
import { ToolError, toolErrorContent } from "../src/tools/errors.js";

describe("ToolError", () => {
  it("carries errorCode/retryable/nextAction", () => {
    const error = new ToolError("DRAFT_NOT_FOUND", "No such draft", {
      retryable: false,
      nextAction: "Call list_linkedin_drafts to find a valid draftId.",
    });
    expect(error.errorCode).toBe("DRAFT_NOT_FOUND");
    expect(error.retryable).toBe(false);
  });
});

describe("toolErrorContent", () => {
  it("converts a ToolError into the structured MCP error shape", () => {
    const error = new ToolError("STALE_VERSION", "Version mismatch", {
      retryable: false,
      nextAction: "Re-fetch the draft and retry with its current version.",
    });
    const result = toolErrorContent(error);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      errorCode: "STALE_VERSION",
      message: "Version mismatch",
      retryable: false,
      nextAction: "Re-fetch the draft and retry with its current version.",
    });
  });

  it("wraps an unexpected error as a sanitized INTERNAL_ERROR, never leaking the raw message", () => {
    const result = toolErrorContent(new Error("db file /Users/shashank/secret-path leaked, token=abcdefghijklmnopqrstuvwxyz0123456789"));
    expect(result.structuredContent?.errorCode).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });
});
