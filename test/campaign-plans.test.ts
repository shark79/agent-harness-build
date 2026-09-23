import assert from "node:assert/strict";
import test from "node:test";
import { approveCampaignConcept, assessCampaignIntake, createCampaignPlan, getCampaignWorkflowStatus, recordImageGeneration, requireApprovedPlan } from "../src/campaign-plans.js";

const completeIntake = {
  campaignName: "Focus launch",
  product: "A focus app that helps remote teams protect deep-work time.",
  audience: "Remote team leads managing knowledge workers.",
  objective: "Drive qualified free-trial signups.",
  tone: "calm and credible",
  callToAction: "Start a free trial",
  platforms: ["linkedin"] as Array<"linkedin" | "instagram" | "facebook" | "tiktok">,
};

test("intake exposes only decision-critical missing questions", () => {
  const result = assessCampaignIntake({ product: completeIntake.product });
  assert.equal(result.readyForPlanning, false);
  assert.deepEqual(result.missingQuestions.map(question => question.field), ["objective", "audience", "platforms"]);
  assert.equal(result.missingQuestions.find(question => question.field === "objective")?.selection, "single");
  assert.equal(result.missingQuestions.find(question => question.field === "platforms")?.selection, "multiple");
  assert.equal(result.optionalPresentationQuestions[0]?.selection, "single");
});

test("planning supplies safe campaign-name and tone defaults", () => {
  const { campaignName: _campaignName, tone: _tone, ...minimumPlan } = completeIntake;
  const planned = createCampaignPlan(minimumPlan);
  assert.equal(planned.status, "awaiting_concept_approval");
  assert.equal(planned.campaignSummary?.campaignName, `Campaign for ${minimumPlan.product}`);
});

test("workflow status exposes active role, safe summary, and tool states", () => {
  const beforePlan = getCampaignWorkflowStatus();
  assert.equal(beforePlan.activeRole, "Orchestrator");
  assert.equal(beforePlan.tools.find(tool => tool.name === "assess_campaign_intake")?.state, "next");

  const planned = createCampaignPlan(completeIntake);
  const planning = getCampaignWorkflowStatus(planned.planId!);
  assert.equal(planning.activeRole, "Planner");
  assert.equal(planning.tools.find(tool => tool.name === "approve_campaign_concept")?.state, "next");

  approveCampaignConcept({ planId: planned.planId!, conceptId: "product-hero", approved: true });
  recordImageGeneration(planned.planId!, true);
  const delivered = getCampaignWorkflowStatus(planned.planId!);
  assert.equal(delivered.phase, "delivered");
  assert.equal(delivered.tools.find(tool => tool.name === "generate_image")?.state, "completed");
  assert.match(delivered.trueforgeSkills, /No native TrueForge skills/);
});

test("intake provides chat-first guidance without an interactive form contract", () => {
  const result = assessCampaignIntake({ product: completeIntake.product });
  assert.match(result.chatGuidance.format, /chat message/i);
  assert.match(result.chatGuidance.numberedQuestions, /literal visible bold prefix/i);
  assert.match(result.chatGuidance.choices, /never as buttons/i);
  assert.match(result.chatGuidance.platforms, /comma-separated/i);
  assert.match(result.markdownReplyTemplate!, /^I can shape this/m);
  assert.match(result.markdownReplyTemplate!, /\*\*1\. What should this campaign achieve\?\*\*/);
  assert.match(result.markdownReplyTemplate!, /Where should this run\?/);
  assert.match(result.markdownReplyTemplate!, /You can reply in a sentence or use the numbers\./);
  assert.doesNotMatch(result.markdownReplyTemplate!, /```text/);
});

test("quick image requests ask for placement but do not force a CTA", () => {
  const result = assessCampaignIntake({
    requestMode: "quick_image",
    product: "iPhone 18 Pro conceptual launch campaign",
  });
  assert.equal(result.readyForPlanning, false);
  assert.equal(result.effectiveIntake.objective, "Build awareness");
  assert.match(result.effectiveIntake.callToAction!, /No explicit CTA/);
  assert.deepEqual(result.missingQuestions.map(question => question.field), ["platforms"]);
  assert.match(result.chatGuidance.format, /where it will run/i);
});

test("quick image requests become plan-ready after placement without asking for a CTA", () => {
  const result = assessCampaignIntake({
    requestMode: "quick_image",
    product: "iPhone 18 Pro conceptual launch campaign",
    platforms: ["instagram", "facebook"],
    visualFocus: "Premium product close-up with dark studio lighting.",
  });
  assert.equal(result.readyForPlanning, true);
  assert.match(result.effectiveIntake.callToAction!, /No explicit CTA/);
});

test("full campaign requests retain the CTA gate", () => {
  const result = assessCampaignIntake({
    requestMode: "full_campaign",
    product: completeIntake.product,
    objective: completeIntake.objective,
    audience: completeIntake.audience,
    platforms: completeIntake.platforms,
  });
  assert.deepEqual(result.missingQuestions.map(question => question.field), ["callToAction"]);
});

test("awareness campaigns do not ask for a CTA", () => {
  const result = assessCampaignIntake({
    requestMode: "full_campaign",
    product: "Conceptual iPhone 18 Pro launch campaign.",
    objective: "Build launch awareness for the new device.",
    audience: "Adults interested in premium consumer technology.",
    platforms: ["instagram"],
  });
  assert.equal(result.readyForPlanning, true);
  assert.match(result.effectiveIntake.callToAction!, /No explicit CTA/);
  assert.doesNotMatch(result.markdownReplyTemplate || "", /What should people do/);
});

test("a plan requests a natural-language concept choice rather than a magic approval phrase", () => {
  const planned = createCampaignPlan(completeIntake);
  assert.match(planned.approvalPrompt!, /natural-language choice/i);
  assert.doesNotMatch(planned.approvalPrompt!, /explicitly approve/i);
});

test("image execution remains locked until a concept selection is recorded", () => {
  const planned = createCampaignPlan(completeIntake);
  assert.equal(planned.status, "awaiting_concept_approval");
  assert.ok(planned.planId);
  const locked = requireApprovedPlan(planned.planId!);
  assert.ok("error" in locked);
  assert.match(locked.error, /locked/i);

  const approved = approveCampaignConcept({ planId: planned.planId!, conceptId: "product-hero", approved: true });
  assert.equal(approved.status, "approved_for_execution");
  assert.ok("plan" in requireApprovedPlan(planned.planId!));
});
