# Agent Control Tower

Research a topic, prepare a sourced briefing, and request human approval before delivering it—using **TrueForge** as the agent runtime, with a Next.js dashboard for execution history and approval review.

**Start here: [TrueForge setup guide](TRUEFORGE_SETUP.md).** It covers model/MCP configuration, optional sandbox and skills, agent registration, local execution, tests, and hosted infrastructure. The setup follows documentation checked September 19, 2026 and pins TrueForge and its Python SDK to 0.2.0.

## Two runtime modes

| Mode | Purpose |
|---|---|
| `HARNESS_PROVIDER=trueforge` | Official TrueForge SDK integration: real named-agent sessions, remote tools, approvals, and persistent history |
| `HARNESS_PROVIDER=local` | Offline custom-harness demo: keyword planning, fixture search, simulated email, retries, budgets, and heuristic evaluation |

The default settings preserve the offline demo. `make dev-trueforge-backend` explicitly selects TrueForge. The dashboard labels the active mode. A valid challenge demonstration requires configured real resources and a verified completed job; offline simulation alone does not qualify.

## Quick start

Requirements: Node.js 22.14+, Python 3.11+ (3.14 matches the backend image), npm. From this folder:

```bash
make setup
make trueforge
```

Open http://localhost:8790. Configure a model, search and delivery MCP connectors, and a saved agent using [the setup guide](TRUEFORGE_SETUP.md). Model and connector secrets stay in TrueForge settings. Then, in separate terminals:

```bash
make dev-trueforge-backend
```

```bash
make dev-frontend
```

Open http://localhost:3000. Backend health is http://localhost:8000/health. Backend API docs are http://localhost:8000/docs. Use `make trueforge-check` to inspect configured resource names and verify the job agent exists.

## Architecture

```text
Next.js dashboard → FastAPI bridge → TrueForge session / turns
                                      ├─ model provider
                                      ├─ search MCP
                                      ├─ approval → delivery MCP
                                      └─ optional subagents / skills / sandbox
```

TrueForge owns execution and approval enforcement. The bridge stores remote session/turn IDs and mirrors persisted events. Selecting a run refreshes its state, including after a bridge restart. Questions, OAuth, artifact downloads, and interactive native features are handled in the TrueForge UI.

The offline implementation remains in `backend/app/harness/orchestrator.py`; its architecture is documented in [ARCHITECTURE.md](ARCHITECTURE.md). Its illustrative budgets and evaluator do not apply to remote TrueForge runs.

For the campaign-image workflow, run `make image-mcp-setup` and `make image-mcp`. This local MCP server wraps OpenAI's Image API and exposes platform-specific campaign generation. Keep the OpenAI key only in the server environment; configure `openai-image-generator` in TrueForge and remove Higgsfield. Details are in [tools/openai-image-mcp/README.md](tools/openai-image-mcp/README.md).

## Tests

```bash
cd backend
DEMO_MODE=true HARNESS_PROVIDER=local EMAIL_MODE=demo .venv/bin/python -m pytest -q
cd ../frontend
npm test
npm run build
```

The backend suite includes tests using the real TrueForge SDK against an HTTP mock: approvals, multiple pending calls, pagination, replay, reconnect, and interrupted submissions. Model calls, real delivery, and sandbox execution require a separate live acceptance run with your credentials.

## Important limits

- Use one bridge worker/replica. Its approval lock is process-local.
- The custom dashboard/API has no authentication; keep it local/private.
- The bridge polls persisted events, rather than streaming individual model tokens.
- Native questions and OAuth pauses must be completed in TrueForge.
- Offline heuristic evaluation is disabled for TrueForge runs. Unknown cost/retry metrics are not fabricated.
- Real delivery, provider credentials, and sandbox configuration are not bundled or automatically provisioned.

For the offline demo's manual setup, see [SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md). For the challenge demonstration, see [launch-kit/DEMO_SCRIPT.md](launch-kit/DEMO_SCRIPT.md).
