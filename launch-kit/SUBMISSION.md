# Hackathon Submission

## Project: Agent Control Tower

**Tagline**: Observe. Govern. Evaluate. Recover.

A minimal, purpose-built harness for governing AI agent behavior, enforcing policies, and recovering from failures—without changing a line of agent code.

## What's Implemented

### Core Features
- ✓ **Permission Engine**: Tool-level policy enforcement (ALLOW / REQUIRE_APPROVAL / DENY)
- ✓ **Approval Engine**: Human-in-the-loop pauses for risky operations
- ✓ **Live Tracing**: Real-time event stream (SSE) of every orchestrator step
- ✓ **Retry + Fallback**: Automatic recovery from transient model failures
- ✓ **Budget Enforcement**: Per-run token and cost limits with warnings
- ✓ **Deterministic Evaluation**: 6 automated criteria scoring runs
- ✓ **Agent Abstraction**: Pluggable adapters (OpenAI + DemoAgent); swap without changing harness

### Demo & Testing
- ✓ **4 Demo Scenarios**: Pre-configured buttons showing golden path, approval flow, failure recovery, and policy denial
- ✓ **40 Passing Tests**: Coverage of permissions, approvals, retry/fallback, budget, evaluation, and end-to-end flows
- ✓ **Offline-Ready**: DemoAgentAdapter works with zero external credentials
- ✓ **Real UI**: React/Next.js frontend with real-time trace streaming and approval workflow

### Technology
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, asyncpg/aiosqlite
- **Frontend**: React 19, Next.js 16, TypeScript, Tailwind CSS
- **Database**: Supabase Postgres (production) / SQLite (testing)
- **LLM Integration**: OpenAI API (optional; defaults to DemoAgent)

## How to Run

```bash
# 1. Clone
git clone <repo>
cd agent-harness-build

# 2. Install
make setup

# 3. Backend (Terminal 1)
make dev-backend

# 4. Frontend (Terminal 2)
make dev-frontend

# 5. Open http://localhost:3000 and click a DEMO button
```

**No credentials required**; the default demo is fully offline.

To run tests:
```bash
make test
# Output: 40 passed
```

## Key Architecture Decisions

1. **Thin harness principle**: Governance is orthogonal to reasoning. The harness doesn't know or care what the agent thinks; it just enforces policies around tool calls.

2. **Abstraction layers**: AgentAdapter (reasoning implementation), HarnessProvider (orchestration backend), ToolRegistry (policies)—all pluggable. Makes the system reusable across agent types.

3. **Single orchestrator loop**: Retry, routing (fallback), and budget are all wired through one `_call_model` seam in HarnessOrchestrator. This ensures coherent failure handling and makes the logic easy to follow.

4. **Deterministic evaluation**: No LLM judge—6 rule-based criteria (task completion, tool selection, policy compliance, approval compliance, budget compliance, error recovery) scored algorithmically.

5. **Practical defaults**: Demo mode works fully offline; SQLite for testing; optional OpenAI integration; clean env-based configuration.

## Known Limitations (Honest)

- **Single-process**: In-memory state (_active dict) scales to one process only. Production would use Redis/database-backed state.
- **TrueForge not integrated**: TrueForgeHarnessProvider is a documented extension point with a docstring explaining what a real integration needs, but no TrueFoundry SDK is installed (unknown API surface, no credentials).
- **Demo agent is keyword-based**: Real agents use LLMs; this one uses keyword matching to prove harness mechanics offline. Swap in OpenAIAgentAdapter for real reasoning.
- **Approval timeout not implemented**: Approvals wait indefinitely; future versions would add auto-deny logic.

## Why It's Production-Ready (In Scope)

- **Tested**: 40 tests covering all harness mechanics, permission flows, retry/fallback, budget, evaluation
- **Traced**: Every step persisted; real-time SSE streaming for observability
- **Evaluated**: Deterministic criteria make success measurable and reproducible
- **Documented**: Architecture guide, API docs, troubleshooting, demo script
- **Modular**: Swappable agents, harness backends, tool registries
- **Safe by design**: Policies enforced at call time; no bypass routes at the app layer

## Timeline

- **Day 1**: Architecture design, harness orchestrator, permission/approval engines, retry/fallback, budget
- **Day 2**: Agent adapters (OpenAI + DemoAgent), tracing, evaluation, evaluation criteria
- **Day 3**: Frontend (React, SSE streaming, approval UI), test suite (40 tests), demo scenarios
- **Day 4**: Documentation (README, ARCHITECTURE.md, guides), final testing, demo rehearsal

## Next Steps (Not in Hackathon)

- Distributed state for multi-instance deployments (Redis/database-backed)
- Multi-tenant scoping (org/user contexts, role-based approval)
- Audit logging for compliance
- TrueForge managed backend integration
- Custom tool registry (users define their own tools)
- Real provider billing integration

## Team

Built by [Shashank Jamkhandi](mailto:shashankjamkhandi@gmail.com) for the September 2026 hackathon.

---

**Demo**: See [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) for the 3-minute walkthrough.

**Questions**: See [JUDGE_QA.md](./JUDGE_QA.md) for detailed answers.
