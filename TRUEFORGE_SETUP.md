# TrueForge harness setup

This is the primary setup guide for the TrueForge challenge. It uses the official documentation fetched on **September 19, 2026**, the published **TrueForge 0.2.0** runtime, and **trueforge-sdk 0.2.0**. Version pins make the recipe reproducible; they are not an automatic promise that future releases will remain compatible.

## What has changed

The dashboard now has a real TrueForge provider. It creates a named-agent session, starts a non-streaming turn, mirrors persisted session events, and sends approval decisions as subsequent turns. The agent runs in TrueForge; our Python process does not execute its tools or call its model.

The existing `local` provider remains an offline harness demonstration. Its fixture search, fake email, retry simulation, budget estimates, and heuristic evaluations do not establish that a TrueForge job completed.

The target job is **research a topic, create a sourced briefing, and deliver it only after human approval**. Real delivery still requires your configured connector and consent. Installing the runtime alone does not configure those resources or prove delivery.

## 1. Install and start

Use Node.js **22.14+**, npm, and Python **3.11+** (the backend Dockerfile uses 3.14).

From `agent-harness-build`:

```bash
if [ ! -f .env ]; then cp .env.example .env; fi
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
cd ../frontend
npm ci
cd ..
make trueforge
```

`make trueforge` runs `npx --yes @truefoundry/trueforge@0.2.0`. Open **http://localhost:8790**. Leave that terminal running. Local TrueForge stores its own SQLite database in the operating system's application-data directory; it does not use this project's `DATABASE_URL`. To choose a location, set `SQLITE_PATH` before running the command. Keep standalone mode on localhost.

The official unpinned discovery command is `npx @truefoundry/trueforge@latest`. Check the release and rerun the integration tests before changing this project's launcher pin. [TrueForge quickstart](https://trueforge.dev/quickstart)

## 2. Configure resources in TrueForge

For the campaign-image workflow, use the local OpenAI Image MCP server instead of Higgsfield. The server is implemented in [`tools/openai-image-mcp`](tools/openai-image-mcp), calls the OpenAI Image API, and writes the four requested platform assets locally. It keeps `OPENAI_API_KEY` server-side. Remove or disable Higgsfield before restarting TrueForge; a failed Higgsfield connector was the trigger seen in the earlier `ERR_UNHANDLED_REJECTION` crash logs.

Set the key in the shell or the root `.env` (never in frontend code), then start the server:

```bash
make image-mcp-setup
make image-mcp
```

It listens at `http://127.0.0.1:8801/mcp`. Add that URL in TrueForge Settings → Connectors as `openai-image-generator`, with no connector authentication, then attach it to the campaign agent. The OpenAI REST URL `/v1/images/generations` must not be entered as an MCP URL; the local server is the MCP protocol adapter. See [`tools/openai-image-mcp/README.md`](tools/openai-image-mcp/README.md).

Do this in the native TrueForge UI, using your own accounts. No provider credentials belong in the agent manifest or browser environment.

| Resource | Setup | Why it is used |
|---|---|---|
| Model | Settings → Models: configure a provider and choose a model | Actual agent reasoning |
| Search MCP | Settings → Connectors: connect a search server and inspect its tools | Real source discovery and retrieval |
| Delivery MCP | Connect an email-capable server and complete its OAuth/authentication | Actual delivery after review |
| Sandbox | Configure a supported isolated sandbox provider, then enable it on the agent | Generate and verify a report artifact |
| Skill | Enable a relevant configured skill, such as the quickstart's `web-artifacts-builder` | A reusable report-generation procedure |

Use the **configured names** and **actual tool names** displayed in your installation. Do not assume every connector calls its sending operation `send_email`. Expose only the search/fetch tools and delivery operation needed for the job. Review OAuth permissions before connecting your own account.

The current published sandbox guide documents Daytona setup, including snapshot creation permissions. Do not treat our backend/frontend Docker containers as agent sandboxes. Runtime capabilities can differ by release or local fallback; verify which provider actually executes code before presenting isolation as a safety guarantee. [Sandbox documentation](https://trueforge.dev/sandbox)

Reference pages: [Initial setup](https://trueforge.dev/harness/initial-setup), [MCP servers](https://trueforge.dev/mcp-servers), [Skills](https://trueforge.dev/skills).

## 3. Register the job agent

In a second terminal, from `backend/`:

```bash
. .venv/bin/activate
python -m app.trueforge_setup check
```

This reads configured resource names without printing credentials. Until the agent exists it exits nonzero with “not registered”; that is expected.

Use the native UI's Build Agent page, or the registration command below. Replace all uppercase placeholders with exact names from your configured resources:

```bash
python -m app.trueforge_setup render \
  --model 'PROVIDER/MODEL' \
  --search-server 'SEARCH_CONNECTOR' \
  --search-tool 'SEARCH_TOOL' \
  --search-tool 'FETCH_TOOL' \
  --delivery-server 'DELIVERY_CONNECTOR' \
  --delivery-tool 'DELIVERY_TOOL' \
  --sandbox \
  --skill 'web-artifacts-builder'
```

`render` validates the manifest with the installed SDK and prints it without contacting TrueForge. Remove the second `--search-tool` if the connector does not expose a separate fetch tool. Use only enabled skill names.

After reviewing the result, run the same arguments with **`register` instead of `render`**. For the image workflow, add `--image-server openai-image-generator --image-tool generate_four_platform_campaign`. Registration verifies that the model, connectors, tools, and skills exist, then creates `research-delivery`. It does not run a job or overwrite an existing agent. To revise an existing agent, use TrueForge's agent editor or choose a new `TRUEFORGE_AGENT_NAME`.

The generated configuration enables:

- Explicit approval for every exposed delivery tool (`require_approval_for_tools: ["@all"]`).
- Dynamic subagents for independent research, with instructions to keep delivery at the root.
- Deferred MCP tool loading (`preload: false`).
- Context compaction and a 30-iteration limit.
- User questions, handled in the native TrueForge session when needed.
- Sandbox, file downloads, skills, and large-response offloading when `--sandbox` is supplied.

For a smaller first run, omit `--sandbox` and `--skill`; MCP research plus approval-gated delivery still does real work. Add sandbox/report generation after verifying that flow. Skills require sandbox support. Generative UI is disabled because this custom dashboard renders text and traces; enable it in TrueForge if using the native UI for interactive reports.

Subagent read-only behavior in this recipe is an instruction, not a separate per-subagent permission boundary. Delivery approval is enforced by the harness regardless of which thread requests it.

The model name uses the configured `provider/model` form. This is different from the old local adapter's `PRIMARY_MODEL`. [Agent configuration](https://trueforge.dev/create-agent/overview)

## 4. Connect the dashboard

The root `.env` needs:

```dotenv
HARNESS_PROVIDER=trueforge
TRUEFORGE_BASE_URL=http://localhost:8790
TRUEFORGE_PUBLIC_URL=http://localhost:8790
TRUEFORGE_AGENT_NAME=research-delivery
TRUEFORGE_TOKEN=
DATABASE_URL=sqlite+aiosqlite:///./local.db
BACKEND_CORS_ORIGINS=http://localhost:3000
```

For local TrueForge without login, leave `TRUEFORGE_TOKEN` empty. For hosted OIDC, it is a backend-only OIDC ID token, not a model key or controller API key. Refresh expired tokens through your identity provider. Model and connector credentials are configured in TrueForge; `DEMO_MODE`, `OPENAI_API_KEY`, `PRIMARY_MODEL`, `EMAIL_MODE`, and local budget/retry settings do not control TrueForge execution. [SDK authentication](https://trueforge.dev/api/quickstart)

Create or edit `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the bridge and dashboard in separate terminals at the project root:

```bash
make dev-trueforge-backend
```

```bash
make dev-frontend
```

Open **http://localhost:3000**. The runtime banner should say **TrueForge · research-delivery**. `make dev-trueforge-backend` explicitly overrides any old `HARNESS_PROVIDER=local` in your existing environment file. It does not change that file.

The browser communicates with FastAPI. The bridge communicates with TrueForge. Keep TrueForge and bridge credentials out of `NEXT_PUBLIC_*` variables.

## 5. Complete one real job

Supply a real recipient you control in the task, for example:

> Compare three open-source agent platforms using current sources. Create a one-page briefing with links and, if the sandbox is configured, a downloadable report. Prepare delivery to [my test recipient]. Request my approval before sending.

Watch the TrueForge events in the trace. An approval card displays the exact tool name and arguments. Approve or deny each pending request; when several threads request approval, the bridge collects every decision before sending a single continuation.

Questions and MCP authentication pauses show `WAITING_FOR_INPUT`. Open TrueForge, locate the displayed session ID, and answer/connect there. The dashboard's next refresh discovers the continuation. Download sandbox artifacts in the native TrueForge session; the custom dashboard does not yet render artifact downloads or Generative UI.

Verify receipt and the provider's delivery identifier. A model's statement that it sent something is not proof. If you deny the action, verify no delivery occurred. No email or other external message is sent by setup or registration.

## 6. Persistence and API behavior

The bridge creates a separate `trueforge_runs` table automatically, preserving existing `runs` tables. It stores session/turn IDs and pending decisions. It mirrors native event IDs idempotently so refresh/replay does not duplicate trace rows. Model reasoning fields and OAuth URLs are excluded from that mirror.

`GET /api/runs/{id}` refreshes the linked TrueForge session. The dashboard polls it and reads the persisted trace. Remote execution continues even when this bridge or browser is disconnected. After a restart, selecting the run replays persisted TrueForge events; questions and approvals are not held in an in-memory agent object. A TrueForge server restart's behavior is owned by TrueForge and must be verified separately from restarting our bridge.

The current session-events endpoint supplies merged persisted events, including running-session events. This bridge uses polling/replay rather than token-delta SSE subscription. It retains the existing dashboard SSE endpoint but does not claim token-by-token TrueForge streaming. [Session events API](https://trueforge.dev/api-reference/agent-sessions/list-session-events)

A turn marked `done` may contain `required_actions`; only a done turn without pending actions completes the dashboard run. Approval responses use `user.tool_approval`, the original thread ID and tool-call ID, and `allow`/`deny`. Mutation requests have automatic SDK retries disabled to avoid duplicating a real job after an ambiguous response. [Turn and approval lifecycle](https://trueforge.dev/api/use-agent)

Current bridge limits:

- Run **one bridge worker/replica**; approval serialization is process-local. This does not limit TrueForge's own hosted topology.
- Polling currently replays the session history; very long sessions need incremental synchronization for efficiency.
- Use one approval surface at a time. Do not simultaneously resume a session in the native UI and the dashboard.
- If a turn submission is interrupted, the bridge reconciles any new remote turn. If no new turn can be found, it asks you to inspect TrueForge and does not resubmit automatically.
- Old heuristic evaluations are disabled for TrueForge runs; cost and retry metrics without a verified native mapping display as unavailable. Local `MAX_RUN_*` thresholds do not enforce TrueForge limits.
- The custom bridge has no user authentication or tenant ownership model. Keep it local/private; production requires access control in addition to TrueForge OIDC.

## 7. Test

From `backend/`:

```bash
DEMO_MODE=true HARNESS_PROVIDER=local EMAIL_MODE=demo .venv/bin/python -m pytest -q
```

From `frontend/`:

```bash
npm test
npm run build
```

The TrueForge tests exercise the real SDK over an HTTP MockTransport: session and turn creation, paginated events, approval allow/deny, parallel approvals, stale approvals, bridge restart, OAuth pause redaction, interrupted POST handling, and native continuation. They are integration-contract tests, not proof of live email, model, or sandbox behavior.

Manual acceptance:

1. Run actual research and inspect the returned sources.
2. Demonstrate an approval pause before delivery.
3. Deny once and confirm no delivery; on a fresh run, approve and confirm exactly one delivery.
4. Refresh during approval; the pending request must still appear.
5. Restart the bridge, select the same run, and resume it.
6. With sandbox enabled, verify the generated report opens and its contents match the sources.
7. Inspect subagent threads and skill/sandbox events in native TrueForge before claiming those capabilities in the video.

## 8. Hosted infrastructure

The official hosted recipe includes the TrueForge server/UI, PostgreSQL, and Redis. It is separate from this project's dashboard Compose file:

```bash
git clone https://github.com/truefoundry/trueforge.git
cd trueforge
cp packages/trueforge/.env.example packages/trueforge/.env
docker compose up --build
```

The documented hosted UI port is **8791**, versus **8790** for local npx. Check out a tested upstream release/commit for deployment. Configure its `PUBLIC_BASE_URL`, persistent storage, and OIDC before sharing. Do not assume the no-login hosted default is private.

To attach this project's containers to a host-running hosted TrueForge, run from `agent-harness-build`:

```bash
docker compose -f docker-compose.yml -f docker-compose.trueforge.yml up --build
```

The overlay defaults the backend connection to `http://host.docker.internal:8791`; override `TRUEFORGE_DOCKER_URL` if needed. Set `TRUEFORGE_PUBLIC_URL` to the URL your browser uses. For a remote dashboard build, set `NEXT_PUBLIC_API_URL` before building. Use persistent PostgreSQL or an explicit volume for the dashboard database too; the original Compose SQLite database is inside the container.

For a shared deployment, provide HTTPS, authentication for the custom dashboard/API, a protected backend OIDC token, backups, and a reverse proxy. The official docs also describe Helm and Railway options; no cloud account or hosted infrastructure is provisioned by this repository. [Official deployment instructions](https://trueforge.dev/quickstart)
