import { describe, expect, it } from "vitest";
import { MAX_POST_CHARACTERS, TextValidationError, validatePostText } from "../src/validation/text.js";

describe("validatePostText", () => {
  it("accepts non-empty text within the limit", () => {
    expect(() => validatePostText("Hello LinkedIn")).not.toThrow();
  });

  it("rejects empty text", () => {
    expect(() => validatePostText("")).toThrowError(TextValidationError);
  });

  it("rejects whitespace-only text", () => {
    expect(() => validatePostText("   \n\t  ")).toThrowError(TextValidationError);
  });

  it("rejects text longer than the configured max", () => {
    const tooLong = "a".repeat(MAX_POST_CHARACTERS + 1);
    expect(() => validatePostText(tooLong)).toThrowError(TextValidationError);
  });

  it("accepts text exactly at the configured max", () => {
    const exact = "a".repeat(MAX_POST_CHARACTERS);
    expect(() => validatePostText(exact)).not.toThrow();
  });
});
