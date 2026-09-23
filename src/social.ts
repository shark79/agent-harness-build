import crypto from "node:crypto";
import { assetSchema, errorResult, jsonResult, postPayloadSchema, type Platform, type PostPayload, type ToolResult } from "./types.js";

const META_GRAPH = "https://graph.facebook.com/v22.0";
const TIKTOK_API = "https://open.tiktokapis.com";

function configuredDestination(platform: Platform): string | undefined {
  if (platform === "linkedin") return process.env.LINKEDIN_AUTHOR_URN;
  if (platform === "facebook") return process.env.META_FACEBOOK_PAGE_ID;
  if (platform === "instagram") return process.env.META_INSTAGRAM_ACCOUNT_ID;
  return process.env.TIKTOK_CREATOR_ID || "tiktok-connected-creator";
}

function hasCredentials(platform: Platform): boolean {
  if (platform === "linkedin") return Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_AUTHOR_URN);
  if (platform === "facebook" || platform === "instagram") return Boolean(process.env.META_ACCESS_TOKEN && configuredDestination(platform));
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}

export function validatePlatformPayload(input: unknown): ToolResult {
  const parsed = postPayloadSchema.safeParse(input);
  if (!parsed.success) return errorResult("Invalid post payload", parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  const payload = parsed.data;
  const issues: string[] = [];
  const destination = configuredDestination(payload.platform);
  if (destination && payload.destinationAccount !== destination) issues.push(`destinationAccount must equal configured ${payload.platform} destination (${destination})`);
  if (!hasCredentials(payload.platform)) issues.push(`${payload.platform} credentials are not configured on this MCP server`);
  if (payload.platform === "instagram" && !payload.assets.some(asset => asset.kind === "image" || asset.kind === "video")) issues.push("Instagram requires at least one image or video asset");
  if (payload.platform === "tiktok" && !payload.assets.some(asset => asset.kind === "video")) issues.push("TikTok publishing requires a publicly reachable video asset");
  if (payload.platform === "linkedin" && payload.copy.length > 3000) issues.push("LinkedIn copy exceeds the configured safe limit");
  return jsonResult({ valid: issues.length === 0, platform: payload.platform, issues, payloadFingerprint: fingerprint(payload) });
}

export function fingerprint(payload: PostPayload): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function publishingDisabled(): ToolResult | undefined {
  if (process.env.PUBLISHING_ENABLED !== "true") return errorResult("Publishing is disabled", "Set PUBLISHING_ENABLED=true only after configuring TrueForge approval for publish_post and test-account credentials.");
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* preserve response text */ }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function publishLinkedIn(payload: PostPayload): Promise<unknown> {
  const asset = payload.assets[0];
  const body: Record<string, unknown> = {
    author: payload.destinationAccount,
    commentary: asset ? `${payload.copy}\n\n${asset.url}` : payload.copy,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  return requestJson("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN!}`,
      "Content-Type": "application/json",
      "Linkedin-Version": process.env.LINKEDIN_VERSION || "202501",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
}

async function publishFacebook(payload: PostPayload): Promise<unknown> {
  const image = payload.assets.find(asset => asset.kind === "image");
  const endpoint = image ? `${META_GRAPH}/${payload.destinationAccount}/photos` : `${META_GRAPH}/${payload.destinationAccount}/feed`;
  const params = new URLSearchParams({ access_token: process.env.META_ACCESS_TOKEN!, [image ? "url" : "message"]: image ? image.url : payload.copy });
  if (image) params.set("caption", payload.copy); else if (payload.assets[0]) params.set("link", payload.assets[0].url);
  return requestJson(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
}

async function publishInstagram(payload: PostPayload): Promise<unknown> {
  const asset = payload.assets[0];
  if (!asset) throw new Error("Instagram requires an image or video asset");
  const create = new URLSearchParams({ access_token: process.env.META_ACCESS_TOKEN!, caption: payload.copy });
  if (asset.kind === "video") { create.set("media_type", "REELS"); create.set("video_url", asset.url); }
  else create.set("image_url", asset.url);
  const container = await requestJson(`${META_GRAPH}/${payload.destinationAccount}/media`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: create }) as { id?: string };
  if (!container.id) throw new Error("Instagram did not return a media container ID");
  const publish = new URLSearchParams({ access_token: process.env.META_ACCESS_TOKEN!, creation_id: container.id });
  return requestJson(`${META_GRAPH}/${payload.destinationAccount}/media_publish`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publish });
}

async function publishTikTok(payload: PostPayload): Promise<unknown> {
  const video = payload.assets.find(asset => asset.kind === "video");
  if (!video) throw new Error("TikTok requires a publicly reachable video asset");
  return requestJson(`${TIKTOK_API}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN!}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: payload.copy.slice(0, 2200), privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: video.url },
    }),
  });
}

export async function publishPost(input: unknown): Promise<ToolResult> {
  const disabled = publishingDisabled();
  if (disabled) return disabled;
  const parsed = postPayloadSchema.safeParse(input);
  if (!parsed.success) return errorResult("Invalid publish payload", parsed.error.message);
  const validation = validatePlatformPayload(parsed.data);
  const validationText = validation.content.find((item): item is { type: "text"; text: string } => item.type === "text")?.text ?? "";
  if (validationText.includes('"valid": false')) return errorResult("Publish payload failed validation", validationText);

  try {
    const payload = parsed.data;
    const receipt = payload.platform === "linkedin" ? await publishLinkedIn(payload)
      : payload.platform === "facebook" ? await publishFacebook(payload)
      : payload.platform === "instagram" ? await publishInstagram(payload)
      : await publishTikTok(payload);
    return jsonResult({ status: "submitted", platform: payload.platform, destinationAccount: payload.destinationAccount, payloadFingerprint: fingerprint(payload), receipt });
  } catch (error) {
    return errorResult(error instanceof Error ? `Publish failed: ${error.message}` : "Publish failed", "Do not retry automatically; show the error to the user and request a new approval before another publish attempt.");
  }
}

export function createPostDraft(input: unknown): ToolResult {
  const parsed = postPayloadSchema.safeParse(input);
  if (!parsed.success) return errorResult("Invalid draft payload", parsed.error.message);
  const payload = parsed.data;
  return jsonResult({
    status: "draft-ready",
    payloadFingerprint: fingerprint(payload),
    platform: payload.platform,
    destinationAccount: payload.destinationAccount,
    copy: payload.copy,
    assets: payload.assets.map(asset => assetSchema.parse(asset)),
    instructions: "Ask for final campaign approval before requesting a per-post publish approval. publish_post must be configured as an approval-required tool in TrueForge.",
  });
}

export async function getPostStatus(platform: Platform, postId: string): Promise<ToolResult> {
  if (!/^[A-Za-z0-9_:%-]+$/.test(postId)) return errorResult("Invalid platform post ID");
  if (!hasCredentials(platform)) return errorResult(`${platform} credentials are not configured`);
  try {
    const receipt = platform === "linkedin"
      ? await requestJson(`https://api.linkedin.com/rest/posts/${encodeURIComponent(postId)}`, { headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN!}`, "Linkedin-Version": process.env.LINKEDIN_VERSION || "202501", "X-Restli-Protocol-Version": "2.0.0" } })
      : platform === "facebook" || platform === "instagram"
        ? await requestJson(`${META_GRAPH}/${encodeURIComponent(postId)}?access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN!)}`, { method: "GET" })
        : await requestJson(`${TIKTOK_API}/v2/post/publish/status/fetch/`, { method: "POST", headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN!}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ publish_id: postId }) });
    return jsonResult({ platform, postId, status: receipt });
  } catch (error) {
    return errorResult(error instanceof Error ? `Status request failed: ${error.message}` : "Status request failed");
  }
}
