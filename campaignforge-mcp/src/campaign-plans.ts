import { randomUUID } from "node:crypto";
import { z } from "zod";
import { campaignBriefSchema, type CampaignBrief } from "./types.js";

const intakeSchema = z.object({
  requestMode: z.enum(["quick_image", "full_campaign"]).optional(),
  campaignName: z.string().min(2).max(100).optional(),
  product: z.string().min(10).max(2000).optional(),
  audience: z.string().min(5).max(1000).optional(),
  objective: z.string().min(5).max(500).optional(),
  tone: z.string().min(2).max(120).optional(),
  visualFocus: z.string().min(2).max(1000).optional(),
  callToAction: z.string().min(2).max(120).optional(),
  platforms: z.array(z.enum(["linkedin", "instagram", "facebook", "tiktok"])).min(1).optional(),
  assetUrls: z.array(z.string().url()).max(10).optional(),
  researchUrl: z.string().url().optional(),
  brandGuidelines: z.string().min(5).max(2000).optional(),
  requiredInImageText: z.string().min(1).max(200).optional(),
});

export type CampaignIntake = z.infer<typeof intakeSchema>;
export const campaignIntakeInputSchema = intakeSchema;

export type CampaignConcept = {
  id: "product-hero" | "audience-moment" | "benefit-proof";
  name: string;
  strategy: string;
  visualDirection: string;
};

type CampaignPlan = {
  id: string;
  brief: CampaignBrief;
  brandGuidelines?: string;
  requiredInImageText?: string;
  concepts: CampaignConcept[];
  selectedConceptId?: CampaignConcept["id"];
  approved: boolean;
  imageGenerated: boolean;
  activity: WorkflowActivity[];
  createdAt: string;
};

const plans = new Map<string, CampaignPlan>();

type WorkflowRole = "Orchestrator" | "Planner" | "Executor";
type WorkflowActivity = {
  role: WorkflowRole;
  tool: string;
  summary: string;
  at: string;
};

type Choice = { value: string; label: string; description?: string };
type IntakeQuestion = {
  field: keyof CampaignIntake;
  question: string;
  why: string;
  selection: "text" | "single" | "multiple";
  placeholder?: string;
  options?: Choice[];
};

const objectiveChoices: Choice[] = [
  { value: "Build awareness", label: "Build awareness", description: "Make more of the right people aware of the offer." },
  { value: "Generate leads", label: "Generate leads", description: "Drive enquiries, sign-ups, or qualified contacts." },
  { value: "Drive sales", label: "Drive sales", description: "Motivate a purchase or conversion now." },
  { value: "Drive app installs", label: "Drive app installs", description: "Acquire new app users." },
  { value: "Promote an event", label: "Promote an event", description: "Drive registrations or attendance." },
];

const platformChoices: Choice[] = [
  { value: "linkedin", label: "LinkedIn", description: "Professional feed placement." },
  { value: "instagram", label: "Instagram", description: "Feed, Story, or Reel creative." },
  { value: "facebook", label: "Facebook", description: "Feed and paid social placement." },
  { value: "tiktok", label: "TikTok", description: "Vertical, discovery-led placement." },
];

const styleChoices: Choice[] = [
  { value: "photorealistic product photography", label: "Photorealistic", description: "Polished, studio-quality campaign photography." },
  { value: "cinematic editorial", label: "Cinematic", description: "Dramatic lighting and a premium editorial mood." },
  { value: "clean graphic design", label: "Graphic", description: "Bold, minimal shapes and an art-directed layout." },
  { value: "warm lifestyle photography", label: "Lifestyle", description: "Natural, human and aspirational." },
];

const questions: IntakeQuestion[] = [
  { field: "product", question: "What product, service, or offer should this campaign promote?", why: "The hero subject and claims cannot be inferred safely.", selection: "text", placeholder: "Describe the product, offer, and any facts that must be accurate." },
  { field: "objective", question: "What is the primary campaign outcome?", why: "The objective determines the message and CTA.", selection: "single", options: objectiveChoices },
  { field: "audience", question: "Who is the specific target audience?", why: "Audience changes the creative, tone, and proof points.", selection: "text", placeholder: "For example: founders at 10–100 person SaaS companies." },
  { field: "platforms", question: "Where will this ad run? Select every platform that applies.", why: "Placement determines dimensions, pacing, and copy treatment.", selection: "multiple", options: platformChoices },
  { field: "callToAction", question: "What should a viewer do after seeing the ad?", why: "The CTA anchors the campaign message.", selection: "text", placeholder: "For example: Start a free trial, Shop now, or Book a demo." },
];

const optionalPresentationQuestions: IntakeQuestion[] = [
  { field: "tone", question: "Choose a visual direction (optional).", why: "This guides the first creative direction but is not required to plan.", selection: "single", options: styleChoices },
  { field: "requiredInImageText", question: "Should the image contain exact text?", why: "Generated text can be unreliable, so exact legal copy or a headline must be supplied deliberately.", selection: "text", placeholder: "Leave blank for a no-text image with clean overlay space." },
];

type InferredDefault = { field: keyof CampaignIntake; value: string | string[]; reason: string };

function compactProductName(product: string) {
  return product.replace(/\s+/g, " ").trim().slice(0, 120);
}

function isNoCta(value: string | undefined) {
  return value !== undefined && /^(none|no cta|nothing|n\/a|not applicable|just an ad|awareness)$/i.test(value.trim());
}

function isAwarenessObjective(value: string | undefined) {
  return value !== undefined && /\b(awareness|brand|launch|introduc|announce|visibility)\b/i.test(value);
}

/**
 * A direct image request is allowed to use ordinary creative defaults. A
 * campaign-management request stays deliberately incomplete until the
 * decision-critical brief fields are supplied.
 */
function normalizeIntake(input: CampaignIntake) {
  const intake: CampaignIntake = { ...input };
  const inferredDefaults: InferredDefault[] = [];
  const shouldUseNoCta = intake.requestMode === "quick_image" || isAwarenessObjective(intake.objective);
  if (shouldUseNoCta && (!intake.callToAction || isNoCta(intake.callToAction))) {
    intake.callToAction = "No explicit CTA — create an awareness visual with clean overlay space.";
    inferredDefaults.push({ field: "callToAction", value: intake.callToAction, reason: "This is launch or awareness work, not a direct-response conversion flow." });
  }
  if (intake.requestMode !== "quick_image" || !intake.product) return { intake, inferredDefaults };

  const product = compactProductName(intake.product);
  if (!intake.objective) {
    intake.objective = "Build awareness";
    inferredDefaults.push({ field: "objective", value: intake.objective, reason: "A standalone ad-image request normally needs an awareness-first creative direction." });
  }
  if (!intake.audience) {
    intake.audience = `General adult consumers likely to be interested in ${product}.`;
    inferredDefaults.push({ field: "audience", value: intake.audience, reason: "No target segment was supplied for this standalone visual." });
  }
  return { intake, inferredDefaults };
}

function markdownReplyTemplate(missing: IntakeQuestion[]) {
  const suggestions: Partial<Record<keyof CampaignIntake, string>> = {
    product: "For example: what it does, why it matters, and any facts that must stay accurate.",
    objective: "For example: build awareness, generate leads, drive sales, encourage installs, or promote an event.",
    audience: "For example: first-time founders, parents of young children, or frequent business travellers.",
    platforms: "For example: Instagram and Facebook feed, LinkedIn, TikTok, or a mix.",
    callToAction: "For example: Shop now, Start a free trial, Book a demo, or no CTA for an awareness visual.",
  };
  const labels: Partial<Record<keyof CampaignIntake, string>> = {
    product: "What are we promoting?",
    objective: "What should this campaign achieve?",
    audience: "Who should this feel made for?",
    platforms: "Where should this run?",
    callToAction: "What should people do after seeing it?",
  };
  const lines = missing.map((question, index) => `**${index + 1}. ${labels[question.field] || question.question}** — ${suggestions[question.field] || question.question}`);

  return [
    "I can shape this into a campaign that fits the audience and placement.",
    "",
    "A few quick choices will help me make the first direction useful:",
    "",
    ...lines,
    "",
    "You can reply in a sentence or use the numbers.",
  ].join("\n");
}

export function assessCampaignIntake(intake: CampaignIntake) {
  const normalized = normalizeIntake(intake);
  const missing = questions.filter(item => {
    // A CTA only becomes decision-critical after the user has selected an
    // objective that needs a direct response. Asking it beside platform
    // selection turns an awareness launch into an unnecessary form.
    if (item.field === "callToAction" && (!normalized.intake.objective || isAwarenessObjective(normalized.intake.objective))) return false;
    const value = normalized.intake[item.field];
    return value === undefined || (Array.isArray(value) && value.length === 0);
  });
  return {
    readyForPlanning: missing.length === 0,
    requestMode: normalized.intake.requestMode || "full_campaign",
    effectiveIntake: normalized.intake,
    inferredDefaults: normalized.inferredDefaults,
    missingQuestions: missing.map(({ field, question, why, selection, placeholder, options }) => ({ field, question, why, selection, placeholder, options })),
    optionalPresentationQuestions,
    chatGuidance: {
      format: "Ask the missing questions in one compact chat message. For a direct image request with no platform, always ask where it will run before planning; the user may answer in any natural format.",
      numberedQuestions: "Render each question with a literal visible bold prefix such as **1. Where should this run?**. Never rely on automatic ordered-list rendering or present an unnumbered batch of questions.",
      choices: "When options are available, show them inline as examples, never as buttons, forms, radio groups, or checkboxes.",
      platforms: "Accept a comma-separated or natural-language list of platforms and normalize known values to linkedin, instagram, facebook, and tiktok.",
    },
    markdownReplyTemplate: missing.length ? markdownReplyTemplate(missing) : undefined,
    optionalInformation: [
      "What the image should visibly emphasize, show, or avoid",
      "Brand assets or official logo/product photo (only if it must appear exactly)",
      "Brand colors, typography, and prohibited claims",
      "Exact in-image text or legal copy; otherwise the image will be no-text with overlay space",
    ],
    instruction: missing.length
      ? "Ask only the listed missing questions in one concise batch. Do not create a plan or generate an asset yet."
      : "Create a campaign plan next; do not generate an asset until the user clearly selects a concept.",
  };
}

function conceptsFor(brief: CampaignBrief): CampaignConcept[] {
  return [
    {
      id: "product-hero",
      name: "Product hero",
      strategy: `Make the product or offer the immediate proof of ${brief.objective}.`,
      visualDirection: "A premium, uncluttered hero composition with deliberate negative space for campaign copy.",
    },
    {
      id: "audience-moment",
      name: "Audience moment",
      strategy: `Show ${brief.audience} in the moment immediately before or after the product benefit.`,
      visualDirection: "An authentic contextual scene that privileges human relevance over product scale.",
    },
    {
      id: "benefit-proof",
      name: "Benefit proof",
      strategy: `Make the benefit behind ${brief.callToAction} visually obvious without inventing claims.`,
      visualDirection: "An editorial demonstration or outcome-led composition with one clear visual metaphor.",
    },
  ];
}

export function createCampaignPlan(input: CampaignIntake) {
  const normalized = normalizeIntake(input);
  const readiness = assessCampaignIntake(normalized.intake);
  if (!readiness.readyForPlanning) return { ...readiness, plan: undefined };
  const brief = campaignBriefSchema.parse({
    ...normalized.intake,
    campaignName: normalized.intake.campaignName || `Campaign for ${normalized.intake.product}`,
    tone: normalized.intake.tone || "clear, modern, brand-appropriate",
    visualFocus: normalized.intake.visualFocus || "A clear product or offer hero with a clean copy-safe area.",
    assetUrls: normalized.intake.assetUrls || [],
  });
  const plan: CampaignPlan = {
    id: randomUUID(),
    brief,
    brandGuidelines: normalized.intake.brandGuidelines,
    requiredInImageText: normalized.intake.requiredInImageText,
    concepts: conceptsFor(brief),
    approved: false,
    imageGenerated: false,
    activity: [{ role: "Planner", tool: "create_campaign_plan", summary: "Created three concepts and opened the concept-approval gate.", at: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  };
  plans.set(plan.id, plan);
  return {
    status: "awaiting_concept_approval",
    planId: plan.id,
    campaignSummary: { campaignName: brief.campaignName, objective: brief.objective, audience: brief.audience, platforms: brief.platforms, visualFocus: brief.visualFocus, callToAction: brief.callToAction },
    concepts: plan.concepts,
    approvalPrompt: "Present the concepts using friendly names. A clear natural-language choice of one concept is enough to continue; do not require a fixed approval phrase.",
  };
}

export function approveCampaignConcept(input: { planId: string; conceptId: CampaignConcept["id"]; approved: boolean }) {
  const plan = plans.get(input.planId);
  if (!plan) return { error: "Campaign plan was not found. Create a new plan in this active CampaignForge session.", retryable: true };
  if (!input.approved) return { status: "revision_requested", planId: plan.id, message: "Keep planning. Ask for the requested change, then create a new plan before generating an asset." };
  const concept = plan.concepts.find(item => item.id === input.conceptId);
  if (!concept) return { error: "Concept does not belong to this campaign plan.", retryable: false };
  plan.selectedConceptId = input.conceptId;
  plan.approved = true;
  plan.activity.push({ role: "Orchestrator", tool: "approve_campaign_concept", summary: `Recorded the user's approval for ${concept.name}.`, at: new Date().toISOString() });
  return { status: "approved_for_execution", planId: plan.id, selectedConcept: concept, instruction: "The executor may now call generate_image with this planId and a production-ready creative brief." };
}

export function recordImageGeneration(planId: string, success: boolean) {
  const plan = plans.get(planId);
  if (!plan) return;
  plan.imageGenerated = success;
  plan.activity.push({
    role: "Executor",
    tool: "generate_image",
    summary: success ? "Generated the approved campaign image." : "Attempted image generation, but no final image was produced.",
    at: new Date().toISOString(),
  });
}

export function getCampaignWorkflowStatus(planId?: string) {
  const roleDefinitions = [
    { role: "Orchestrator", responsibility: "Coordinates the workflow, approval gate, and delivery." },
    { role: "Planner", responsibility: "Collects the brief and creates campaign concepts." },
    { role: "Executor", responsibility: "Produces the approved image and platform-specific campaign copy." },
  ];
  const tools = [
    { name: "assess_campaign_intake", role: "Planner", purpose: "Checks missing brief details." },
    { name: "create_campaign_plan", role: "Planner", purpose: "Creates the three concepts." },
    { name: "approve_campaign_concept", role: "Orchestrator", purpose: "Records human approval." },
    { name: "generate_image", role: "Executor", purpose: "Creates the approved PNG." },
    { name: "get_platform_copy_guidance", role: "Executor", purpose: "Provides per-platform caption direction and length guidance." },
  ];
  const projectGuides = [
    { name: "campaign-brief", role: "Planner", purpose: "Structured intake and completeness checks." },
    { name: "campaign-strategy", role: "Planner", purpose: "Concept and positioning guidance." },
    { name: "campaign-creative", role: "Executor", purpose: "Production-brief guidance for images and platform-specific copy." },
  ];
  if (!planId) {
    return {
      phase: "intake",
      activeRole: "Orchestrator",
      activeAgent: "campaignforge",
      executionModel: "CampaignForge orchestrates private dynamic Planner and Executor phases; their work is surfaced through the parent agent.",
      decisionSummary: "Awaiting the minimum campaign brief before planning.",
      roles: roleDefinitions.map(item => ({ ...item, state: item.role === "Orchestrator" ? "active" : "waiting" })),
      tools: tools.map(item => ({ ...item, state: item.name === "assess_campaign_intake" ? "next" : "waiting" })),
      projectGuides,
      trueforgeSkills: "No native TrueForge skills are attached to this saved agent yet; project guides are shown separately.",
      activity: [],
    };
  }
  const plan = plans.get(planId);
  if (!plan) return { error: "Campaign plan was not found. Start a new campaign intake.", retryable: true };
  const phase = plan.imageGenerated ? "delivered" : plan.approved ? "execution" : "concept_approval";
  const activeRole: WorkflowRole = plan.imageGenerated ? "Orchestrator" : plan.approved ? "Executor" : "Planner";
  const toolState = (name: string) => plan.activity.some(item => item.tool === name) ? "completed" : (
    name === "generate_image" && plan.approved ? "next" :
    name === "approve_campaign_concept" && !plan.approved ? "next" : "waiting"
  );
  return {
    phase,
    activeRole,
    activeAgent: "campaignforge",
    executionModel: "CampaignForge orchestrates private dynamic Planner and Executor phases; their work is surfaced through the parent agent.",
    decisionSummary: plan.imageGenerated
      ? "The approved image is complete; CampaignForge can deliver it with the platform-specific copy package or handle a targeted revision."
      : plan.approved
        ? "The selected concept is approved; the executor may generate the image."
        : "Three concepts are ready; waiting for the user's selection and explicit approval.",
    roles: roleDefinitions.map(item => ({ ...item, state: item.role === activeRole ? "active" : plan.activity.some(event => event.role === item.role) ? "completed" : "waiting" })),
    tools: tools.map(item => ({ ...item, state: toolState(item.name) })),
    projectGuides,
    trueforgeSkills: "No native TrueForge skills are attached to this saved agent yet; project guides are shown separately.",
    activity: plan.activity,
  };
}

export function requireApprovedPlan(planId: string): { plan: CampaignPlan } | { error: string } {
  const plan = plans.get(planId);
  if (!plan) return { error: "Campaign plan was not found. Start with assess_campaign_intake and create_campaign_plan." };
  if (!plan.approved || !plan.selectedConceptId) return { error: "Image generation is locked until the user clearly selects a concept." };
  return { plan };
}
