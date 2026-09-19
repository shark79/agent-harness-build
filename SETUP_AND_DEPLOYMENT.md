> **Scope:** This document describes the original offline custom-harness demo. For the implemented TrueForge integration and challenge setup, use [TRUEFORGE_SETUP.md](TRUEFORGE_SETUP.md). Statements below about an unimplemented TrueForge provider refer to the earlier scaffold.

# Agent Control Tower: introduction, setup, testing, and deployment

This guide describes the implementation in this repository, inspected on September 19, 2026. Commands assume macOS/Linux and a bash-compatible shell. Deployment examples are instructions to follow; no cloud resources were provisioned during this review.

**Agent Control Tower is an AI agent harness: a runtime that controls how an agent calls tools, requests human approval, records execution, handles failures, and consumes its budget.** The agent proposes actions; the harness decides whether and how those actions execute. A web dashboard makes the execution trace, approval decisions, results, and evaluation scores visible.

The project is suitable for a local demonstration and as a foundation for further development. It includes working governance and persistence, but its execution state is tied to one backend process. A public, durable, multi-user service requires additional implementation described below.

## 1. What the application does

For a task such as “Research AI agent observability and email me a summary,” the application:

1. Creates a run in the database and starts an asynchronous background task.
2. Asks an agent adapter for the next tool call or final result.
3. Checks the requested tool against the permission registry.
4. Executes an allowed tool, pauses for approval, or returns a denial to the agent.
5. Records model activity, tool activity, approvals, retries, and completion as trace events.
6. Tracks model token usage and estimated cost, checking the budget after model calls.
7. Streams events to the dashboard using Server-Sent Events (SSE), with a polling fallback.
8. Evaluates the final run against six deterministic criteria when the evaluation endpoint is called. The dashboard calls it after observing a terminal run.

There are two agent modes:

| Mode | Behavior | External credentials |
|---|---|---|
| Demo | Keyword-driven, deterministic planning; exercises the harness without an LLM | None with SQLite |
| Real model | Uses the existing model adapter to request tool calls and generate responses | Model API key and access to the configured model |

The tools are deliberately small:

| Tool | Policy | Current implementation |
|---|---|---|
| `web_search` | Allow | Returns local fixture results; does not search the internet |
| `calculator` | Allow | Evaluates supported arithmetic expressions |
| `send_email` | Require approval | Logs a demo email and returns a simulated confirmation |
| `delete_record` | Deny | Demonstrates a forbidden tool request; the harness prevents execution |

Switching to a real model does **not** turn search or email into real external integrations. `EMAIL_MODE=smtp` is unimplemented. `HARNESS_PROVIDER=trueforge` selects an unimplemented extension point.

## 2. Architecture and technology stack

```mermaid
flowchart LR
    Browser[Browser dashboard] -->|HTTP API and approval decisions| API[FastAPI backend]
    API --> Harness[Harness orchestrator]
    Harness <--> Agent[Demo or real model adapter]
    Harness --> Policy[Permission checks]
    Policy --> Approval[Human approval gate]
    Policy --> Tools[Tool registry]
    Approval --> Tools
    Harness --> DB[(SQLite or PostgreSQL)]
    Harness --> Events[In-process event bus]
    Events -->|SSE| Browser
    API --> Eval[Deterministic evaluator]
    Eval <--> DB
```

| Layer | Repository implementation |
|---|---|
| Frontend | Next.js `16.3.5`, React `19.3.0`, TypeScript `7.0.2`; CSS in `frontend/app/globals.css` |
| Backend | Python, FastAPI, Uvicorn, Pydantic settings |
| Agent runtime | Custom asynchronous orchestrator and adapter protocol |
| Model integration | `openai` Python SDK; existing adapter uses Chat Completions tool calling |
| Persistence | SQLAlchemy async ORM; `aiosqlite` for SQLite or `asyncpg` for PostgreSQL |
| Database entities | Runs, trace events, approvals, evaluations |
| Live updates | SSE with an in-memory event bus; frontend polling fallback |
| Tests | pytest/pytest-asyncio/httpx; Vitest frontend API-client tests |
| Containers | Backend `python:3.14-slim`; frontend multistage `node:22-alpine` |
| Packaging | Two Dockerfiles and a two-service Docker Compose file |
| Optional database tooling | Supabase CLI configuration; application accesses PostgreSQL directly |

Tailwind is mentioned in the original README but is not a dependency in the current frontend package manifest. No Redis, queue worker, vector database, Kubernetes manifests, Terraform, or CI workflow is included.

Useful code locations:

- `backend/app/harness/`: orchestration, permissions, approvals, retries, routing, budgets, tracing, evaluation.
- `backend/app/agent/`: adapter protocol and implementations.
- `backend/app/tools/`: registry, permission metadata, and tool implementations.
- `backend/app/api/`: HTTP and SSE endpoints.
- `backend/app/models/`: database schema and session setup.
- `frontend/app/` and `frontend/components/`: dashboard and approval controls.
- `frontend/lib/api.ts`: browser API client and streaming fallback.
- `starter-kit/`, `launch-kit/`, `evals/`: supporting guides and demo material.

## 3. Manual local setup

### Prerequisites

Use Python 3.14 to match the backend container, and Node.js 22 to match the frontend container. The code uses `enum.StrEnum`, so the original README's Python 3.10 minimum is insufficient; that feature requires Python 3.11 or newer. The review checks ran with Python 3.14.6 and Node.js 26.5.0 on the existing local installations. Container builds were not verified.

You also need npm and a terminal. Docker is optional for the manual SQLite path. Make is optional because all commands below are explicit. Use the committed npm lockfile; backend dependencies are not fully pinned, so clean Python installs may resolve different versions over time.

### Step 1: enter the application directory

```bash
cd /Users/shark7901/Documents/Projects/Agentic/Agent-Harness-Hackathon/agent-harness-build
```

The outer `Agent-Harness-Hackathon` folder contains the application; run project commands inside `agent-harness-build`.

### Step 2: configure the backend

Create the root environment file only if it does not already exist:

```bash
if [ ! -f .env ]; then
  cp .env.example .env
fi
```

For a fully local demonstration, edit the corresponding values in `.env`:

```dotenv
DEMO_MODE=true
DEMO_FORCE_MODEL_FAILURE=false
DATABASE_URL=sqlite+aiosqlite:///./local.db
EMAIL_MODE=demo
HARNESS_PROVIDER=local
MAX_RUN_TOKENS=20000
MAX_RUN_COST=0.50
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
ENVIRONMENT=development
```

The backend loads this root `.env` explicitly using `backend/app/config.py`. Exported environment variables override file values. Restart the backend after changing settings.

With the startup command below, the relative SQLite URL creates `backend/local.db`. Tables are created automatically at startup using SQLAlchemy `create_all`; there is no migration command to run for a fresh database. `create_all` does not upgrade existing table definitions when the schema changes.

### Step 3: install backend dependencies

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
cd ..
```

### Step 4: install frontend dependencies and configure its API URL

```bash
cd frontend
npm ci
cd ..
```

Create or edit `frontend/.env.local` with this public value:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Next.js runs from `frontend/`; it does not automatically use the parent application's `.env`. The current client also defaults to `http://localhost:8000`, but explicitly configuring the frontend avoids confusion when changing ports or deploying.

Keep database passwords and model keys in backend configuration. `NEXT_PUBLIC_*` values are exposed to the browser and embedded during a production build. Changing that URL after building requires rebuilding the frontend. See the [Next.js environment-variable documentation](https://nextjs.org/docs/pages/guides/environment-variables).

### Step 5: start the backend in terminal 1

```bash
cd /Users/shark7901/Documents/Projects/Agentic/Agent-Harness-Hackathon/agent-harness-build/backend
. .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Development reloads restart the process and discard active in-memory runs. Finish pending approvals before editing backend code if you want the run to complete.

### Step 6: start the frontend in terminal 2

```bash
cd /Users/shark7901/Documents/Projects/Agentic/Agent-Harness-Hackathon/agent-harness-build/frontend
npm run dev -- --port 3000
```

Open:

- Dashboard: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`
- Interactive API documentation: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`

The health path is `/health`, **not** `/api/health`. Stop either development server with Ctrl+C.

After configuring both environment files, `make setup`, `make dev-backend`, and `make dev-frontend` are convenience alternatives. `make setup` installs dependencies but does not create either environment file; it uses `npm install` rather than `npm ci`.

## 4. Database options

SQLite is enough for local development. Choose PostgreSQL when you need database persistence outside a backend container.

### Local PostgreSQL with Docker

This example creates a separate database container with a persistent volume and a local-only port:

```bash
docker run -d --name act-postgres \
  -e POSTGRES_USER=act \
  -e POSTGRES_PASSWORD=local-dev-password \
  -e POSTGRES_DB=agent_control_tower \
  -p 127.0.0.1:5432:5432 \
  -v act-postgres-data:/var/lib/postgresql/data \
  postgres:17
```

For a backend running directly on your host, set:

```dotenv
DATABASE_URL=postgresql://act:local-dev-password@localhost:5432/agent_control_tower
```

Restart the backend after the database is ready. These example credentials are only for local development. Containerized backends need a network-reachable database hostname; their `localhost` refers to their own container.

### Hosted Supabase PostgreSQL

1. Create a Supabase project and obtain its database password.
2. Open the project's Connect panel and copy the exact **Session pooler** connection details.
3. Set the backend `DATABASE_URL` to those details, with the password supplied privately.
4. Restart the backend and confirm that startup creates the tables.

Example shape, using placeholders:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres
```

Supabase documents session pooling for persistent backends and provides IPv4 connectivity through its shared pooler. Copy the actual host rather than guessing it. See [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).

This application's custom URL normalizer expects a plain `postgresql://` or `postgres://` URL and re-encodes the password itself. For that path, supply the original password rather than an already percent-encoded password. Do not blindly append database query parameters such as `?sslmode=require`: the current parser treats the entire portion after the host slash as the database name. Explicit TLS options and certificate verification should be implemented and tested in the engine configuration for a production deployment.

The app does not need Supabase anon or service-role keys. It does not currently integrate Supabase Auth, Storage, Realtime, or Edge Functions.

### Optional local Supabase stack

If you already use the Supabase CLI and Docker, the repository includes `supabase/config.toml`:

```bash
supabase start
supabase status
```

Run these at the project root. This configuration uses database port **55322**, API port **55321**, and Studio port **55323**. Use the database credentials reported locally by `supabase status`; do not assume the usual default ports. The full Supabase stack is optional, and its bundled email testing service is not connected to this application's demo email tool.

## 5. Run and test locally

### Automated checks

From `backend/` with its virtual environment installed:

```bash
DEMO_MODE=true HARNESS_PROVIDER=local EMAIL_MODE=demo .venv/bin/python -m pytest -q
```

Tests override `DATABASE_URL` to `backend/tests/.test.db` before importing application settings and recreate its tables for each test. They do not use the database configured in the root `.env`. Do not run multiple copies of this suite simultaneously against that shared test file.

From `frontend/`:

```bash
npm test
npm run build
```

The backend suite covers permission checks, approvals, tool behavior, retry/fallback mechanics, budgets, scenarios, evaluation, and API flows. The frontend suite covers API-client behavior; it is not a browser end-to-end suite. `tests/e2e/` contains screenshots, not an executable browser test runner. `make test` runs only the backend suite.

**Review results:** 40 backend tests passed; 6 frontend tests passed; the Next.js production build, including TypeScript checking, succeeded. These checks used existing installed dependencies. A clean dependency install, Docker image builds, hosted PostgreSQL, actual model calls, and a live cloud deployment were not verified.

To smoke-test a production frontend build locally, stop the development frontend and run:

```bash
npm run start -- --port 3000
```

The backend must remain running. The Docker image uses the generated standalone server instead of `npm start`.

### Manual dashboard checks

| Check | Input/action | Expected behavior |
|---|---|---|
| Research | `Research AI agent observability` | Fixture search executes and run completes |
| Approval | `Research AI agent observability and email me a summary` | Run pauses at `WAITING_FOR_APPROVAL`; approval executes demo email and resumes |
| Rejection | Repeat the email task, then deny | Email does not execute; demo agent finishes with a response reflecting denial |
| Forbidden tool | `Delete the customer record for user 4821` | Permission check is `DENY`; no delete tool execution |
| Recovery | Use the API example below | Trace contains `RETRY_STARTED` and `FALLBACK_TRIGGERED`, then completion |
| Evaluation | Observe a terminal run | Dashboard requests evaluation and displays applicable criteria |

A denied tool does not necessarily make the whole run `DENIED` or `FAILED`. The demo agent can handle the denial and finish `COMPLETED`. Inspect the trace to establish whether an action executed.

**Current UI mismatch:** “Model Failure” submits ordinary task text without `force_model_failure`. Use the API flag below, or temporarily set `DEMO_FORCE_MODEL_FAILURE=true` and restart the backend. Restore it to `false` afterward.

### API smoke test

With the backend running:

```bash
curl -fsS http://localhost:8000/health

curl -fsS -X POST http://localhost:8000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"task":"Research AI agent observability"}'
```

Creation returns HTTP 201 and an `id`. Copy it into this shell variable:

```bash
RUN_ID='paste-created-run-id'
curl -fsS "http://localhost:8000/api/runs/$RUN_ID"
curl -fsS "http://localhost:8000/api/runs/$RUN_ID/trace"
curl -N "http://localhost:8000/api/runs/$RUN_ID/events"
```

The SSE endpoint replays stored events and then waits for new events until a terminal run event. For a run waiting for human approval, leave streaming in one terminal and resolve approval in another.

Create a separate approval run:

```bash
curl -fsS -X POST http://localhost:8000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"task":"Email me a summary of our Q3 roadmap"}'
```

Set `RUN_ID` to the new ID. Fetch its trace after it reaches `WAITING_FOR_APPROVAL`; copy `metadata.approval_id` from the `APPROVAL_REQUIRED` event:

```bash
APPROVAL_ID='paste-approval-id'
curl -fsS -X POST \
  "http://localhost:8000/api/runs/$RUN_ID/approvals/$APPROVAL_ID" \
  -H 'Content-Type: application/json' \
  -d '{"decision":"approve"}'
```

Use `deny` instead of `approve` to test rejection on a fresh pending approval. Evaluate after the run finishes:

```bash
curl -fsS -X POST "http://localhost:8000/api/runs/$RUN_ID/evaluate"
```

Exercise deterministic recovery in demo mode:

```bash
curl -fsS -X POST http://localhost:8000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"task":"Research the latest LLM benchmarks","force_model_failure":true}'
```

The task mentions “latest,” but its search results are still fixtures. The harness attempts the primary twice, records a retry, and makes one fallback attempt after exhaustion.

For a manual budget check, temporarily set `MAX_RUN_TOKENS=1`, restart, and submit a demo task. Expect `BUDGET_EXCEEDED`; then restore `20000`. Budget checking happens after a model call, so usage can overshoot the configured threshold by a call. Cost figures are illustrative estimates, not billing guarantees.

### Evaluation interpretation

The six checks are task completion, tool selection, policy compliance, approval compliance, budget compliance, and error recovery. Overall score is the percentage of applicable checks that pass.

This evaluates execution mechanics, not the factual quality of the answer. Tool selection is a keyword heuristic and passes when at least one expected tool was requested. A forbidden-tool request can therefore pass both tool selection and policy compliance when the request was correctly blocked. Some expected scores in `evals/README.md` are stale; use current evaluator output and traces.

## 6. Enable the existing real-model adapter

Edit backend configuration privately:

```dotenv
DEMO_MODE=false
OPENAI_API_KEY=your-private-key
PRIMARY_MODEL=gpt-4o-mini
FALLBACK_MODEL=gpt-4o
DEMO_FORCE_MODEL_FAILURE=false
```

These model names are repository defaults, not a claim about current availability or recommended model choice. Use tool-calling models available to your account and validate their behavior. Restart the backend. If the key is empty, the adapter factory silently falls back to demo mode even when `DEMO_MODE=false`.

The current live adapter has gaps that the deterministic tests do not establish as working:

- The router changes its model name, but the adapter continues using its own `model_name` initialized from `PRIMARY_MODEL`. Real fallback model switching is not wired through.
- Provider SDK exceptions are not translated into the harness's `RetryableModelError` types. The harness retry trace does not cover all live provider failures.
- The adapter records every returned tool call but executes only the first one; responses containing multiple tool calls need explicit handling.
- Retrying adapter methods can append conversation messages again. Retry-safe message handling needs validation.

Use demo mode to present the tested recovery flow. Complete the adapter integration before relying on real provider retry/fallback in deployment.

## 7. Run the supplied Docker Compose stack locally

Ensure the root `.env` exists and uses the intended demo/database settings. Stop host processes occupying ports 3000 and 8000, then run from the project root:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend frontend
```

Open `http://localhost:3000` and check `http://localhost:8000/health`. Ctrl+C exits log-following; the containers remain running. To stop and remove them:

```bash
docker compose down
```

The supplied Compose file:

- Starts only frontend and backend; it does not start PostgreSQL or Supabase.
- Injects `.env` into the backend.
- Hardcodes the frontend build argument `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Publishes ports 3000 and 8000 on the host.
- Defines neither persistent volumes nor restart policies.
- Orders frontend startup after backend creation without waiting for backend health.

With the SQLite default, the database is `/app/local.db` inside the backend container. Removing/replacing that container loses its database. Use PostgreSQL for a hosted demo, or explicitly configure a writable mounted data directory and a SQLite URL targeting that directory.

Changing `NEXT_PUBLIC_API_URL` in the root `.env` alone does not change the Compose build argument. Also, a deployed browser cannot resolve the Docker service name `backend`; the URL must be accessible from the user's browser.

## 8. Deployment and infrastructure stack

### Deployment shape compatible with the current code

Use one long-lived backend container with **one Uvicorn worker and one replica**, a frontend container, and a persistent PostgreSQL database. Put HTTPS and access control in front of the application. This follows directly from the process-local execution state and event bus.

```mermaid
flowchart LR
    User[User browser] --> Edge[DNS, HTTPS, access gateway]
    Edge -->|Dashboard routes| Frontend[Next.js container :3000]
    Edge -->|API, health, SSE| Backend[FastAPI container :8000\n1 worker, 1 replica]
    Backend --> Postgres[(Managed PostgreSQL)]
    Backend -. optional .-> Model[Model provider]
```

| Infrastructure component | Purpose and configuration |
|---|---|
| Container host | One VM or container service that keeps the backend process alive; avoid scale-to-zero for active runs |
| Image registry | Store tagged frontend and backend images for deployment and rollback |
| PostgreSQL | Persistent application data; Supabase PostgreSQL is one supported option |
| HTTPS ingress/reverse proxy | Route traffic, terminate TLS, and preserve SSE streaming |
| DNS | Public or private hostname for the application |
| Secret injection | Supply database credentials and optional model key to backend runtime |
| Access gateway | Protect the UI and API until application authentication/authorization is implemented |
| Logs and monitoring | Capture container logs, failed runs, health, resource usage, and database connectivity |
| Backups | Configure database backups and verify restoration |

A single host deployment is sufficient to demonstrate the existing architecture. The repository does not include cloud provisioning templates. Host sizing should be based on measured concurrency and memory use; no capacity benchmark was performed.

### Concrete image build and launch procedure

The following example uses one origin, `https://tower.example.com`, with a reverse proxy on the host. Replace the domain. It assumes you have provisioned the host, database, DNS, TLS, and access gateway.

Build from the project root:

```bash
docker build -t agent-control-tower-backend:demo-1 ./backend
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://tower.example.com \
  -t agent-control-tower-frontend:demo-1 ./frontend
```

For a separate deployment host, tag and push these images to your registry, then pull those same immutable release tags on the host. The frontend image must be built for the browser-facing API origin.

Create a private backend environment file on the deployment host, for example `/etc/agent-control-tower/backend.env`, readable only by the deployment administrator. Its contents should include:

```dotenv
ENVIRONMENT=production
DEMO_MODE=true
DEMO_FORCE_MODEL_FAILURE=false
HARNESS_PROVIDER=local
EMAIL_MODE=demo
DATABASE_URL=postgresql://DATABASE_USER:DATABASE_PASSWORD@DATABASE_HOST:5432/postgres
BACKEND_CORS_ORIGINS=https://tower.example.com
MAX_RUN_TOKENS=20000
MAX_RUN_COST=0.50
```

Replace the database placeholders with actual private connection details and apply the URL/TLS considerations above. Add model settings only if enabling the live adapter.

Start the containers on host-loopback ports, reachable through the host reverse proxy:

```bash
docker run -d --name act-backend --restart unless-stopped \
  --env-file /etc/agent-control-tower/backend.env \
  -p 127.0.0.1:8000:8000 \
  agent-control-tower-backend:demo-1

docker run -d --name act-frontend --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  agent-control-tower-frontend:demo-1
```

The backend image already starts one Uvicorn process. Do not add `--reload` or additional workers. Database tables are created at startup; ensure the configured role has the necessary permissions for this initial schema creation.

Inside an existing TLS-enabled Nginx server block, these routes illustrate the required forwarding:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}

location = /health {
    proxy_pass http://127.0.0.1:8000;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

This is a routing fragment, not a complete Nginx/TLS/access-control configuration. It preserves the `/api/` prefix. The SSE endpoint sends no heartbeat, so long approval waits can exceed intermediary idle timeouts; frontend polling provides a fallback. The timeout above is finite. Nginx documents response buffering and the interval between upstream reads in its [HTTP proxy module reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

If your proxy is itself containerized, use a shared Docker network and container service names as its upstreams instead of host-loopback addresses. If using separate UI and API domains, build with the HTTPS API domain and put the exact UI origin in backend CORS settings.

### Deployment verification and updates

1. Confirm backend container health and successful database initialization.
2. Open the dashboard through the configured gateway and HTTPS domain.
3. Check that browser requests target the deployed origin, not `localhost`.
4. Submit a research task; verify run creation, trace updates, and evaluation.
5. Submit an email task; approve it and verify the tool starts only after approval.
6. Exercise denial and forced failure through the API.
7. Verify completed runs remain available after a backend restart against the same database. Active runs are not restart-safe.
8. Verify database backup/restore before relying on retained history.

Before replacing a backend container, stop accepting new runs and finish or resolve active runs. There is no built-in draining endpoint. Restarting loses active execution and pending adapter state even though their database records remain. Roll back with the previous image tags, accounting for schema compatibility; automatic schema rollback is not implemented.

## 9. Work needed before production use

These are concrete gaps in the inspected scaffold:

| Area | Current limitation | Required work |
|---|---|---|
| Authentication | API routes have no user authentication or run ownership checks | Implement identity, tenant/run authorization, and approval authorization |
| Approval integrity | Approval resolution mutates the approval before validating its run association and active state | Validate ownership/state before mutation; test replay, concurrency, and mismatched IDs |
| Durable execution | Background tasks and agent state live in one process | Persist resumable state, add durable scheduling and recovery; a shared DB alone is insufficient |
| Scaling | SSE subscriptions are local to the backend process | Add shared event delivery and coordinated execution before multiple workers/replicas |
| Approval expiry | Pending approvals wait indefinitely | Define expiry, cancellation, and restart behavior |
| Model resilience | Router and live adapter are not fully connected | Wire model selection and SDK error mapping; handle multiple calls and retry-safe messages |
| Budget control | Post-call checks with illustrative prices | Add accurate usage accounting and appropriate per-call limits |
| Schema changes | Startup uses `create_all` | Add versioned migrations, release ordering, and rollback planning |
| Database transport | No explicit engine TLS configuration in the scaffold | Configure and verify TLS/certificates for the chosen database |
| Tool integrations | Search/email are simulated | Implement providers, timeouts, idempotency, validation, and integration tests |
| Health | `/health` returns a static success response | Add readiness checks for database and execution dependencies |
| Evaluation | Heuristics validate selected trace patterns | Add task-quality benchmarks and stronger approval/tool-call matching |
| Release automation | No CI/CD workflow; Python packages largely unpinned | Lock dependencies and automate tests, image builds, staging checks, and deployment |

## 10. Troubleshooting

| Symptom | Check and action |
|---|---|
| Python import error for `StrEnum` | Use Python 3.11+; Python 3.14 matches the Dockerfile |
| Frontend cannot start a run | Check backend `/health`, frontend API URL, and browser network errors |
| CORS errors | Match the exact frontend scheme, hostname, and port in `BACKEND_CORS_ORIGINS` |
| Frontend still calls an old backend | Restart dev server after env edits; rebuild the production frontend image |
| Database errors at startup | Confirm host/port reachability, raw-password handling, database name, and permissions |
| Hosted database connection fails | Use the actual connection details and check networking; do not assume DNS propagation is the cause |
| Local Supabase connection refused | This repo uses port 55322 for PostgreSQL, not 54322 |
| Approval fails after a restart | Its in-memory execution state was lost; create a new run |
| Model Failure button shows no retries | Use the API's `force_model_failure: true` or the environment flag |
| Real-mode task behaves like a demo | A missing model key causes the factory to choose the demo adapter |
| Email never arrives | Email is simulated; only `EMAIL_MODE=demo` is implemented |
| Live trace stalls or history trace is incomplete | Check proxy streaming; inspect `GET /api/runs/{id}/trace` as the persisted source; frontend trace subscription can race terminal status polling |
| Docker run history disappears | Default SQLite is inside the container; use persistent storage or PostgreSQL |
| README differs from observed behavior | Follow the implementation and the verified commands in this guide |
