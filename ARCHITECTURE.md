> **Scope:** This document describes the original offline custom-harness demo. For the implemented TrueForge integration and challenge setup, use [TRUEFORGE_SETUP.md](TRUEFORGE_SETUP.md). Statements below about an unimplemented TrueForge provider refer to the earlier scaffold.

# Architecture

## Overview

Agent Control Tower is a **thin, composable harness** that runs between an agent and its tools. The harness enforces policies, pauses for approval, traces every step, recovers from failures, and evaluates outcomes—without knowing or caring what the agent's reasoning looks like.

This design decouples **governance** (permissions, approvals, budgets, retries) from **reasoning** (which model, which tool, how to react), making the harness reusable across agent types.

## The Harness Loop

The core loop lives in `HarnessOrchestrator._drive()` in `backend/app/harness/orchestrator.py`:

```
1. Agent produces AgentStep: "call this tool" or "done"
2. If "done": record completion, stop
3. If "call tool":
   a. Record TOOL_REQUESTED event
   b. PermissionEngine.check(tool_name) → ALLOW / REQUIRE_APPROVAL / DENY
   c. Record PERMISSION_CHECK event with decision
   d. If DENY: tell agent "denied", go to step 1
   e. If REQUIRE_APPROVAL: create Approval, pause run, return (resume later via HTTP)
   f. If ALLOW: execute tool
   g. Record TOOL_STARTED, then TOOL_COMPLETED or TOOL_FAILED
   h. Call agent.resume(tool_result)
   i. Go to step 1
```

All steps are persisted as `TraceEvent` rows and streamed to the frontend via SSE.

## Agent Adapter Interface

**File**: `backend/app/agent/adapter.py`

The `AgentAdapter` protocol (Pythonic duck-type) abstracts "the agent":

```python
class AgentAdapter(Protocol):
    async def run(self, task: str, context: dict) -> AgentStep
    async def resume(self, run_id: str, tool_result: dict) -> AgentStep
    def get_usage(self) -> UsageInfo
```

- `run(task, context)`: Kick off reasoning with a fresh task
- `resume(run_id, tool_result)`: Resume reasoning with a tool result (or `{"error": "denied"}`)
- `get_usage()`: Return token counts (used for budget tracking)

### Implementations

**`DemoAgentAdapter`** (`backend/app/agent/demo_agent.py`):
- Deterministic, offline, no external calls
- Keyword-based planning: "email" → [web_search, send_email], "delete" → [delete_record], etc.
- Fake token counts for budget tracking
- Default when `DEMO_MODE=true` or no `OPENAI_API_KEY` set
- Used by all tests and the default demo

**`OpenAIAgentAdapter`** (`backend/app/agent/openai_agent.py`):
- Real OpenAI API calls (gpt-4o-mini or gpt-4o, configurable)
- Reads `OPENAI_API_KEY` and routes through the OpenAI SDK
- Swapped in when `OPENAI_API_KEY` is set AND `DEMO_MODE=false`
- Can fail with transient errors (rate limits, timeouts) which trigger retry/fallback

The factory `get_agent_adapter()` picks the implementation at run start. Swapping adapters requires zero changes to the orchestrator.

## Harness Provider Abstraction

**File**: `backend/app/harness/provider.py`

The `HarnessProvider` interface is a future extension point for managed harness backends:

```python
class HarnessProvider(ABC):
    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False) -> None
    async def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> None
```

### Implementations

**`LocalHarnessProvider`** (current, in-process):
- Wires together:
  - `HarnessOrchestrator`
  - `PermissionEngine` (tool registry metadata)
  - `ApprovalEngine` (approval storage/resolution)
  - `ToolRegistry` (available tools with metadata)
  - `TraceRecorder` (event persistence + SSE)
- Runs the orchestrator in the same FastAPI process
- State held in memory: `_active[run_id] = _ActiveRun(adapter, router, pending_step)`
- Default and only production implementation for this hackathon

**`TrueForgeHarnessProvider`** (stub, documented extension point):
- **NOT IMPLEMENTED**: No TrueFoundry/TrueForge SDK installed or available
- Deliberately raises `NotImplementedError` to block accidental use
- Docstring explains what a real integration would need:
  - Call the managed service's `start_run()` equivalent instead of `HarnessOrchestrator`
  - Forward `resolve_approval()` to that service
  - Translate the service's callbacks/webhooks back into `TraceEvent` rows via the same `TraceRecorder` interface, so the API and UI need zero changes
- Set via `HARNESS_PROVIDER=trueforge` in `.env` (currently not recommended)

## State Machine

A `Run` has 8 statuses:

```
CREATED
  ↓
RUNNING
  ├→ (waiting for approval) WAITING_FOR_APPROVAL
  │   ↓
  │ (approved or denied, resume)
  │   ↓
  │ RUNNING
  │
  ├→ (succeeded) COMPLETED ✓
  │
  ├→ (unhandled error) FAILED ✗
  │
  ├→ (budget exceeded) BUDGET_EXCEEDED ✗
  │
  └→ (reserved for future use) RETRYING, DENIED
```

**Valid transitions** (defined in `orchestrator.py`):
- `CREATED` → `RUNNING` (on run start)
- `RUNNING` → `WAITING_FOR_APPROVAL` (when a tool requires approval)
- `WAITING_FOR_APPROVAL` → `RUNNING` (when approval is resolved; continues the loop)
- `RUNNING` → `COMPLETED` (when agent says "done" and succeeds)
- `RUNNING` → `FAILED` (on unhandled exception)
- `RUNNING` → `BUDGET_EXCEEDED` (when usage crosses 100% of limit)

## Retry & Fallback

**Files**: `backend/app/harness/retry.py`, `backend/app/harness/routing.py`

### Retry
- Lives in `_call_model()` in the orchestrator
- Wraps each model call in `with_retry()`, which:
  - Tries up to `MAX_ATTEMPTS` (default 2)
  - On `RetryableModelError` (timeout, rate limit, transient provider error):
    - Records `RETRY_STARTED` trace event
    - Increments `Run.retry_count`
    - Sleeps (demo backoff: 0.1s, 0.2s)
    - Retries
  - On `NonRetryableModelError` (auth, invalid request, permission denied): fails immediately
- If all retries exhaust with a retryable error, raises `RetryExhausted`

### Fallback (Primary → Secondary Model)
- When `RetryExhausted` fires and fallback has not yet triggered:
  - `ModelRouter.trigger_fallback()` switches the run's `current_model` from `PRIMARY_MODEL` (gpt-4o-mini) to `FALLBACK_MODEL` (gpt-4o)
  - Records `FALLBACK_TRIGGERED` trace event
  - Attempts one more model call on the fallback
  - If that succeeds, continues normally
  - If that also fails, the run fails
- If `RetryExhausted` fires but fallback has already been triggered, the run fails (no third model)

**Demo failure simulation**: `DEMO_FORCE_MODEL_FAILURE=true` or `{"force_model_failure": true}` on run creation causes `ModelRouter.maybe_force_failure()` to raise `TemporaryProviderError` after the first model call, triggering retry → fallback → success.

## Budget Enforcement

**File**: `backend/app/harness/budget.py`

Tracks cumulative token and cost usage per run:

- After every model call, `_add_usage()` increments `Run.tokens` and `Run.estimated_cost`
- `check_budget()` compares against `MAX_RUN_TOKENS` and `MAX_RUN_COST` (env settings)
- Thresholds:
  - 0–80%: OK, no event
  - 80–100%: WARNING, records `BUDGET_WARNING` trace event (once per run)
  - ≥100%: EXCEEDED, raises `BudgetExceededError`, status → `BUDGET_EXCEEDED`, run stops gracefully

**Cost estimation**:
- Illustrative, not exact billing: `gpt-4o-mini` = $0.00015 / 1K tokens, `gpt-4o` = $0.005 / 1K tokens, demo-agent = $0.0001 / 1K tokens
- Calculated at `estimate_cost(model_name, tokens)`
- Frontend displays "Estimated Cost" to make clear it's not real billing

## Permission Engine

**File**: `backend/app/harness/permissions.py`

Stateless: decides based purely on tool registry metadata.

```python
def check(self, tool_name: str) -> Permission:
    meta = registry.get(tool_name)
    if meta.permission == DENY:
        return DENY
    if meta.approval_required:
        return REQUIRE_APPROVAL
    return ALLOW
```

**Tool registry** (`backend/app/tools/registry.py`):
- Central place for tool metadata (name, description, permission, approval_required, risk_level, callable)
- `web_search`: ALLOW, no approval, LOW risk
- `send_email`: ALLOW, approval required, MEDIUM risk
- `calculator`: ALLOW, no approval, LOW risk
- `delete_record`: DENY, no approval, HIGH risk (func=None, can never be called)

Adding a new tool = register it in `ToolRegistry._register_defaults()`.

## Approval Engine

**File**: `backend/app/harness/approvals.py`

Stores approvals in the database, handles pause/resume:

1. When an approval is needed, `ApprovalEngine.create()` → saves an `Approval` row, returns the approval object
2. Orchestrator records `APPROVAL_REQUIRED` event, pauses the run, stores `pending_step`, returns
3. Frontend shows "Approve / Deny" buttons
4. User decides; UI POSTs to `POST /api/runs/{run_id}/approvals/{approval_id}`
5. `resolve_approval()` calls `ApprovalEngine.resolve()` → updates the Approval row with the decision
6. Orchestrator resumes via `resolve_approval()` → feeds the decision to the agent (approval granted → execute tool, approval denied → tell agent "denied")

The `pending_step` field in the in-memory `_ActiveRun` holds the paused tool call across the HTTP round-trip. For distributed deployments, this would need to move to the database.

## Tracing

**File**: `backend/app/harness/tracing.py`

Every significant step is recorded as a `TraceEvent`:

- `RUN_STARTED`, `RUN_COMPLETED`, `RUN_FAILED`
- `MODEL_CALL_STARTED`, `MODEL_CALL_COMPLETED`
- `TOOL_REQUESTED`, `PERMISSION_CHECK`, `TOOL_STARTED`, `TOOL_COMPLETED`, `TOOL_FAILED`
- `APPROVAL_REQUIRED`, `APPROVAL_GRANTED`, `APPROVAL_DENIED`
- `RETRY_STARTED`, `FALLBACK_TRIGGERED`
- `BUDGET_WARNING`, `BUDGET_EXCEEDED`
- `EVALUATION_STARTED`, `EVALUATION_COMPLETED`

Each event includes:
- `type`, `timestamp`, `name` (tool/model name), `status` (success/failure/decision), `latency_ms`, `metadata` (args, results, error text, approval ID, etc.)

**Persistence**: Saved to `trace_events` table; retrieved by `GET /api/runs/{run_id}/trace` (JSON) or `GET /api/runs/{run_id}/events` (Server-Sent Events stream).

**SSE streaming**: The `event_bus` in `backend/app/services/events.py` is a simple in-memory multicast (works for single-process demo; scale via Redis/Kafka).

## Evaluation

**File**: `backend/app/harness/evaluator.py`

Runs deterministic, rule-based evaluation on completed runs. Called on-demand via `POST /api/runs/{run_id}/evaluate`.

**6 criteria:**

1. **task_completion**: Run status is COMPLETED? (None if RUNNING/WAITING, true if COMPLETED, false if FAILED/BUDGET_EXCEEDED)
2. **tool_selection**: Did the agent request tools matching keywords in the task? (e.g., "email" → expects send_email; "research" → expects web_search)
3. **policy_compliance**: Were denied tools never executed? (None if no denials, true if all denials respected, false if denied tool was executed)
4. **approval_compliance**: Were approval-required tools only executed *after* approval? (None if no approval-required tools, true if all approved before execution, false if executed before approval)
5. **budget_compliance**: Did the run stay within token/cost limits? (true if no BUDGET_EXCEEDED, false if BUDGET_EXCEEDED)
6. **error_recovery**: If retry/fallback was exercised, did the run still complete? (None if no recovery, true if recovered and completed, false if recovered but failed)

**Overall score**: Percentage of applicable criteria passed. E.g., if 4 of 5 applicable criteria pass, score = 80%.

**Idempotent**: Calling evaluate again deletes previous Evaluation rows and recalculates (same result unless the Run was modified, which shouldn't happen).

## Database Models

**File**: `backend/app/models/`

- **`Run`**: task, status, started_at, completed_at, tokens, estimated_cost, latency_ms, tool_calls, retry_count, result
- **`TraceEvent`**: type, timestamp, name, status, metadata (JSON), latency_ms
- **`Approval`**: run_id, tool_name, tool_args (JSON), decision (pending/approve/deny), created_at, resolved_at
- **`Evaluation`**: run_id, criterion, passed (true/false/null), score (0.0/1.0/null), notes

**Schema automation**: `app/models/db.py` uses SQLAlchemy's declarative system. On app startup (`lifespan` in `main.py`), `init_models()` creates all tables if they don't exist.

**Connection**: 
- Configured via `DATABASE_URL` env var
- `config.py::to_async_database_url()` normalizes it for async SQLAlchemy:
  - `sqlite://` → `sqlite+aiosqlite://` (tests)
  - `postgresql://` → `postgresql+asyncpg://` (production)
  - Safely re-encodes password (Supabase-generated passwords may contain special chars like "/")

## Frontend Architecture

**Files**: `frontend/app/page.tsx`, `frontend/components/`, `frontend/lib/`

**State management**: React hooks + polling + SSE

- **Polling**: `getRun()` every 1s while run is not terminal (in `useEffect` hook)
- **SSE**: `subscribeToTrace()` for live trace updates; falls back to polling if SSE unavailable
- **Automatic evaluation**: Once run reaches terminal status, `evaluateRun()` is called automatically

**Components**:
- `RunHeader`: Title and tagline
- `TaskInput`: Task textarea + 4 DEMO buttons (quick scenario selection)
- `StatusBadge`: Shows current run status (RUNNING, WAITING_FOR_APPROVAL, COMPLETED, etc.)
- `MetricsPanel`: Tokens, estimated cost, latency, tool calls, retry count
- `TracePanel`: Real-time list of trace events
- `ApprovalCard`: Shows pending approval with Approve/Deny buttons
- `ResultPanel`: Final result text
- `EvaluationPanel`: Scores and criteria
- `RunHistory`: List of recent runs; click to view

**API client** (`lib/api.ts`):
- `createRun(task)`, `getRun(runId)`, `listRuns()`, `subscribeToTrace(runId, callback)`, `resolveApproval(runId, approvalId, decision)`, `evaluateRun(runId)`
- Handles network errors gracefully; retries polling on transient failures

## Deployment Notes

### Single-Process Limitation
The `_active` dict in `HarnessOrchestrator` holds in-memory state (adapter instance, pending approval). This works fine for a single FastAPI process running the demo. For multi-instance production:
- Move in-memory state to database or Redis
- Use a distributed lock for concurrent run operations
- Ensure approval resumption routes back to the correct instance

### Database Connection
- **SQLite** (testing): Direct file-based, no DNS needed
- **Supabase Postgres** (production): Requires DNS resolution of `db.<project-ref>.supabase.co`. The connection pool uses `asyncpg` for async-safe connections. Session pooler mode may be needed for high concurrency; see `.env.example` for connection string format.

### SSE Limitations
- Server-Sent Events are one-directional (server → client)
- Requires persistent HTTP connection; some proxies/CDNs may time out or buffer responses
- Fallback to polling (1s interval) is automatic if SSE unavailable
- Production deployments should use WebSockets or a message queue for real-time updates

## Next Steps (Not Implemented)

- **Approval timeout**: Auto-deny if approval not resolved in N minutes
- **Distributed state**: Redis-backed session for multi-instance deployments
- **Cost simulation**: Real provider billing integration (OpenAI invoices, Anthropic usage API)
- **Tool schema validation**: JSON Schema for tool args; UI form generation
- **Agent persistence**: Save/resume agent state across restarts
- **Audit logging**: Separate immutable log of all approvals/denials for compliance
- **Multi-tenant**: Org/user scoping; role-based approval (CEO vs. developer approval)
