/**
 * Thin LinkedIn HTTP client. Every function takes an injectable `fetchImpl`
 * (defaulting to the global `fetch`) purely so tests can supply a fake
 * implementation instead of hitting the network - no real LinkedIn call is
 * ever made from the test suite.
 */
import type { Config } from "../../config.js";
import { sanitizeUpstreamMessage } from "../../util/sanitize.js";
import {
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_IMAGES_INITIALIZE_UPLOAD_URL,
  LINKEDIN_OAUTH_SCOPES,
  LINKEDIN_POSTS_URL,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
} from "./constants.js";

export class LinkedInApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
  }
}

async function readSanitizedErrorBody(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  let message = raw;
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    // not JSON, fall through to using the raw text (still sanitized below)
  }
  return sanitizeUpstreamMessage(message || `HTTP ${response.status}`);
}

function restHeaders(config: Config, accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": config.linkedin.version,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

export function buildAuthorizationUrl(config: Config, state: string): string {
  const url = new URL(LINKEDIN_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.linkedin.clientId);
  url.searchParams.set("redirect_uri", config.linkedin.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_OAUTH_SCOPES);
  return url.toString();
}

export async function exchangeAuthorizationCode(
  config: Config,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number; scope: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.linkedin.redirectUri,
    client_id: config.linkedin.clientId,
    client_secret: config.linkedin.clientSecret,
  });

  const response = await fetchImpl(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new LinkedInApiError(response.status, await readSanitizedErrorBody(response));
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };
  return { accessToken: data.access_token, expiresIn: data.expires_in, scope: data.scope };
}

export async function fetchUserinfo(
  config: Config,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sub: string; name: string }> {
  // LinkedIn's own OIDC userinfo docs only show `Authorization: Bearer`, since
  // /v2/userinfo predates the versioned /rest/ Rest.li gateway that
  // LinkedIn-Version/X-Restli-Protocol-Version are documented for. Sent here
  // anyway per this project's spec (harmless extra headers on a GET).
  const response = await fetchImpl(LINKEDIN_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": config.linkedin.version,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!response.ok) {
    throw new LinkedInApiError(response.status, await readSanitizedErrorBody(response));
  }

  const data = (await response.json()) as { sub: string; name: string };
  return { sub: data.sub, name: data.name };
}

export async function initializeImageUpload(
  config: Config,
  accessToken: string,
  ownerUrn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ uploadUrl: string; image: string }> {
  const response = await fetchImpl(LINKEDIN_IMAGES_INITIALIZE_UPLOAD_URL, {
    method: "POST",
    headers: restHeaders(config, accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });

  if (!response.ok) {
    throw new LinkedInApiError(response.status, await readSanitizedErrorBody(response));
  }

  const data = (await response.json()) as { value: { uploadUrl: string; image: string } };
  return { uploadUrl: data.value.uploadUrl, image: data.value.image };
}

/**
 * PUTs the raw image bytes to the upload URL returned by initializeImageUpload.
 * Per LinkedIn's documented upload mechanics this call only needs a bearer
 * token - it's not a `/rest/` Rest.li call, so it does NOT send
 * LinkedIn-Version / X-Restli-Protocol-Version / Content-Type headers.
 */
export async function uploadImageBytes(
  uploadUrl: string,
  accessToken: string,
  bytes: Buffer,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: bytes,
  });

  if (!response.ok) {
    throw new LinkedInApiError(response.status, await readSanitizedErrorBody(response));
  }
}

export function buildPostPayload(input: {
  authorUrn: string;
  text: string;
  imageUrn?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    author: input.authorUrn,
    commentary: input.text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (input.imageUrn) {
    base.content = { media: { id: input.imageUrn } };
  }
  return base;
}

export async function createPost(
  config: Config,
  accessToken: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ postId: string }> {
  const response = await fetchImpl(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: restHeaders(config, accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new LinkedInApiError(response.status, await readSanitizedErrorBody(response));
  }

  const postId = response.headers.get("x-restli-id");
  if (!postId) {
    throw new LinkedInApiError(
      response.status,
      "LinkedIn accepted the post but did not return an x-restli-id header.",
    );
  }
  return { postId };
}
