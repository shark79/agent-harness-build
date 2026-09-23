import assert from "node:assert/strict";
import test from "node:test";
import { createPostDraft, fingerprint, validatePlatformPayload } from "../src/social.js";

const payload = {
  platform: "tiktok" as const,
  copy: "Make more space for focused creative work. Join the waitlist.",
  assets: [{ url: "https://cdn.example.com/hero.mp4", kind: "video" as const }],
  destinationAccount: "tiktok-connected-creator",
  callToAction: "Join the waitlist",
};

function resultJson(result: ReturnType<typeof createPostDraft>): unknown {
  const text = result.content.find((item): item is { type: "text"; text: string } => item.type === "text");
  assert.ok(text, "expected text MCP result");
  return JSON.parse(text.text);
}

test("draft generation is deterministic and never publishes", () => {
  const result = createPostDraft(payload);
  const value = resultJson(result) as { status: string; payloadFingerprint: string };
  assert.equal(value.status, "draft-ready");
  assert.equal(value.payloadFingerprint, fingerprint(payload));
});

test("TikTok validation rejects a payload without video", () => {
  const result = validatePlatformPayload({ ...payload, assets: [{ url: "https://cdn.example.com/static.png", kind: "image" }] });
  const value = resultJson(result) as { valid: boolean; issues: string[] };
  assert.equal(value.valid, false);
  assert.ok(value.issues.some(issue => issue.includes("video asset")));
});

test("validation rejects an unconfigured publisher", () => {
  const original = process.env.TIKTOK_ACCESS_TOKEN;
  delete process.env.TIKTOK_ACCESS_TOKEN;
  const result = validatePlatformPayload(payload);
  const value = resultJson(result) as { valid: boolean; issues: string[] };
  assert.equal(value.valid, false);
  assert.ok(value.issues.some(issue => issue.includes("credentials")));
  if (original) process.env.TIKTOK_ACCESS_TOKEN = original;
});
