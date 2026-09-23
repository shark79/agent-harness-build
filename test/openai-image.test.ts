import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvertisingPrompt, generateOpenAIImage } from "../src/openai-image.js";

test("builds a structured ad-production prompt around orchestrator and executor inputs", () => {
  const prompt = buildAdvertisingPrompt([
    "## Orchestrator-provided campaign inputs",
    "Campaign name: FocusFlow launch",
    "Target audience: independent designers with busy schedules.",
    "## Approved creative direction",
    "Concept: Product hero",
    "## Executor production direction",
    "HERO SUBJECT AND ACTION: A single cobalt FocusFlow timer on a calm desk.",
    "COMPOSITION: Three-quarter hero crop on the right.",
    "COPY-SAFE NEGATIVE SPACE: Clean pale-blue area in the upper left.",
    "TEXT POLICY: NO IN-IMAGE TEXT.",
  ].join("\n"), "1024x1536");

  assert.match(prompt, /paid advertising campaign/);
  assert.match(prompt, /vertical paid-social placement \(2:3\)/);
  assert.match(prompt, /Orchestrator-provided campaign inputs/);
  assert.match(prompt, /Executor production direction/);
  assert.match(prompt, /NO IN-IMAGE TEXT/);
  assert.match(prompt, /mobile feed/);
  assert.match(prompt, /No watermarks, UI chrome/);
});

test("OpenAI image generation fails safely when no API key is configured", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const result = await generateOpenAIImage({ prompt: "A clean editorial advertisement for a focus app" });
  const text = result.content.find((item): item is { type: "text"; text: string } => item.type === "text");
  assert.ok(text);
  assert.match(text.text, /OPENAI_API_KEY/);
  if (previous) process.env.OPENAI_API_KEY = previous;
});
