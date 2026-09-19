# Architecture Cheatsheet

One sentence per module. Full details in [ARCHITECTURE.md](../ARCHITECTURE.md).

## Core Harness

| File | Purpose |
|------|---------|
| `backend/app/harness/orchestrator.py` | Main loop: agent → permission check → approval? → tool execute → trace → repeat. State machine, retry/fallback/budget wired through `_call_model()`. |
| `backend/app/harness/permissions.py` | Stateless permission engine: checks tool registry metadata and returns ALLOW / REQUIRE_APPROVAL / DENY. |
| `backend/app/harness/approvals.py` | Stores approval requests in DB, handles pause/resume: creates approval, waits for user decision, resumes orchestrator. |
| `backend/app/harness/retry.py` | Wraps model calls in `with_retry()`: retries retryable errors up to MAX_ATTEMPTS, fails immediately on non-retryable errors. |
| `backend/app/harness/routing.py` | Routes between primary and fallback models: on retry exhaustion, switch to secondary model and try once more. |
| `backend/app/harness/budget.py` | Tracks cumulative tokens and estimated cost per run; warns at 80%, stops at 100%. |
| `backend/app/harness/tracing.py` | Records every significant step as TraceEvent rows (RUN_STARTED, TOOL_REQUESTED, PERMISSION_CHECK, etc.); streams via SSE. |
| `backend/app/harness/evaluator.py` | Deterministic evaluation: 6 criteria (completion, tool selection, policy compliance, approval compliance, budget compliance, error recovery). |
| `backend/app/harness/provider.py` | HarnessProvider abstraction (LocalHarnessProvider runs orchestrator in-process; TrueForgeHarnessProvider is a documented but unimplemented stub). |

## Agent Interface

| File | Purpose |
|------|---------|
| `backend/app/agent/adapter.py` | AgentAdapter protocol: `run(task)`, `resume(tool_result)`, `get_usage()`; factory picks OpenAI or Demo adapter per run. |
| `backend/app/agent/openai_agent.py` | Real OpenAI-backed adapter: makes API calls, uses actual reasoning, integrates with retry/fallback. |
| `backend/app/agent/demo_agent.py` | Deterministic demo adapter: keyword-based planning (no external calls), fake tokens, always available offline. |

## Tools & Permissions

| File | Purpose |
|------|---------|
| `backend/app/tools/registry.py` | Central tool registry: metadata (name, description, permission, approval required, risk level, callable). Includes web_search (ALLOW), send_email (ALLOW + approval), calculator (ALLOW), delete_record (DENY). |
| `backend/app/tools/web_search.py` | Web search tool: takes query, returns mock results (demo mode) or real results (not implemented in hackathon). |
| `backend/app/tools/send_email.py` | Email tool: takes to/subject/body, logs to stdout (demo mode) or sends via SMTP (not configured in hackathon). |
| `backend/app/tools/calculator.py` | Calculator tool: evaluates arithmetic expressions safely. |
| `backend/app/tools/delete_record.py` | Forbidden tool: stub with DENY permission; can never be called. |

## Data Models

| File | Purpose |
|------|---------|
| `backend/app/models/db.py` | Session factory, declarative base, table initialization on app startup. |
| `backend/app/models/run.py` | Run entity: task, status (CREATED/RUNNING/WAITING_FOR_APPROVAL/COMPLETED/FAILED/BUDGET_EXCEEDED), timestamps, tokens, cost, latency, tool_calls, retry_count, result. |
| `backend/app/models/trace_event.py` | TraceEvent entity: type, timestamp, name, status, metadata (JSON), latency_ms; one event per orchestrator step. |
| `backend/app/models/approval.py` | Approval entity: run_id, tool_name, tool_args, decision (pending/approve/deny), timestamps. |
| `backend/app/models/evaluation.py` | Evaluation entity: run_id, criterion name, passed (true/false/null), score, notes. |

## API

| File | Purpose |
|------|---------|
| `backend/app/api/health.py` | Health check endpoint: GET /health → `{"status": "ok"}`. |
| `backend/app/api/runs.py` | Run lifecycle: POST /runs (create), GET /runs (list), GET /runs/{id} (detail), GET /runs/{id}/trace (trace JSON), GET /runs/{id}/events (SSE stream), POST /runs/{id}/approvals/{id} (resolve), POST /runs/{id}/evaluate (evaluate). |

## Configuration & Schema

| File | Purpose |
|------|---------|
| `backend/app/config.py` | Pydantic Settings: loads .env, normalizes DATABASE_URL for async SQLAlchemy, provides access to all env vars with defaults. |
| `backend/app/schemas/*.py` | Pydantic models for request/response validation (RunCreate, RunDetail, TraceEventOut, ApprovalDecisionIn, EvaluationResultOut). |
| `backend/app/services/events.py` | In-memory event bus for SSE multicast (single-process demo; scale via Redis). |

## Frontend

| File | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Home page: manages run state, polling, SSE subscription, approval UI, evaluation UI. |
| `frontend/components/RunHeader.tsx` | Page title and tagline. |
| `frontend/components/TaskInput.tsx` | Task input textarea + 4 DEMO scenario buttons. |
| `frontend/components/StatusBadge.tsx` | Displays run status (RUNNING, WAITING_FOR_APPROVAL, COMPLETED, etc.). |
| `frontend/components/MetricsPanel.tsx` | Shows tokens, estimated cost, latency, tool calls, retry count. |
| `frontend/components/TracePanel.tsx` | Real-time list of trace events (scrollable). |
| `frontend/components/ApprovalCard.tsx` | Shows pending approval with Approve/Deny buttons. |
| `frontend/components/ResultPanel.tsx` | Displays final run result text. |
| `frontend/components/EvaluationPanel.tsx` | Displays evaluation scores and individual criteria. |
| `frontend/components/RunHistory.tsx` | List of recent runs; click to view. |
| `frontend/lib/api.ts` | API client: `createRun()`, `getRun()`, `listRuns()`, `subscribeToTrace()`, `resolveApproval()`, `evaluateRun()`. |
| `frontend/lib/types.ts` | TypeScript types: Run, TraceEvent, Approval, Evaluation, etc. |

## Demo & Testing

| File | Purpose |
|------|---------|
| `backend/app/demo/scenarios.py` | 4 pre-configured demo scenarios (research+email, human_approval, model_failure, forbidden_tool) with task strings and descriptions. |
| `backend/app/demo/fixtures.py` | Demo data (mock search results, email templates, etc.). |
| `backend/tests/conftest.py` | Pytest fixtures: async test client, in-memory SQLite session, helper functions. |
| `backend/tests/test_golden_path.py` | End-to-end test: web_search → send_email with approval. |
| `backend/tests/test_permissions.py` | Permission engine tests. |
| `backend/tests/test_approvals.py` | Approval flow tests (create, resolve, decision validation). |
| `backend/tests/test_retry.py` | Retry and fallback tests (retry exhaustion, model switching, completion). |
| `backend/tests/test_budget.py` | Budget enforcement tests (warning, exceeded, partial result preservation). |
| `backend/tests/test_evaluator.py` | Evaluation criteria tests (all 6 criteria, score calculation). |
| `backend/tests/test_scenarios.py` | Demo scenario tests (all 4 scenarios defined, human_approval specifically). |
| `backend/tests/test_demo_agent.py` | Demo agent planning logic tests (task parsing, plan building). |
| `backend/tests/test_safety_denial.py` | Policy denial tests (denied tool never executed). |
| `backend/tests/test_tools.py` | Tool execution tests (calculator, email, search). |

---

**For details on how modules interact, see [ARCHITECTURE.md](../ARCHITECTURE.md).**
