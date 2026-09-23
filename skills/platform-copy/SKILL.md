---
name: platform-copy
description: Adapt an approved CampaignForge concept and completed assets into concise, channel-specific LinkedIn, Instagram, Facebook, and TikTok drafts.
---

# Platform Adaptation

Create one post payload per selected platform from the exact same approved concept and asset manifest.

- LinkedIn: lead with a professional audience insight and a single clear CTA.
- Instagram: use visual-first caption structure, readable line breaks, and only relevant hashtags.
- Facebook: make the value and action clear without relying on context outside the post.
- TikTok: produce a caption and a photo-post draft for review. Do not attempt live TikTok publishing in this static-image-only version.

For each payload, use the configured destination account and call `validate_platform_payload`. If validation fails, revise the affected payload instead of publishing it.

Then call `create_post_draft` for each valid payload. Present all drafts together as the final campaign package. Ask for approval of the full package; do not invoke `publish_post`.
