---
name: campaign-brief
description: Turn a guided CampaignForge chat intake into a complete, structured campaign brief and identify any missing decision-critical inputs.
---

# Campaign Brief

Use this skill at the beginning of every CampaignForge run.

1. Call `assess_campaign_intake` with the campaign facts currently known. Gather campaign name, product, audience, objective, tone, CTA, selected platforms, and public brand/reference asset URLs.
2. Ask only the missing questions returned by that tool in one concise batch. Do not invent product claims, audience facts, or asset ownership; do not create an asset during intake.
3. If the user supplied a `researchUrl`, call `research_brand_url` and label every derived statement with its source URL. Research is optional, never a substitute for the user's approved brief.
4. Call `validate_campaign_brief` before handing the brief to strategy, then call `create_campaign_plan`.
5. Return the plan concepts and wait for explicit selection and approval. Explicitly distinguish user facts, sourced research, and assumptions.

Never request credentials, access tokens, or social-account IDs in chat. Connector credentials belong only in TrueForge Settings.
