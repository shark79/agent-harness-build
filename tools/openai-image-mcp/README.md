# OpenAI image MCP server

This local Streamable HTTP MCP server exposes `generate_campaign_image` and `generate_four_platform_campaign`. It calls OpenAI's Image API server-side and writes PNG files to `generated/`. The API key is read from `OPENAI_API_KEY` and is never returned by a tool.

The implementation uses the documented GPT Image 2.5 model IDs: `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. Custom dimensions are divisible by 16 and are cropped/resized to final platform sizes.

## Run

From the repository root:

```bash
cd tools/openai-image-mcp
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
test -n "$OPENAI_API_KEY" || echo "Set OPENAI_API_KEY in the environment or root .env"
python server.py
```

The server listens at `http://127.0.0.1:8801/mcp`. A browser GET is not a tool test; MCP clients use the protocol endpoint. The OpenAI key must have API billing/credits; a ChatGPT subscription alone does not provide API access.

## Add to TrueForge

Remove/disable the Higgsfield connector first. In TrueForge Settings → Connectors → Add MCP server, use:

| Field | Value |
|---|---|
| Name | `openai-image-generator` |
| URL | `http://127.0.0.1:8801/mcp` |
| Auth | None |

Do not enter `https://api.openai.com/v1/images/generations` as an MCP URL. That is an OpenAI REST endpoint, not an MCP server. Attach `openai-image-generator` to the campaign agent and require approval for image generation if the user wants a review checkpoint.

If you use the repository registration helper, add `--image-server openai-image-generator --image-tool generate_four_platform_campaign` to its `render` or `register` command. The helper will attach the image tool with approval required.

## Safety and operations

Do not expose port 8801 publicly. If TrueForge is in Docker, `127.0.0.1` inside the TrueForge container is not the host; use a shared Docker network or a host gateway address. Do not put the key in a `NEXT_PUBLIC_*` variable, agent instructions, MCP headers, or repository files.

The output directory is configurable with `OPENAI_IMAGE_OUTPUT_DIR`. Generated images and temporary source files are ignored by Git.
