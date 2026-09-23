---
name: campaign-evaluation
description: Evaluate CampaignForge concepts, media, and channel drafts for brand fit, clarity, factual support, and platform readiness before final review.
---

# Campaign Evaluation

Evaluate the selected concept and each platform draft against these criteria: brand/tone alignment, audience relevance, claim support, CTA clarity, asset-copy consistency, and platform fit.

Return a concise scorecard with `pass`, `revise`, or `block` for each criterion. A `block` prevents final approval; explain the smallest corrective action. Make revisions only to failed components, then re-run validation.

Before publishing, ensure the user has approved the complete campaign package. For every individual `publish_post` call, show the exact platform, destination account, copy, asset URLs, and immediate-publish effect, then request fresh explicit approval. A final-package approval never authorizes multiple external publishes.
