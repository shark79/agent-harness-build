import type { CampaignConcept } from "./campaign-plans.js";
import type { CampaignBrief, Platform } from "./types.js";

type CopyGuidanceInput = {
  brief: CampaignBrief;
  selectedConcept: CampaignConcept;
  copyDirection?: string;
};

type PlatformGuide = {
  platform: Platform;
  audienceFit: string;
  writingDirection: string;
  lineGuidance: string;
  format: string;
  avoid: string;
};

const guides: Record<Platform, Omit<PlatformGuide, "platform">> = {
  linkedin: {
    audienceFit: "Professional, decision-oriented readers who value relevance, clarity, and credible business context.",
    writingDirection: "Lead with one credible professional insight, outcome, or tension relevant to the supplied audience. Make the value clear early in plain language; the voice should feel considered and useful, not like a press release or a pitch deck.",
    lineGuidance: "Default to one compact paragraph of 1–2 sentences (about 20–55 words). LinkedIn feed copy should earn attention with a focused value proposition, not a long explanation.",
    format: "Use a specific professional hook plus one supporting thought. Add a short, direct CTA only for a direct-response brief. Omit hashtags unless the user asks for them or they are genuinely useful.",
    avoid: "Casual slang, engagement bait, unsupported statistics, exaggerated superlatives, empty business buzzwords, and hashtag stuffing.",
  },
  instagram: {
    audienceFit: "Visual-first social audiences responding to a clear feeling, aesthetic, or lifestyle/product moment.",
    writingDirection: "Open with one vivid, human observation that matches the image’s feeling or moment. Make the reader feel the product’s appeal instead of describing every visible detail; warm and stylish is better than overly promotional.",
    lineGuidance: "Default to one or two short sentences (about 10–35 words). The visual remains the hero, so the caption should add mood, meaning, or a light invitation—not repeat the ad.",
    format: "Use a feeling-led thought or an elegant product moment. Add a light CTA only for a direct-response brief. Omit hashtags by default; add only a small relevant set when the user specifically wants them.",
    avoid: "Corporate boilerplate, feature inventories, forced slang, generic engagement bait, trying too hard to sound poetic, and hashtag stuffing.",
  },
  facebook: {
    audienceFit: "Broad community-oriented audiences who benefit from direct context and an approachable explanation of why the offer matters.",
    writingDirection: "Start with a relatable, plainspoken benefit or moment, then make the offer easy to understand. Write like a helpful person explaining why something is worth noticing, rather than a brand broadcasting at people.",
    lineGuidance: "Default to 1–2 short sentences (about 20–50 words). Give enough practical context to make the message clear, then stop before it turns into a sales letter.",
    format: "Use a familiar benefit-first opening and one clarifying thought. Add a plain-language CTA only for a direct-response brief. Omit hashtags unless requested.",
    avoid: "Clickbait, vague claims, excessive emoji, unsupported social proof, jargon that hides the actual benefit, and unnecessary urgency.",
  },
  tiktok: {
    audienceFit: "Fast-scrolling, culture-aware audiences who need an immediate, human-readable hook before deciding to pause.",
    writingDirection: "Start with a sharp, spoken-language hook: a relatable tension, unexpected observation, or product reveal. The voice should feel native and self-aware, but never imitate slang, trends, or creators the brief did not supply.",
    lineGuidance: "Default to one concise hook or two very short sentences (about 8–28 words). For this static-image workflow, the caption should create a pause and payoff without trying to write a video script.",
    format: "Use hook → payoff, with a CTA only for a direct-response brief. Omit hashtags by default; add only user-requested or genuinely relevant tags.",
    avoid: "Invented trend references, forced Gen-Z language, long explanatory copy, unsupported claims, recycled meme language, and hashtag stuffing.",
  },
};

/**
 * Gives the Executor per-platform editorial direction. The Executor is the
 * writer: it uses this grounded guidance and the approved campaign facts to
 * produce the actual copy visible to the user.
 */
export function buildPlatformCopyGuidance(input: CopyGuidanceInput) {
  const platformGuides: PlatformGuide[] = input.brief.platforms.map(platform => ({ platform, ...guides[platform] }));
  return {
    status: "ready_for_executor_copy",
    campaignContext: {
      campaignName: input.brief.campaignName,
      product: input.brief.product,
      objective: input.brief.objective,
      audience: input.brief.audience,
      tone: input.brief.tone,
      callToAction: input.brief.callToAction,
      visualFocus: input.brief.visualFocus,
      selectedConcept: {
        name: input.selectedConcept.name,
        strategy: input.selectedConcept.strategy,
        visualDirection: input.selectedConcept.visualDirection,
      },
      copyDirection: input.copyDirection || "Write useful, platform-native campaign copy that complements the approved creative.",
    },
    platformGuides,
    executorInstructions: [
      "Write one final, ready-to-use post caption for every requested platform, using each platform's guide rather than repeating a single caption.",
      "Treat each platform's length guidance as a target for a compact, complete caption—not a quota. Never pad with fragments, emojis, line breaks, or hashtags. A single sharp sentence is better than a bland second sentence.",
      "Use supplied facts for every product feature, price, proof point, date, customer result, and claim. Do not manufacture specificity to make a caption sound stronger.",
      "Keep the campaign message coherent across platforms while adapting hook, tone, length, and CTA treatment to the platform. When callToAction says `No explicit CTA`, do not write that phrase or any substitute CTA; end on a clear campaign thought instead.",
      "Before returning, remove generic ad language such as 'Introducing', 'Revolutionize', 'Elevate', 'Discover the future', or an unsupported superlative. The opening should sound specific to this product, audience, and selected creative route.",
      "Return user-facing Markdown only: `## Campaign copy`, then one `### Platform` section per requested platform. Do not mention prompts, tools, agents, or internal process.",
    ],
  };
}
