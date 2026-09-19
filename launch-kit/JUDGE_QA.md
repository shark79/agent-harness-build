# Judge Q&A

Answers to common questions about Agent Control Tower.

## 1. Why do we need an agent harness?

LLM agents are powerful but uncontrolled. They can:
- **Waste money**: Make unlimited API calls, exceed budgets silently
- **Break things**: Call unintended tools, delete data, send emails to wrong people
- **Fail quietly**: Encounter transient errors and never recover
- **Hide decisions**: No visibility into why the agent did what it did

An agent harness intercepts tool calls and adds governance (permissions, approvals, budgets, tracing, recovery). It's a thin layer that doesn't change the agent's reasoning—just keeps it safe and observable.

## 2. Why not just use an SDK?

SDKs (OpenAI, Anthropic, etc.) are great for basic agent functionality but aren't designed for governance. They focus on reasoning, not policy enforcement. An SDK might offer logging, but not pause-for-approval, not permission checks, not intelligent retry/fallback.

A harness complements SDKs: it wraps around whatever agent code you have (SDK-based or custom) and enforces governance orthogonal to reasoning. You keep your agent as-is; the harness sits between the agent and the tool layer.

## 3. What's the core governance capability?

**Permissions + Approvals + Tracing + Recovery + Budget**.

- **Permissions**: Tool-level ALLOW / REQUIRE_APPROVAL / DENY. Example: calculator (ALLOW, no approval), email (ALLOW, approval required), delete (DENY).
- **Approvals**: Run pauses if an approval-required tool is called; waits for a human decision via the UI.
- **Tracing**: Every significant step (tool request, permission check, approval, retry, failure) is persisted and streamed in real-time.
- **Recovery**: Automatic retry for transient failures; fallback to a secondary model if retries exhaust.
- **Budget**: Token and cost limits per run; graceful stop if exceeded.

## 4. How does permission enforcement work?

Permissions live in the ToolRegistry metadata. When the agent requests a tool:

1. HarnessOrchestrator.check(tool_name) queries the registry for that tool's permission
2. If DENY: the harness doesn't execute the tool; it tells the agent "denied" and the agent finishes gracefully
3. If REQUIRE_APPROVAL: the harness pauses the run, creates an approval, waits for a human decision, resumes
4. If ALLOW: the harness executes the tool immediately

The agent never knows about permissions; the harness enforces them transparently. Changing policies is as simple as editing the registry—no agent code changes needed.

## 5. How do you measure success?

Deterministic evaluation: 6 automated criteria, no LLM judge needed.

1. **task_completion**: Did the run complete?
2. **tool_selection**: Did the agent request appropriate tools for the task?
3. **policy_compliance**: Were denied tools never executed?
4. **approval_compliance**: Were approval-required tools executed only after approval?
5. **budget_compliance**: Did the run stay within token/cost limits?
6. **error_recovery**: If retry/fallback was exercised, did the run still complete?

Each criterion scores as pass (1.0), fail (0.0), or not applicable (None). The overall score is the percentage of applicable criteria that passed. This is called on-demand via POST /api/runs/{id}/evaluate and is idempotent.

## 6. How do you prevent bypass?

By layering enforcement at the right place. Permissions are checked *before* tool execution in the orchestrator—the agent can't reach the tool if it's denied. Approvals are checked *before* execution—the run pauses in-process; the agent can't resume until a human decides. Code-level bypass (modifying the orchestrator, calling tools directly) would require compromising the server itself, which is out of scope for app-layer governance.

If an agent is running in a separate process (future: TrueForge backend), the harness is a network boundary; bypass is impossible.

## 7. How do you handle model failures?

Two-step recovery: **retry + fallback**.

- **Retry**: If a model call fails with a transient error (timeout, rate limit, temporary provider error), retry up to MAX_ATTEMPTS times with backoff
- **Fallback**: If retries exhaust, switch to a secondary model (e.g., gpt-4o-mini → gpt-4o) and try once more
- **Fail gracefully**: If fallback also fails, the run stops with status FAILED

Retry and fallback are automatic; the user doesn't intervene. The run is traced at every step (RETRY_STARTED, FALLBACK_TRIGGERED) so users can see recovery happened.

## 8. How do you control costs?

Budget enforcement: per-run token and cost limits.

- **MAX_RUN_TOKENS**: Max tokens per run (default 20,000)
- **MAX_RUN_COST**: Max estimated cost per run (default $0.50)

After every model call, the orchestrator increments run.tokens and run.estimated_cost, then checks against limits:
- 0–80%: OK
- 80–100%: WARNING (trace event recorded)
- ≥100%: EXCEEDED (run stops, status = BUDGET_EXCEEDED)

Cost is "Estimated Cost" only (illustrative pricing, not real billing). Production would integrate with provider billing APIs.

## 9. How does the harness scale?

**Current**: Single-process demo. In-memory state dict (_active) holds per-run adapters and pending approvals.

**Limitations**:
- Only one process can run
- No multi-instance load balancing
- Approval pause state is lost if the process crashes

**Path to scale**:
- Move in-memory state to a database or Redis
- Use a job queue (Celery, RQ) for distributed run execution
- Use a distributed lock for concurrent orchestration
- The HarnessProvider abstraction supports this; LocalHarnessProvider would be replaced with a DistributedHarnessProvider

For a hackathon, single-process is sufficient. Production would follow the distributed path.

## 10. Is this enterprise-fit?

For a V1 hackathon, it's feature-complete for single-tenant, single-process deployments. Enterprise would need:

- **Multi-tenant scoping**: Org/user contexts, role-based approval (CEO vs. developer)
- **Audit logging**: Immutable log of all approvals/denials for compliance
- **Distributed state**: Redis/database-backed session for multi-instance
- **Integration**: TrueFoundry/TrueForge backend for managed governance
- **SLA guarantees**: Uptime, durability, disaster recovery

The architecture supports all of this (HarnessProvider abstraction, modular components). It's a prototype, but not a toy.

## 11. What about TrueForge/TrueFoundry?

TrueForgeHarnessProvider is a **documented extension point only**—not implemented in this hackathon.

**Why not implemented**:
- No TrueFoundry SDK installed (would require credentials, NDA, or public docs we don't have)
- Unknown API surface (what does managed orchestration look like?)
- Deliberately not guessed at

**How it would work**:
- Implement the same interface as LocalHarnessProvider (start_run, resolve_approval)
- Call TrueForge's managed orchestration API instead of running HarnessOrchestrator in-process
- Translate TrueForge's callbacks/webhooks back into TraceEvent rows via TraceRecorder
- The API and UI need zero changes; they only know about TraceEvents and Runs

If TrueForge integration is desired, the skeleton is there; it just needs the service SDK and credential setup.

## 12. What's next for Agent Control Tower?

**Short-term (post-hackathon)**:
- Approval timeout + auto-deny
- Distributed state for multi-instance
- Real provider billing integration
- Tool schema validation and UI form generation

**Medium-term**:
- Multi-tenant scoping and role-based approval
- Audit logging for compliance
- More agent implementations (Anthropic, Llama, etc.)
- Custom tool registry (users define their own tools)

**Long-term**:
- TrueForge managed backend integration
- Agent marketplace (share pre-configured agents + harness profiles)
- Enterprise SLA and support

## 13. How is this different from observability alone?

**Observability** (e.g., OpenTelemetry): Logs what happened. Useful for debugging but comes *after* the damage.

**Governance** (Agent Control Tower): Prevents what shouldn't happen. Pauses runs before risky operations. Enforces policies in real-time.

Observability is read-only. Governance is read-write (pause, deny, retry). They're complementary: governance + observability = safe, visible agents. The hackathon focuses on governance; observability (tracing) is the byproduct.

---

**Any other questions? Ask during Q&A or check [ARCHITECTURE.md](../ARCHITECTURE.md) for technical details.**
