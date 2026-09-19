# Quickstart

Get Agent Control Tower running in 5 minutes.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Make
- Git

## Setup

### 1. Clone and Navigate

```bash
git clone https://github.com/your-org/agent-harness-build.git
cd agent-harness-build
```

### 2. Install Dependencies

```bash
make setup
```

This:
- Creates a Python virtual environment in `backend/.venv`
- Installs Python packages from `requirements.txt`
- Installs Node packages via `npm install` in `frontend/`

Takes ~2–3 minutes on first run.

### 3. Copy Environment File

```bash
cp .env.example .env
```

See [ENVIRONMENT.md](./ENVIRONMENT.md) for what each variable does. The defaults work out-of-the-box for demo mode.

## Run

You need **two terminals**.

### Terminal 1: Backend

```bash
make dev-backend
```

Output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

Backend is ready when you see "Application startup complete".

### Terminal 2: Frontend

```bash
make dev-frontend
```

Output:
```
  ▲ Next.js 16.3.5
  - Local:        http://localhost:3000
  - Environments: .env.local
```

Frontend is ready when you see the local URL.

## Use

1. Open http://localhost:3000 in your browser
2. You'll see 4 DEMO buttons or a task input box
3. Click a DEMO button to run a pre-configured scenario, or enter a custom task
4. Watch the trace and approval flow in real-time

## Demo Scenarios

| Button | What It Does |
|--------|-------------|
| **Research + Email** | Calls web_search, then send_email (pauses for approval) |
| **Human Approval** | Just send_email (still pauses for approval) |
| **Model Failure** | Forces a simulated failure; retry → fallback → success |
| **Forbidden Tool** | Tries delete_record (denied by policy; run finishes gracefully) |

## Test

Run the test suite to verify everything works:

```bash
make test
```

Output: `40 passed in Xs` (all tests pass).

Tests use SQLite in-memory; no Supabase setup needed.

## Stop

- Backend: Press `Ctrl+C` in Terminal 1
- Frontend: Press `Ctrl+C` in Terminal 2

## Next Steps

- Read [ARCHITECTURE.md](../ARCHITECTURE.md) for a deep dive into the harness design
- Explore [ENVIRONMENT.md](./ENVIRONMENT.md) to use a real OpenAI API
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if you hit issues
- Check the root [README.md](../README.md) for full feature documentation

## Troubleshooting

**"ModuleNotFoundError: No module named 'app'"**  
→ Make sure you've run `make setup` and are inside the virtual environment.

**"Address already in use:8000"**  
→ Port 8000 is taken. Kill the old backend: `lsof -i :8000 | grep python | awk '{print $2}' | xargs kill -9`

**"connect ECONNREFUSED 127.0.0.1:8000"**  
→ Backend isn't running. Go back to Terminal 1 and check that `make dev-backend` is running.

**"Test failures"**  
→ See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common test issues.

For more help, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

**Enjoy! Next: read [ARCHITECTURE.md](../ARCHITECTURE.md) to understand how it all works.**
