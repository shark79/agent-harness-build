import { errorResult, jsonResult, type ToolResult } from "./types.js";
import { saveGeneratedPng } from "./assets.js";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

export function buildAdvertisingPrompt(creativeBrief: string, size: "1024x1024" | "1024x1536" | "1536x1024"): string {
  const placement = size === "1536x1024"
    ? "landscape paid-social placement (3:2)"
    : size === "1024x1536"
      ? "vertical paid-social placement (2:3)"
      : "square paid-social placement (1:1)";
  return [
    "# Role and outcome",
    "Create one polished, production-ready static image for a paid advertising campaign. This is a single campaign asset, not a product catalogue, interface mock-up, mood board, collage, presentation slide, or poster series.",
    `Deliverable: ${placement}.`,
    "The campaign source data below is authoritative. Resolve non-essential visual details with coherent, premium art direction; do not ask questions or expose a creative brief in the image.",
    "# Campaign source data and approved execution direction",
    creativeBrief.trim(),
    "# Advertising art-direction requirements",
    "Establish one unmistakable focal subject at a glance. Translate the selected campaign benefit into the scene visually rather than relying on decorative effects. Use intentional foreground, subject, and background separation; realistic or deliberately stylized materials appropriate to the supplied direction; controlled commercial lighting; a cohesive restrained palette; and a strong hierarchy that reads on a mobile feed.",
    "Honor the specified composition, framing, and negative-space location. Keep that copy-safe area clean and calm: do not fill it with props, texture, interface elements, accidental text, or competing visual detail.",
    "# Text, brand, and safety constraints",
    "If the brief says NO IN-IMAGE TEXT, render no letters, words, numbers, logos, labels, watermarks, slogans, or call-to-action. If it supplies exact in-image wording, render only that exact wording once, at the requested placement; do not add any other text. Do not invent brand marks, product features, pricing, awards, testimonials, comparative claims, legal copy, or packaging details that were not supplied.",
    "# Exclusions",
    "No watermarks, UI chrome, browser frames, QR codes, split-screen layouts, contact sheets, generic stock-photo poses, duplicate products, or unrequested logos. Produce the final campaign image only.",
  ].join("\n\n");
}

export async function generateOpenAIImage(input: {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high";
}): Promise<ToolResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResult(
      "OpenAI image generation is not configured",
      "Set OPENAI_API_KEY on the CampaignForge MCP server. This is separate from the OpenAI provider configured in TrueForge.",
    );
  }

  try {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
        prompt: buildAdvertisingPrompt(input.prompt, input.size || "1024x1024"),
        n: 1,
        size: input.size || "1024x1024",
        quality: input.quality || process.env.OPENAI_IMAGE_QUALITY || "medium",
        output_format: "png",
      }),
    });
    const body = await response.json() as {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
      error?: { message?: string };
    };
    const image = body.data?.[0];
    const encodedImage = image?.b64_json;
    if (!response.ok || !encodedImage) {
      return errorResult(body.error?.message || `OpenAI Images API returned ${response.status}`, "Check API billing, model access, and the request prompt.");
    }
    const asset = await saveGeneratedPng(encodedImage);
    const inlineMarkdown = `![Generated campaign image](${asset.url})`;
    return jsonResult({
      provider: "openai",
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
      status: "completed",
      assetUrl: asset.url,
      inlineMarkdown,
      revisedPrompt: image.revised_prompt,
      renderInstruction: "In your final response, put inlineMarkdown on its own line exactly as provided. It renders the generated PNG directly in the chat. Do not replace it with a sandbox file, SVG, or download link.",
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "OpenAI image generation failed", "Do not retry automatically if the error is a billing or policy failure.");
  }
}
