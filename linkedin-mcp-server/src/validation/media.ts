/**
 * Local media file validation for draft attachments.
 *
 * Security note: `mediaPath` is an LLM/agent-controlled tool argument. To avoid
 * turning `create_linkedin_draft` into an arbitrary local file reader (e.g. an
 * agent trying `../../.ssh/id_rsa` or `/etc/passwd`), every path is required to
 * resolve (after following `..` and symlinks) to somewhere inside a known
 * "media root" directory - by default this server's own `generated/` folder,
 * the same staging convention the sibling openai-image-mcp tool uses. Copy or
 * generate the image there first, then pass a path under it.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";

/** Conservative local upload cap; LinkedIn's own limits aren't the constraint here, storage/robustness is. Documented in README. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export type MediaValidationCode =
  | "MEDIA_PATH_INVALID"
  | "MEDIA_NOT_FOUND"
  | "MEDIA_IS_DIRECTORY"
  | "MEDIA_UNSUPPORTED_TYPE"
  | "MEDIA_TOO_LARGE";

export class MediaValidationError extends Error {
  code: MediaValidationCode;
  constructor(code: MediaValidationCode, message: string) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

export interface ValidatedMedia {
  absolutePath: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

export function validateMediaFile(mediaPath: string, mediaRoot: string): ValidatedMedia {
  const candidate = isAbsolute(mediaPath) ? mediaPath : resolve(mediaRoot, mediaPath);

  if (!existsSync(candidate)) {
    throw new MediaValidationError("MEDIA_NOT_FOUND", `Media file not found: ${mediaPath}`);
  }

  const stat = statSync(candidate);
  if (stat.isDirectory()) {
    throw new MediaValidationError(
      "MEDIA_IS_DIRECTORY",
      `Media path is a directory, expected a file: ${mediaPath}`,
    );
  }

  // Resolve symlinks/`..` for both the candidate and the root before containment
  // check, so a symlink or traversal can't point outside the media root.
  const realCandidate = realpathSync(candidate);
  const realRoot = realpathSync(mediaRoot);
  if (realCandidate !== realRoot && !realCandidate.startsWith(realRoot + "/")) {
    throw new MediaValidationError(
      "MEDIA_PATH_INVALID",
      `Media path must resolve inside the media root (${mediaRoot}): ${mediaPath}`,
    );
  }

  const mimeType = MIME_TYPES_BY_EXTENSION[extname(candidate).toLowerCase()];
  if (!mimeType) {
    throw new MediaValidationError(
      "MEDIA_UNSUPPORTED_TYPE",
      `Unsupported media type "${extname(candidate)}". Supported: png, jpeg, webp.`,
    );
  }

  if (stat.size > MAX_MEDIA_BYTES) {
    throw new MediaValidationError(
      "MEDIA_TOO_LARGE",
      `Media file is ${stat.size} bytes, exceeding the ${MAX_MEDIA_BYTES} byte (10 MB) limit.`,
    );
  }

  return {
    absolutePath: realCandidate,
    mimeType,
    sizeBytes: stat.size,
    sha256: sha256File(realCandidate),
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
