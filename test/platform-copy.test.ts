import assert from "node:assert/strict";
import test from "node:test";
import { buildPlatformCopyGuidance } from "../src/platform-copy.js";

test("platform copy guidance differentiates LinkedIn from Instagram and TikTok", () => {
  const result = buildPlatformCopyGuidance({
    brief: {
      campaignName: "FocusFlow launch",
      product: "A focus app that helps remote teams protect deep-work time.",
      audience: "Remote team leads managing knowledge workers.",
      objective: "Drive qualified free-trial signups.",
      tone: "calm and credible",
      callToAction: "Start a free trial",
      platforms: ["linkedin", "instagram", "tiktok"],
      assetUrls: [],
    },
    selectedConcept: {
      id: "product-hero",
      name: "Product hero",
      strategy: "Make the product immediately understandable.",
      visualDirection: "A calm, focused desktop scene.",
    },
  });

  const [linkedIn, instagram, tiktok] = result.platformGuides;
  assert.match(linkedIn!.writingDirection, /professional/i);
  assert.match(linkedIn!.lineGuidance, /1–2 sentences/i);
  assert.match(instagram!.writingDirection, /human observation/i);
  assert.match(instagram!.lineGuidance, /one or two short sentences/i);
  assert.match(tiktok!.writingDirection, /spoken-language hook/i);
  assert.notEqual(linkedIn!.format, instagram!.format);
  assert.match(result.executorInstructions.join(" "), /rather than repeating/i);
  assert.match(result.executorInstructions.join(" "), /not a quota/i);
  assert.match(result.executorInstructions.join(" "), /generic ad language/i);
  assert.match(result.executorInstructions.join(" "), /No explicit CTA/);
});
