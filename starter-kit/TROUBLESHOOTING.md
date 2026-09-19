# Troubleshooting

Common issues and solutions.

## Setup Issues

### "ModuleNotFoundError: No module named 'app'"

**Cause**: You haven't activated the Python virtual environment or haven't run `make setup`.

**Fix**:
```bash
cd backend
. .venv/bin/activate  # or: source .venv/bin/activate on macOS/Linux
cd ..
make test            # Should work now
```

### "Command 'npm' not found"

**Cause**: Node.js is not installed.

**Fix**:
- Install Node.js from https://nodejs.org (version 18 or later)
- Then retry `make setup`

### "Command 'python3' not found"

**Cause**: Python is not installed.

**Fix**:
- Install Python from https://python.org (version 3.10 or later)
- Then retry `make setup`

## Runtime Issues

### Backend won't start: "Address already in use:8000"

**Cause**: Another process is using port 8000.

**Fix**:
```bash
# Kill the old process
lsof -i :8000 | grep python | awk '{print $2}' | xargs kill -9

# Or just use a different port
cd backend && . .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

### Frontend shows "Could not start the run. Is the backend reachable?"

**Cause**: Backend is not running or frontend can't reach it.

**Fix**:
1. Verify backend is running: `make dev-backend` in Terminal 1 should show "Uvicorn running on http://127.0.0.1:8000"
2. Check CORS: If backend is on a different port, update `BACKEND_CORS_ORIGINS` in `.env` or let it default to `*` (allow all)
3. Check network: If backend and frontend are on different machines, ensure they can reach each other (firewalls, VPNs)

### Frontend doesn't respond after clicking a DEMO button

**Cause**: Backend is not processing the request or is crashing silently.

**Fix**:
1. Check backend terminal for error messages
2. Try clicking again (may be a transient network hiccup)
3. Check browser console (Ctrl+Shift+J): look for fetch errors
4. Check backend is running and connected to database (see below)

## Database Issues

### "sqlite3.OperationalError: no such table: runs"

**Cause**: Tables haven't been created yet. This should happen automatically on app startup.

**Fix**:
```bash
# Restart the backend - it will initialize tables
make dev-backend
```

### "ConnectionRefusedError" or "could not translate host name to address" for Supabase

**Cause**: You've set `DATABASE_URL` to a Supabase Postgres connection, but the hostname doesn't resolve (DNS issue, firewall, or network outage).

**Context**: This is a known limitation of this hackathon environment (sandboxed network). The backend code is correct; `app/config.py::to_async_database_url()` handles Postgres credentials safely. Tests use SQLite to bypass this.

**Fix for development**:
1. Use SQLite (default): `DATABASE_URL=sqlite+aiosqlite:///./local.db` in `.env`
2. Once deployed outside this sandbox, real Postgres works fine

**Fix for production**:
1. Use Supabase: Set `DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres`
2. Verify the connection string is correct (get it from Supabase dashboard)
3. Verify your firewall allows outbound connections to Supabase

### "FileNotFoundError: [Errno 2] No such file or directory: 'local.db'"

**Cause**: SQLite can't create the local database file (permissions issue).

**Fix**:
```bash
# Make sure the directory is writable
chmod 755 .
rm -f local.db  # Delete if it exists
make dev-backend  # Will recreate
```

### Database is in a bad state (corrupted or old schema)

**Cause**: Schema changed, or tables got corrupted during testing.

**Fix**:
```bash
# For SQLite:
rm local.db
make dev-backend  # Recreates tables

# For Supabase, run this in the SQL Editor:
DROP TABLE IF EXISTS runs, trace_events, approvals, evaluations CASCADE;
# Then restart backend
```

## Demo & Test Issues

### Demo agent won't plan tools correctly

**Cause**: The `DemoAgentAdapter` uses keyword matching. It won't recognize misspellings.

**Example**: "Resarch AI observability" (typo) won't trigger web_search because it looks for "research".

**Fix**:
- Use exact keywords in the task: "research", "email", "calculate", "delete"
- See `backend/app/agent/demo_agent.py::_build_plan()` for exact keyword matching

### "DEMO_FORCE_MODEL_FAILURE=true" doesn't trigger failure

**Cause**: Maybe you're using `OpenAIAgentAdapter` (real OpenAI) which can't simulate a forced failure.

**Context**: The demo force-failure only works with `DemoAgentAdapter`. If you have `OPENAI_API_KEY` set and `DEMO_MODE=false`, you're using the real adapter.

**Fix**:
1. To test recovery mechanics: set `DEMO_MODE=true` and `OPENAI_API_KEY=` (unset)
2. Or POST `{"force_model_failure": true}` when creating a run to trigger it

### Test failures

**"AssertionError: assert 40 passed" or specific test failures**

**Cause**: Database state issue or backend not properly initialized.

**Fix**:
```bash
# Clean and retry
rm -f local.db
make test

# Or run a single test for more detail:
cd backend && . .venv/bin/activate
pytest tests/test_golden_path.py -v -s
```

### "OPENAI_API_KEY not set" error when using real OpenAI

**Cause**: `DEMO_MODE=false` but `OPENAI_API_KEY` is empty in `.env`.

**Fix**:
1. Get an API key from https://platform.openai.com/api-keys
2. Add to `.env`: `OPENAI_API_KEY=sk-...`
3. Restart backend

### Real OpenAI calls fail with "401 Unauthorized"

**Cause**: Invalid API key.

**Fix**:
1. Check the key is correct (copy-paste from platform.openai.com)
2. Make sure it has permissions (check usage page)
3. Generate a new key if needed

## Approval & Trace Issues

### Approval modal never shows

**Cause**: The task doesn't trigger any approval-required tools.

**Context**: Only `send_email` requires approval in the default registry.

**Fix**:
- Use one of the demo buttons (they include email)
- Or enter a task that includes "email": "Email me a summary of..."

### Trace panel is empty

**Cause**: Run hasn't started or hasn't called any tools yet.

**Fix**:
1. Check run status (should be RUNNING)
2. Wait a moment—trace events may be streaming
3. Refresh the page if stuck

### SSE (Server-Sent Events) not working

**Cause**: Some proxies/CDNs don't support SSE. Frontend falls back to polling.

**Fix**:
- No action needed; frontend automatically falls back to 1-second polling
- If you want to force SSE, clear browser cache or use incognito mode

## CORS Issues

### "Access to XMLHttpRequest blocked by CORS policy"

**Cause**: Frontend and backend are on different hosts/ports, and `BACKEND_CORS_ORIGINS` is too restrictive.

**Fix**:
```bash
# In .env, set:
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:8000
# Or allow all (dev only):
BACKEND_CORS_ORIGINS=
```

Then restart backend.

## Performance Issues

### Runs take a very long time

**Cause**: 
- If using real OpenAI: API latency, rate limits, or model slowness
- If using demo agent: might be waiting for approval

**Fix**:
- Check trace panel to see where the run is stuck
- If WAITING_FOR_APPROVAL: click Approve to continue
- If MODEL_CALL_STARTED: the model is thinking; be patient
- If bottlenecked on approval: this is intentional (human-in-the-loop)

### High memory usage

**Cause**: Old runs accumulate in memory. In-memory `_active` dict in orchestrator shouldn't grow, but frontend's run history grows.

**Fix**:
- This is a known limitation of the single-process demo
- Production would use a database-backed queue and distributed state
- For now, just reload the page to clear frontend state

## Evaluation Issues

### Evaluation scores are 0%

**Cause**: Run failed or didn't complete the expected path.

**Fix**:
1. Check the trace to see where the run stopped
2. See [ARCHITECTURE.md](../ARCHITECTURE.md) for evaluation criteria
3. Example: If task is "Research AI", the agent must request web_search to pass tool_selection

### "Evaluation not found" when clicking Evaluate

**Cause**: Run is still running; evaluation is called automatically once it completes.

**Fix**:
- Wait for the run to finish (status = COMPLETED or FAILED)
- Evaluation is triggered automatically; no manual click needed

## Still Stuck?

1. Check [ARCHITECTURE.md](../ARCHITECTURE.md) for deeper understanding
2. Look at test files (`backend/tests/`) for examples of correct usage
3. Check backend logs for error messages (Terminal 1)
4. Check browser console for frontend errors (Ctrl+Shift+J)
5. Open an issue with:
   - Steps to reproduce
   - Backend logs
   - Browser console logs
   - `.env` (without secrets)

---

**More help**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) for design details or [QUICKSTART.md](./QUICKSTART.md) to start fresh.
