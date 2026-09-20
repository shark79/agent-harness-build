import { z } from "zod";

export const platformSchema = z.enum(["linkedin", "instagram", "facebook", "tiktok"]);
export type Platform = z.infer<typeof platformSchema>;

export const assetSchema = z.object({
  url: z.string().url(),
  kind: z.enum(["image", "video"]),
  altText: z.string().min(1).max(500).optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const postPayloadSchema = z.object({
  platform: platformSchema,
  copy: z.string().min(1).max(2200),
  assets: z.array(assetSchema).max(10),
  destinationAccount: z.string().min(1),
  callToAction: z.string().max(120).optional(),
});
export type PostPayload = z.infer<typeof postPayloadSchema>;

export const campaignBriefSchema = z.object({
  campaignName: z.string().min(2).max(100),
  product: z.string().min(10).max(2000),
  audience: z.string().min(5).max(1000),
  objective: z.string().min(5).max(500),
  tone: z.string().min(2).max(120),
  callToAction: z.string().min(2).max(120),
  platforms: z.array(platformSchema).min(1),
  visualFocus: z.string().min(2).max(1000).optional(),
  assetUrls: z.array(z.string().url()).max(10).default([]),
  researchUrl: z.string().url().optional(),
});
export type CampaignBrief = z.infer<typeof campaignBriefSchema>;

export type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" | "image/webp" }
  >;
  isError?: boolean;
};

export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string, remediation?: string): ToolResult {
  return jsonResult({ error: message, remediation, retryable: true });
}
