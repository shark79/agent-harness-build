import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  buildPostPayload,
  createPost,
  exchangeAuthorizationCode,
  fetchUserinfo,
  initializeImageUpload,
  LinkedInApiError,
  uploadImageBytes,
} from "../src/platforms/linkedin/client.js";
import type { Config } from "../src/config.js";

const config: Config = {
  host: "127.0.0.1",
  port: 8810,
  publicUrl: "http://localhost:8810",
  linkedin: {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:8810/oauth/linkedin/callback",
    version: "202509",
  },
  tokenEncryptionKey: Buffer.alloc(32, 1),
  databasePath: ":memory:",
};

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("buildAuthorizationUrl", () => {
  it("requests exactly the openid profile w_member_social scopes", () => {
    const url = new URL(buildAuthorizationUrl(config, "the-state"));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.linkedin.redirectUri);
    expect(url.searchParams.get("state")).toBe("the-state");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("never includes the client secret", () => {
    const url = buildAuthorizationUrl(config, "the-state");
    expect(url).not.toContain(config.linkedin.clientSecret);
  });
});

describe("buildPostPayload", () => {
  it("produces the text-only payload shape", () => {
    const payload = buildPostPayload({ authorUrn: "urn:li:person:123", text: "Hello" });
    expect(payload).toEqual({
      author: "urn:li:person:123",
      commentary: "Hello",
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });

  it("produces the image payload shape referencing the image urn", () => {
    const payload = buildPostPayload({
      authorUrn: "urn:li:person:123",
      text: "Hello with image",
      imageUrn: "urn:li:image:abc123",
    }) as { content: { media: { id: string } } };
    expect(payload.content).toEqual({ media: { id: "urn:li:image:abc123" } });
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts the correct form-encoded fields to the token endpoint", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return jsonResponse({ access_token: "tok123", expires_in: 5184000, scope: "openid profile w_member_social" });
    });

    const result = await exchangeAuthorizationCode(config, "auth-code", fetchImpl as unknown as typeof fetch);

    expect(capturedUrl).toBe("https://www.linkedin.com/oauth/v2/accessToken");
    expect(capturedInit?.method).toBe("POST");
    const body = new URLSearchParams(capturedInit?.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
    expect(body.get("redirect_uri")).toBe(config.linkedin.redirectUri);
    expect(result).toEqual({ accessToken: "tok123", expiresIn: 5184000, scope: "openid profile w_member_social" });
  });
});

describe("fetchUserinfo", () => {
  it("sends a bearer token (plus the standard LinkedIn-Version/Restli headers) and returns sub/name", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return jsonResponse({ sub: "member-abc", name: "Ada Lovelace" });
    });

    const result = await fetchUserinfo(config, "access-token-value", fetchImpl as unknown as typeof fetch);

    expect(capturedHeaders?.get("authorization")).toBe("Bearer access-token-value");
    expect(capturedHeaders?.get("linkedin-version")).toBe("202509");
    expect(capturedHeaders?.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(result).toEqual({ sub: "member-abc", name: "Ada Lovelace" });
  });
});

describe("initializeImageUpload", () => {
  it("sends the initializeUploadRequest body and required headers", async () => {
    let capturedBody: string | undefined;
    let capturedHeaders: Headers | undefined;
    let capturedUrl = "";
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = init?.body as string;
      capturedHeaders = new Headers(init?.headers);
      return jsonResponse({
        value: { uploadUrl: "https://www.linkedin.com/dms-uploads/abc/image/0", image: "urn:li:image:abc" },
      });
    });

    const result = await initializeImageUpload(
      config,
      "access-token-value",
      "urn:li:person:123",
      fetchImpl as unknown as typeof fetch,
    );

    expect(capturedUrl).toBe("https://api.linkedin.com/rest/images?action=initializeUpload");
    expect(capturedHeaders?.get("authorization")).toBe("Bearer access-token-value");
    expect(capturedHeaders?.get("linkedin-version")).toBe("202509");
    expect(capturedHeaders?.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(JSON.parse(capturedBody ?? "{}")).toEqual({
      initializeUploadRequest: { owner: "urn:li:person:123" },
    });
    expect(result).toEqual({ uploadUrl: "https://www.linkedin.com/dms-uploads/abc/image/0", image: "urn:li:image:abc" });
  });
});

describe("uploadImageBytes", () => {
  it("PUTs the raw bytes with only a bearer auth header (no LinkedIn REST headers)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(null, { status: 201 });
    });

    const bytes = Buffer.from([1, 2, 3, 4]);
    await uploadImageBytes("https://www.linkedin.com/dms-uploads/abc/image/0", "access-token-value", bytes, fetchImpl as unknown as typeof fetch);

    expect(capturedInit?.method).toBe("PUT");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token-value");
    expect(headers.get("linkedin-version")).toBeNull();
    expect(headers.get("x-restli-protocol-version")).toBeNull();
  });

  it("throws a sanitized LinkedInApiError when the upload fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("upstream body with Authorization: Bearer secrettoken123456789", { status: 500 }));
    await expect(
      uploadImageBytes("https://example.com/upload", "access-token-value", Buffer.from([1]), fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(LinkedInApiError);
  });
});

describe("createPost", () => {
  it("sends the required headers and returns the post id parsed from x-restli-id", async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: string | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body as string;
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123456" } });
    });

    const result = await createPost(
      config,
      "access-token-value",
      buildPostPayload({ authorUrn: "urn:li:person:123", text: "Hello" }),
      fetchImpl as unknown as typeof fetch,
    );

    expect(capturedHeaders?.get("authorization")).toBe("Bearer access-token-value");
    expect(capturedHeaders?.get("linkedin-version")).toBe("202509");
    expect(capturedHeaders?.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(capturedHeaders?.get("content-type")).toBe("application/json");
    expect(JSON.parse(capturedBody ?? "{}")).toMatchObject({ author: "urn:li:person:123" });
    expect(result).toEqual({ postId: "urn:li:share:123456" });
  });

  it("sanitizes the upstream error body before throwing", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: "Bearer abcdefghijklmnopqrstuvwxyz0123456789 rejected", status: 401 }),
          { status: 401 },
        ),
    );

    let caught: unknown;
    try {
      await createPost(
        config,
        "access-token-value",
        buildPostPayload({ authorUrn: "urn:li:person:123", text: "Hello" }),
        fetchImpl as unknown as typeof fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LinkedInApiError);
    const apiError = caught as LinkedInApiError;
    expect(apiError.message).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(apiError.status).toBe(401);
  });
});
