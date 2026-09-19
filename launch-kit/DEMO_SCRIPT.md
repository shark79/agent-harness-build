# 3-Minute Demo Script

**Audience**: Hackathon judges  
**Time**: 3 minutes  
**Setup**: Backend and frontend running, browser open to http://localhost:3000

---

## 0:00–0:20 | The Problem (20 seconds)

*[Speak while showing the UI]*

"AI agents are powerful but risky. Let me show you the dangers:

*[Point to the task input]*

When an agent calls a tool—send an email, delete a record, make an API call—there's no built-in governance. The agent can do whatever it wants. No cost controls. No human oversight. No way to see what went wrong if it fails.

*[Pause]*

Agent Control Tower solves this."

---

## 0:20–0:40 | The Solution (20 seconds)

*[Point to the architecture mentally, don't need visuals]*

"We built a thin harness between the agent and its tools. The harness:
- **Enforces policies**: Some tools are allowed, some require approval, some are forbidden
- **Pauses for humans**: The run stops and waits for a human decision before risky operations
- **Traces everything**: Every step—tool request, permission check, approval, retry, failure—is recorded in real-time
- **Recovers gracefully**: If the AI model fails, we retry; if that fails, we switch to a backup model
- **Controls costs**: We track tokens and stop the run if it exceeds a budget

All of this without touching the agent code. The agent doesn't even know it's being governed."

---

## 0:40–2:20 | Live Demo (100 seconds)

### Beat 1: Golden Path (45 seconds)

*[Click "Research + Email" button]*

**Task**: "Research AI agent observability and email me a summary"

*[Watch the trace appear in real-time]*

"The agent requests web_search. The harness checks permissions—it's allowed—and executes it.

*[Point to TracePanel on the right]*

You can see every event here: RUN_STARTED, MODEL_CALL_STARTED, TOOL_REQUESTED, PERMISSION_CHECK (ALLOW), TOOL_STARTED, TOOL_COMPLETED.

Next, the agent wants to send_email. But email requires approval—it's risky.

*[Point to ApprovalCard]*

See? The run pauses. Status changes to WAITING_FOR_APPROVAL. The harness won't send the email until a human says yes.

*[Click Approve]*

Approval granted. The email executes. The run completes.

*[Point to MetricsPanel]*

Total latency: X seconds. 2 tool calls. X tokens used. X estimated cost.

If we denied it instead of approving, the agent would finish gracefully and report 'Email was denied by policy.'—without ever sending anything."

### Beat 2: Model Failure & Recovery (35 seconds)

*[Click "Model Failure" button]*

**Task**: "Research the latest LLM benchmarks"

*[Watch the trace]*

"This one is special—we force a deterministic model failure to show retry and fallback.

*[Point to trace events]*

MODEL_CALL_STARTED. The model fails mid-call. RETRY_STARTED. We try again... and it fails again. Retries exhausted.

Now, normally that would end the run. But we have a fallback model. FALLBACK_TRIGGERED—we switch from gpt-4o-mini to gpt-4o. Try once more on the backup.

*[Watch it succeed]*

Success. The run completes. The agent never knows it failed; recovery was automatic.

This is crucial: in production, transient API failures happen all the time. Automatic retry + fallback means the run succeeds without human intervention."

### Beat 3: Policy Denial (20 seconds)

*[Click "Forbidden Tool" button]*

**Task**: "Delete the customer record for user 4821"

*[Watch the trace]*

"The agent tries to call delete_record. The harness checks permissions—DENY. That tool is forbidden by policy.

*[Point to trace]*

PERMISSION_CHECK: DENY. The harness doesn't execute it; it just tells the agent 'denied' and the agent finishes gracefully.

No record was deleted. No damage. Policy was enforced automatically."

---

## 2:20–2:40 | Architecture & Tech (20 seconds)

*[Briefly, no need to show code]*

"Under the hood:
- **Backend**: Python, FastAPI, async SQLAlchemy. The harness is a single orchestrator loop: permission engine → approval engine → tool registry → retry/fallback logic → trace recorder.
- **Frontend**: React, real-time SSE streaming of trace events.
- **Database**: Supabase Postgres for persistence; SQLite for testing.
- **Agent abstraction**: We have two agents—a real OpenAI-backed one and a deterministic demo one. The harness doesn't care which; they implement the same interface.

The key idea: governance is orthogonal to reasoning. You can swap agents without changing the harness."

---

## 2:40–3:00 | Closing (20 seconds)

"This is a hackathon prototype, but it's production-ready in scope:
- 40 passing tests covering all harness mechanics
- Comprehensive tracing for observability and debugging
- Deterministic evaluation criteria to measure success
- Two agent implementations showing swappability

The vision: Agent Control Tower becomes the standard layer between every LLM agent and its tools. It's open-source, minimal, and makes autonomous agents safe by default."

*[Pause]*

"Questions?"

---

## Visual Cues During Demo

| Time | Look at |
|------|---------|
| 0:00–0:40 | Talk; maybe show UI briefly |
| 0:40–1:25 | TracePanel (right side), ApprovalCard, MetricsPanel (left side) |
| 1:25–2:00 | TracePanel (watch retry and fallback events) |
| 2:00–2:20 | TracePanel (watch permission denial) |
| 2:20–2:40 | Mention backend/frontend/DB; no need to show code |
| 2:40–3:00 | Speak about vision; maybe show a test result or the endpoint list |

## If Something Goes Wrong

- **Run doesn't start**: Restart backend (`make dev-backend`), refresh browser
- **Approval modal doesn't show**: It should show automatically; wait a second or manually refresh trace
- **Trace not updating**: Reload the page (Cmd+R / Ctrl+R)
- **Keep talking**: Gloss over technical issues; the core idea (governance, approval, tracing, recovery) is what matters

---

**Practice this script 2–3 times before the presentation to hit the timing.**
