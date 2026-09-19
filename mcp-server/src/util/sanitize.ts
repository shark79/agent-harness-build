/**
 * Strips things that look like secrets/tokens out of upstream error text before
 * it's allowed anywhere near a tool response, log line, or error message.
 */
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-_.]+/gi;
const LONG_TOKENISH_PATTERN = /[A-Za-z0-9\-_.]{32,}/g;

export function sanitizeUpstreamMessage(message: string, maxLength = 300): string {
  const withoutBearer = message.replace(BEARER_PATTERN, "[redacted]");
  const withoutLongTokens = withoutBearer.replace(LONG_TOKENISH_PATTERN, "[redacted]");
  return withoutLongTokens.length > maxLength
    ? withoutLongTokens.slice(0, maxLength) + "…"
    : withoutLongTokens;
}
