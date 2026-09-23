# Configure CampaignForge in TrueForge

## 1. Start the local MCP service

Copy `.env.example` to `.env`, set a long `CAMPAIGNFORGE_API_KEY`, and leave `PUBLISHING_ENABLED=false`. Start the service with `npm run dev`.

The service binds to `127.0.0.1:8788` by default. It exposes:

- `GET /health`
- Streamable HTTP MCP at `POST /mcp`

## 2. Configure provider credentials

- In **TrueForge → Settings → Models**, configure OpenAI.
- Put `OPENAI_API_KEY` in the CampaignForge MCP `.env` for static-image generation. This key is separate from the OpenAI model-provider connection in TrueForge.
- Put `FIRECRAWL_API_KEY` in `.env` only if optional brand-URL research is desired.
- Configure OAuth/access tokens and non-production test account IDs for LinkedIn, Meta (Facebook + Instagram), and TikTok in `.env`.

Never place these credentials in a TrueForge skill or a user prompt.

## 3. Register the MCP connector

In **TrueForge → Settings → Connectors → Add MCP Server**:

- URL: `http://127.0.0.1:8788/mcp`
- Authentication: header auth
- Header: `x-api-key: <CAMPAIGNFORGE_API_KEY>`

For a hosted TrueForge deployment, expose the MCP service over HTTPS and use its public URL. Do not expose this local development server to the internet.

## 4. Register the skills

In **TrueForge → Settings → Skills**, import this repository and enable:

- `campaign-brief`
- `campaign-strategy`
- `campaign-creative`
- `platform-copy`
- `campaign-evaluation`

Skills need an enabled sandbox in TrueForge because they are materialized from Git at runtime.

## 5. Create the CampaignForge agent hierarchy

Create the user-facing parent agent named `campaignforge`. It creates private dynamic child threads named `CampaignForge Planner` and `CampaignForge Executor` when their respective phase begins.

- Attach the OpenAI model and CampaignForge MCP connector to `campaignforge`. Enable dynamic sub-agents and context compaction. Disable generative UI and user-question widgets so the regular chat composer is the only user-input surface.
- Give the parent only `assess_campaign_intake`, `create_campaign_plan`, `approve_campaign_concept`, and `generate_image`. It owns all state-changing calls and decides when to delegate.
- The parent must pass each dynamic child a self-contained, constrained role prompt. The Planner returns creative recommendations from the normalized brief; the Executor returns a production-ready image brief from an approved concept. Neither speaks to the campaign user, approves a concept, generates media, or publishes.
- Keep campaign content in the visible chat. Tool calls, dynamic sub-agent work, and internal identifiers belong only in TrueForge Agent steps.
- Configure `publish_post` as an approval-required/destructive tool in your TrueForge deployment. This is mandatory before enabling publishing.

Suggested test prompt: use the structured brief in `fixtures/launch-brief.json`, replacing its sample asset URL with a real public image URL before media generation.

## 6. Enable a test publish only when ready

Before setting `PUBLISHING_ENABLED=true`:

1. Validate each payload using `validate_platform_payload`.
2. Generate `create_post_draft` output and have a person inspect it.
3. Verify all providers are pointed to designated test accounts.
4. Confirm TrueForge approval is active for `publish_post`.

Publishing occurs immediately. CampaignForge v1 intentionally does not schedule posts or retry a failed publication automatically. It generates static images only; add a dedicated photo-post adapter before attempting TikTok live publishing.
