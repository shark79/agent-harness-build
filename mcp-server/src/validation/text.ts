/**
 * LinkedIn's Posts API documentation (fetched during this build) enforces a
 * `FIELD_LENGTH_TOO_LONG` error on `commentary` but does not publish an exact
 * character count. 3000 is the widely-documented current LinkedIn post/share
 * character limit as of this writing - CONSERVATIVE CONSTANT, VERIFY against
 * LinkedIn's current developer docs / composer before relying on it in
 * production; LinkedIn has changed this number across API generations before.
 */
export const MAX_POST_CHARACTERS = 3000;

export class TextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextValidationError";
  }
}

export function validatePostText(text: string): void {
  if (text.trim().length === 0) {
    throw new TextValidationError("Post text must not be empty.");
  }
  if (text.length > MAX_POST_CHARACTERS) {
    throw new TextValidationError(
      `Post text is ${text.length} characters, exceeding the ${MAX_POST_CHARACTERS} character limit.`,
    );
  }
}
