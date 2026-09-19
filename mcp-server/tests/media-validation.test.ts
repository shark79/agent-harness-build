import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MediaValidationError, validateMediaFile } from "../src/validation/media.js";

let mediaRoot: string;

afterEach(() => {
  if (mediaRoot) rmSync(mediaRoot, { recursive: true, force: true });
});

function makeRoot(): string {
  mediaRoot = mkdtempSync(join(tmpdir(), "social-mcp-media-"));
  return mediaRoot;
}

describe("validateMediaFile", () => {
  it("accepts a small png inside the media root and returns its sha256", () => {
    const root = makeRoot();
    const filePath = join(root, "photo.png");
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));

    const result = validateMediaFile(filePath, root);
    expect(result.sha256).toHaveLength(64);
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(8);
  });

  it("accepts jpeg and webp extensions too", () => {
    const root = makeRoot();
    const jpegPath = join(root, "a.jpg");
    writeFileSync(jpegPath, Buffer.from([1, 2, 3]));
    expect(validateMediaFile(jpegPath, root).mimeType).toBe("image/jpeg");

    const webpPath = join(root, "b.webp");
    writeFileSync(webpPath, Buffer.from([1, 2, 3]));
    expect(validateMediaFile(webpPath, root).mimeType).toBe("image/webp");
  });

  it("rejects a missing file", () => {
    const root = makeRoot();
    expect(() => validateMediaFile(join(root, "nope.png"), root)).toThrowError(
      MediaValidationError,
    );
  });

  it("rejects a directory", () => {
    const root = makeRoot();
    const dirPath = join(root, "adir.png");
    mkdirSync(dirPath);
    expect(() => validateMediaFile(dirPath, root)).toThrowError(MediaValidationError);
  });

  it("rejects an unsupported file extension", () => {
    const root = makeRoot();
    const filePath = join(root, "doc.pdf");
    writeFileSync(filePath, Buffer.from([1, 2, 3]));
    expect(() => validateMediaFile(filePath, root)).toThrowError(MediaValidationError);
  });

  it("rejects a file larger than the configured max size", () => {
    const root = makeRoot();
    const filePath = join(root, "big.png");
    writeFileSync(filePath, Buffer.alloc(11 * 1024 * 1024));
    expect(() => validateMediaFile(filePath, root)).toThrowError(MediaValidationError);
  });

  it("rejects a path that escapes the media root via traversal", () => {
    const root = makeRoot();
    const outside = join(root, "..", "outside.png");
    writeFileSync(outside, Buffer.from([1, 2, 3]));
    try {
      expect(() => validateMediaFile(join(root, "..", "outside.png"), root)).toThrowError(
        MediaValidationError,
      );
    } finally {
      rmSync(outside, { force: true });
    }
  });
});
