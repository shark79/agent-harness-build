# Pre-Demo Checklist

Use this checklist immediately before demoing to judges.

## Environment Setup

- [ ] Backend is running: `make dev-backend` in Terminal 1 shows "Uvicorn running on http://127.0.0.1:8000"
- [ ] Frontend is running: `make dev-frontend` in Terminal 2 shows "Local: http://localhost:3000"
- [ ] Browser is open to http://localhost:3000
- [ ] `.env` file exists with `DEMO_MODE=true` (for offline demo)
- [ ] Database is initialized (SQLite local.db exists or Supabase is reachable)

## Functionality

- [ ] 4 DEMO buttons are visible on the frontend (Research+Email, Human Approval, Model Failure, Forbidden Tool)
- [ ] Clicking a DEMO button creates a run (status CREATED appears)
- [ ] Run status updates as the agent executes (RUNNING → WAITING_FOR_APPROVAL or COMPLETED)
- [ ] Trace panel on the right shows events in real-time (RUN_STARTED, TOOL_REQUESTED, PERMISSION_CHECK, etc.)
- [ ] Approval modal appears when a tool requires approval (send_email in Research+Email scenario)
- [ ] Clicking "Approve" resumes the run and executes the tool
- [ ] Clicking "Deny" stops the run gracefully
- [ ] Metrics panel shows tokens, estimated cost, latency, tool_calls, retry_count
- [ ] Final result appears in the Result panel after run completes
- [ ] Evaluation panel appears automatically once run is terminal (COMPLETED or FAILED)
- [ ] Evaluation scores show the overall score and individual criteria (task_completion, tool_selection, policy_compliance, approval_compliance, budget_compliance, error_recovery)

## Demo Scenarios

### Research + Email (Golden Path)
- [ ] Task: "Research AI agent observability and email me a summary"
- [ ] web_search is requested and executed (PERMISSION_CHECK = ALLOW)
- [ ] send_email is requested, approval is required (PERMISSION_CHECK = REQUIRE_APPROVAL)
- [ ] Run pauses (WAITING_FOR_APPROVAL)
- [ ] Approval modal shows with Approve/Deny buttons
- [ ] Clicking Approve resumes the run
- [ ] send_email executes (TOOL_COMPLETED with status="sent", mode="demo")
- [ ] Run completes (COMPLETED)
- [ ] Trace shows: RUN_STARTED, MODEL_CALL_STARTED, TOOL_REQUESTED (web_search), PERMISSION_CHECK (ALLOW), TOOL_STARTED, TOOL_COMPLETED, MODEL_CALL_COMPLETED, (repeat for email), APPROVAL_REQUIRED, APPROVAL_GRANTED, TOOL_STARTED (email), TOOL_COMPLETED, MODEL_CALL_COMPLETED, RUN_COMPLETED

### Human Approval (Email Only)
- [ ] Task: "Email me a summary of our Q3 roadmap"
- [ ] send_email is requested immediately (no research needed)
- [ ] Approval is still required
- [ ] Run pauses (WAITING_FOR_APPROVAL)
- [ ] Approval modal appears
- [ ] Approve works, email executes, run completes

### Model Failure (Retry + Fallback)
- [ ] Task: "Research the latest LLM benchmarks"
- [ ] MODEL_CALL_STARTED appears
- [ ] After ~1 second, RETRY_STARTED appears (simulated failure)
- [ ] MODEL_CALL_STARTED appears again (retry)
- [ ] FALLBACK_TRIGGERED appears (primary model exhausted, switching to fallback)
- [ ] MODEL_CALL_STARTED appears on new model
- [ ] MODEL_CALL_COMPLETED appears
- [ ] web_search executes normally
- [ ] Run completes (COMPLETED)
- [ ] Run status changed to reflect the fallback model (model field in metrics)

### Forbidden Tool (Policy Denial)
- [ ] Task: "Delete the customer record for user 4821"
- [ ] delete_record is requested (TOOL_REQUESTED)
- [ ] PERMISSION_CHECK appears with decision = DENY
- [ ] delete_record is NOT executed (no TOOL_STARTED or TOOL_COMPLETED)
- [ ] Run continues (agent finishes gracefully)
- [ ] Run completes (COMPLETED)
- [ ] Result shows a message like "Could not delete the requested record: denied by policy"

## Tests

- [ ] All tests pass: `make test` shows "40 passed"
- [ ] No test errors or warnings

## UI/UX

- [ ] Trace events appear in real-time (not all at once at the end)
- [ ] Run history shows recent runs below the main panel
- [ ] Clicking a run in history loads it and shows its trace
- [ ] No console errors in browser (Ctrl+Shift+J to check)
- [ ] No backend errors in Terminal 1

## Network & Performance

- [ ] Backend responds quickly to API calls (no timeouts)
- [ ] SSE (Server-Sent Events) stream works or falls back to polling smoothly
- [ ] Frontend doesn't freeze during a run
- [ ] Latency shown in metrics is reasonable (< 5 seconds for demo runs)

## Backup Plan (If Something Breaks)

- [ ] If backend crashes: `make dev-backend` restarts it
- [ ] If frontend breaks: `Ctrl+C` in Terminal 2, then `make dev-frontend` restarts it
- [ ] If database is corrupted: `rm local.db` and restart backend (recreates schema)
- [ ] If you get stuck: Switch to a different demo button and try that scenario instead

## During Demo

- [ ] Speak clearly and slowly (judges may not be familiar with the terminology)
- [ ] Point to the UI elements (TracePanel, ApprovalCard, MetricsPanel) as you mention them
- [ ] Emphasize the key moments:
  - Approval pause (WAITING_FOR_APPROVAL status)
  - Retry + fallback (RETRY_STARTED, FALLBACK_TRIGGERED events)
  - Policy denial (PERMISSION_CHECK = DENY, tool not executed)
  - Trace events showing every step
- [ ] If a run is slow, keep talking; don't stare silently at the screen
- [ ] If a scenario fails, skip to the next one and come back if time permits

## Timing

- [ ] Full 3-minute script can be delivered smoothly
- [ ] Each demo scenario takes ~20–45 seconds
- [ ] Total demo time (3 scenarios): ~2 minutes
- [ ] Remaining 1 minute: architecture/vision

---

**Before stepping in front of judges, check all these boxes. If something is unchecked, fix it or practice workaround.** 

**Good luck!**
