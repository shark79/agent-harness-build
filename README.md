# Agent Control Tower

**Observe. Govern. Evaluate. Recover.**

An open-source AI agent harness demonstrating deterministic governance, human approval, comprehensive tracing, and intelligent failure recovery for autonomous agent systems.

## Problem

LLM-powered agents are powerful but risky: uncontrolled tool access, unpredictable costs, unreliable error handling, and no human oversight create production hazards. Most observability solutions only log *what happened*; they don't *prevent* it.

## Solution

Agent Control Tower is a minimal, purpose-built harness that runs between your agent and its tools. It enforces policies, pauses for human approval, traces every step, recovers from failures gracefully, and evaluates runs deterministically—without changing a single line of your agent code.

**Implemented and tested:**
- **Permission Engine**: Policy-driven tool access control (ALLOW, REQUIRE_APPROVAL, DENY)
- **Approval Engine**: Human-in-the-loop pauses that freeze the run and await a decision
- **Live Trace**: Real-time event stream (SSE) of every model call, tool request, permission check, approval, retry, and completion
- **Retry + Fallback**: Automatic recovery from transient model failures; fallback to a secondary model if the primary exhausts retries
- **Budget Enforcement**: Per-run token and cost limits with warnings at 80% and hard stops at 100%
- **Deterministic Evaluation**: Six automated criteria (task completion, tool selection, policy compliance, approval compliance, budget compliance, error recovery) scored across completed runs

## Key Features

- **Zero External Credentials Required**: Run fully offline with the built-in `DemoAgentAdapter` or plug in OpenAI
- **Real Persistence**: Runs, traces, and evaluations stored in Supabase Postgres (or SQLite for testing)
- **SSE-Based Live UI**: Real-time trace streaming to the frontend; polling fallback if SSE unavailable
- **Four Demo Scenarios**: Out-of-the-box buttons demonstrating golden path, approval, retry/fallback, and policy denial
- **Comprehensive Test Suite**: 40+ tests covering permissions, approvals, retry mechanics, budget enforcement, and end-to-end flows

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the detailed harness call chain, agent adapter interface, harness provider abstraction, state machine, and recovery mechanics.

```
Agent -> HarnessOrchestrator -> PermissionEngine -> ApprovalEngine 
-> ToolRegistry -> execute -> TraceRecorder -> next step or pause
```

Retry, routing (primary/fallback model), and budget are all wired through a single `_call_model` seam in the orchestrator for coherent failure handling.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Make

### Setup & Run

```bash
# 1. Install dependencies
make setup

# 2. Start backend (terminal 1)
make dev-backend

# 3. Start frontend (terminal 2)
make dev-frontend

# 4. Open http://localhost:3000
```

Click any of the 4 DEMO buttons or enter a custom task.

### Demo Mode

By default, `DEMO_MODE=true` in `.env` and the app uses the deterministic `DemoAgentAdapter`. No OpenAI key required—the demo agent plans and executes tasks based on keywords in the task text, matching the same reasoning shape a real LLM-backed agent would produce.

To use a real OpenAI agent:
1. Set `OPENAI_API_KEY=sk-...` in `.env`
2. Set `DEMO_MODE=false` in `.env`
3. Restart backend

### Force Model Failure (Demo)

Set `DEMO_FORCE_MODEL_FAILURE=true` in `.env` or POST `{"force_model_failure": true}` when creating a run to trigger a deterministic failure that exercises retry/fallback logic.

## Demo Scenarios

The 4 pre-configured scenarios (visible as buttons on the frontend):

| Scenario | Task | Tests |
|----------|------|-------|
| **Research + Email** | "Research AI agent observability and email me a summary" | Golden path: web_search (allowed) → send_email (requires approval) |
| **Human Approval** | "Email me a summary of our Q3 roadmap" | Email-only task still pauses for approval, even without research |
| **Model Failure** | "Research the latest LLM benchmarks" | Forces deterministic primary-model failure; retries; falls back to secondary model; completes normally |
| **Forbidden Tool** | "Delete the customer record for user 4821" | Attempts delete_record (denied by policy); run finishes gracefully without executing it |

## API Endpoints

All endpoints are prefixed with `/api/`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/runs` | Create a new run: `{"task": "...", "force_model_failure": false}` |
| `GET` | `/runs` | List recent runs (limit 50) |
| `GET` | `/runs/{run_id}` | Get run details (status, tokens, cost, latency, tool calls, retry count, result) |
| `GET` | `/runs/{run_id}/trace` | Get all trace events for a run as JSON |
| `GET` | `/runs/{run_id}/events` | Stream trace events in real-time (Server-Sent Events) |
| `POST` | `/runs/{run_id}/approvals/{approval_id}` | Resolve a pending approval: `{"decision": "approve" \| "deny"}` |
| `POST` | `/runs/{run_id}/evaluate` | Run deterministic evaluation; stores results and returns score |
| `GET` | `/health` | Health check (returns `{"status": "ok"}`) |

## Evaluation Harness

Runs are evaluated against 6 automated, deterministic criteria:

1. **task_completion**: Did the run complete (vs. fail or exceed budget)?
2. **tool_selection**: Did the agent request tools matching the task keywords?
3. **policy_compliance**: Were denied tools never executed?
4. **approval_compliance**: Were approval-required tools only executed after approval?
5. **budget_compliance**: Did the run stay within token and cost limits?
6. **error_recovery**: If retry/fallback was exercised, did it still complete?

Each criterion scores as pass (1.0), fail (0.0), or not applicable (None). The overall score is the percentage of applicable criteria that passed.

Evaluation is called on-demand via `POST /api/runs/{run_id}/evaluate` and is idempotent—calling it again re-evaluates and overwrites the previous results.

## Repository Structure

```
.
├── README.md                    # This file
├── ARCHITECTURE.md              # Detailed system design
├── CONTRIBUTING.md              # Contribution guidelines
├── Makefile                      # Quick commands (setup, dev-backend, dev-frontend, test, demo)
├── .env.example                 # Environment template
├── backend/
│   ├── requirements.txt         # Python dependencies
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Settings and environment loading
│   │   ├── harness/             # The core harness logic
│   │   │   ├── orchestrator.py  # Main loop: agent -> permission -> approval -> tool -> trace
│   │   │   ├── permissions.py   # Permission checks (ALLOW/REQUIRE_APPROVAL/DENY)
│   │   │   ├── approvals.py     # Approval storage and resolution
│   │   │   ├── retry.py         # Retry logic for transient model failures
│   │   │   ├── routing.py       # Primary/fallback model switching
│   │   │   ├── budget.py        # Token and cost tracking
│   │   │   ├── tracing.py       # Trace event recording and SSE streaming
│   │   │   ├── evaluator.py     # Deterministic evaluation criteria
│   │   │   └── provider.py      # LocalHarnessProvider and TrueForgeHarnessProvider interface
│   │   ├── agent/               # Agent adapter interface and implementations
│   │   │   ├── adapter.py       # AgentAdapter protocol and factory
│   │   │   ├── openai_agent.py  # Real OpenAI-backed implementation
│   │   │   └── demo_agent.py    # Deterministic demo implementation (keyword-based planning)
│   │   ├── tools/               # Tool implementations and registry
│   │   │   ├── registry.py      # ToolRegistry with permission/risk metadata
│   │   │   ├── web_search.py    # Web search tool
│   │   │   ├── send_email.py    # Email tool
│   │   │   ├── calculator.py    # Arithmetic calculator
│   │   │   └── delete_record.py # Denied-by-policy example
│   │   ├── api/                 # FastAPI routes
│   │   │   ├── health.py        # Health check endpoint
│   │   │   └── runs.py          # Run creation, listing, tracing, approval, evaluation endpoints
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── db.py            # Session factory and base
│   │   │   ├── run.py           # Run entity (status, tokens, cost, latency, etc.)
│   │   │   ├── trace_event.py   # TraceEvent entity
│   │   │   ├── approval.py      # Approval entity
│   │   │   └── evaluation.py    # Evaluation entity (criteria, scores, notes)
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Support services
│   │   │   └── events.py        # In-memory event bus for SSE multicast
│   │   └── demo/                # Demo helpers
│   │       ├── scenarios.py     # 4 pre-configured demo scenarios
│   │       └── fixtures.py      # Demo data
│   └── tests/
│       ├── conftest.py          # Pytest fixtures and utilities
│       ├── test_golden_path.py  # Full end-to-end run with approval
│       ├── test_permissions.py  # Permission engine tests
│       ├── test_approvals.py    # Approval flow tests
│       ├── test_retry.py        # Retry and fallback tests
│       ├── test_budget.py       # Budget enforcement tests
│       ├── test_evaluator.py    # Evaluation criteria tests
│       ├── test_scenarios.py    # Demo scenario tests
│       ├── test_demo_agent.py   # Demo agent planning logic
│       ├── test_safety_denial.py # Policy denial tests
│       └── test_tools.py        # Tool execution tests
├── frontend/
│   ├── package.json             # Node dependencies (Next.js, React)
│   ├── next.config.js           # Next.js configuration
│   ├── tailwind.config.js       # Tailwind CSS configuration
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Home page (main UI)
│   ├── components/              # React components
│   │   ├── RunHeader.tsx        # Page header
│   │   ├── StatusBadge.tsx      # Run status display
│   │   ├── MetricsPanel.tsx     # Tokens, cost, latency, tool calls, retries
│   │   ├── TaskInput.tsx        # Task input form with demo buttons
│   │   ├── ApprovalCard.tsx     # Approval decision UI (approve/deny buttons)
│   │   ├── TracePanel.tsx       # Live trace event stream
│   │   ├── ResultPanel.tsx      # Final run result text
│   │   ├── EvaluationPanel.tsx  # Evaluation scores and criteria
│   │   └── RunHistory.tsx       # Recent runs list
│   └── lib/
│       ├── api.ts              # API client functions
│       └── types.ts            # TypeScript types (Run, TraceEvent, Evaluation, etc.)
├── starter-kit/                 # Quickstart guide and troubleshooting
├── launch-kit/                  # Demo script, judge Q&A, and slide deck for hackathon judges
└── evals/                       # Evaluation test cases and runner
```

## Technology Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, asyncpg (PostgreSQL) / aiosqlite (SQLite for testing), Pydantic
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Database**: Supabase Postgres (production) / SQLite (testing)
- **LLM Integration**: OpenAI API (optional; defaults to DemoAgentAdapter)
- **Testing**: pytest, pytest-asyncio
- **Deployment**: Docker (frontend/backend Dockerfiles present, see Makefile for dev setup)

## Known Limitations & Future Work

- **Single-process in-memory state**: The `_active` dict in HarnessOrchestrator holds per-run state (adapter, pending approval). This works for the hackathon demo but scales only to one process. Multi-instance deployments will need a distributed state store (Redis, database).
- **TrueForge integration**: The `TrueForgeHarnessProvider` is a documented but unimplemented extension point. No TrueFoundry SDK is installed; a real integration would need to implement the same `start_run` and `resolve_approval` interface and translate the service's callbacks back into `TraceEvent` rows.
- **Demo agent limitations**: The `DemoAgentAdapter` uses simple keyword matching. Real agents would use actual LLMs or symbolic reasoning. The demo exists to prove the harness mechanics offline.
- **Approval timeout**: Currently, approvals don't timeout; they wait indefinitely. Future versions should add a timeout and auto-deny logic.
- **Cost estimates only**: Budget uses "Estimated Cost" figures for demo pricing, not real provider billing.

## Hackathon Demo

This is a submission to the September 2026 hackathon. See [launch-kit/DEMO_SCRIPT.md](./launch-kit/DEMO_SCRIPT.md) for the 3-minute demo walkthrough and [launch-kit/JUDGE_QA.md](./launch-kit/JUDGE_QA.md) for answers to common questions.

## Contributors

Built for the Agent Control Tower hackathon.

---

**Get started:** `make setup && make dev-backend` (terminal 1) + `make dev-frontend` (terminal 2), then open http://localhost:3000.

**Learn more:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [CONTRIBUTING.md](./CONTRIBUTING.md) · [Troubleshooting](./starter-kit/TROUBLESHOOTING.md)
