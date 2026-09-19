import { describe, expect, it, vi } from "vitest";
import { createLinkedInAdapter, ImageUploadError } from "../src/platforms/linkedin/adapter.js";
import type { Config } from "../src/config.js";

const config: Config = {
  host: "127.0.0.1",
  port: 8810,
  publicUrl: "http://localhost:8810",
  linkedin: {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:8810/oauth/linkedin/callback",
    version: "202509",
  },
  tokenEncryptionKey: Buffer.alloc(32, 1),
  databasePath: ":memory:",
};

describe("LinkedIn platform adapter", () => {
  it("publishes a text-only post without touching image upload", async () => {
    const initializeImageUpload = vi.fn();
    const uploadImageBytes = vi.fn();
    const createPost = vi.fn().mockResolvedValue({ postId: "urn:li:share:111" });

    const adapter = createLinkedInAdapter(config, {
      initializeImageUpload,
      uploadImageBytes,
      createPost,
      readFile: vi.fn(),
    });

    const result = await adapter.publishPost({
      accessToken: "tok",
      authorUrn: "urn:li:person:123",
      content: { text: "Hello world" },
    });

    expect(initializeImageUpload).not.toHaveBeenCalled();
    expect(uploadImageBytes).not.toHaveBeenCalled();
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(result.postId).toBe("urn:li:share:111");
    expect(result.postUrl).toBe("https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A111/");
  });

  it("uploads the image then creates the post referencing the returned image urn", async () => {
    const readFile = vi.fn().mockResolvedValue(Buffer.from([1, 2, 3]));
    const initializeImageUpload = vi
      .fn()
      .mockResolvedValue({ uploadUrl: "https://upload.example/x", image: "urn:li:image:xyz" });
    const uploadImageBytes = vi.fn().mockResolvedValue(undefined);
    const createPost = vi.fn().mockResolvedValue({ postId: "urn:li:share:222" });

    const adapter = createLinkedInAdapter(config, {
      initializeImageUpload,
      uploadImageBytes,
      createPost,
      readFile,
    });

    await adapter.publishPost({
      accessToken: "tok",
      authorUrn: "urn:li:person:123",
      content: { text: "With image", mediaAbsolutePath: "/tmp/whatever.png" },
    });

    expect(initializeImageUpload).toHaveBeenCalledWith(config, "tok", "urn:li:person:123", undefined);
    expect(uploadImageBytes).toHaveBeenCalledWith(
      "https://upload.example/x",
      "tok",
      Buffer.from([1, 2, 3]),
      undefined,
    );
    const payloadSentToCreatePost = createPost.mock.calls[0][2];
    expect(payloadSentToCreatePost.content.media.id).toBe("urn:li:image:xyz");
  });

  it("does not call createPost if the image upload fails (no misleading partial publish)", async () => {
    const readFile = vi.fn().mockResolvedValue(Buffer.from([1, 2, 3]));
    const initializeImageUpload = vi.fn().mockRejectedValue(new Error("upload init failed"));
    const uploadImageBytes = vi.fn();
    const createPost = vi.fn();

    const adapter = createLinkedInAdapter(config, {
      initializeImageUpload,
      uploadImageBytes,
      createPost,
      readFile,
    });

    let caught: unknown;
    try {
      await adapter.publishPost({
        accessToken: "tok",
        authorUrn: "urn:li:person:123",
        content: { text: "With image", mediaAbsolutePath: "/tmp/whatever.png" },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImageUploadError);
    expect(createPost).not.toHaveBeenCalled();
  });

  it("builds the authorization url and identity via the underlying client", () => {
    const adapter = createLinkedInAdapter(config, {});
    expect(adapter.buildAuthorizationUrl("state123")).toContain("state=state123");
  });
});
