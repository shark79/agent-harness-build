> **Scope:** This document describes the original offline custom-harness demo. For the implemented TrueForge integration and challenge setup, use [TRUEFORGE_SETUP.md](../TRUEFORGE_SETUP.md). Statements below about an unimplemented TrueForge provider refer to the earlier scaffold.

# Environment Variables

All environment variables are loaded from `.env` at the repository root (shared with both backend and frontend).

## Copy the Template

```bash
cp .env.example .env
```

## Variables

### Agent & Model Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DEMO_MODE` | `true` | No | When `true`, use the deterministic `DemoAgentAdapter` (no OpenAI key needed). When `false`, use `OpenAIAgentAdapter` if `OPENAI_API_KEY` is set. |
| `OPENAI_API_KEY` | (empty) | No (unless `DEMO_MODE=false`) | Your OpenAI API key. Get it from https://platform.openai.com/api-keys. Only needed if you want to use real LLM-backed reasoning. |
| `PRIMARY_MODEL` | `gpt-4o-mini` | No | The model to use for agent reasoning. Alternatives: `gpt-4`, `gpt-4-turbo`, etc. Ignored if `DEMO_MODE=true`. |
| `FALLBACK_MODEL` | `gpt-4o` | No | Secondary model if the primary model fails after retries. Ignored if `DEMO_MODE=true`. |
| `DEMO_FORCE_MODEL_FAILURE` | `false` | No | When `true`, force a simulated model failure on the first call (triggers retry → fallback). Used for testing recovery mechanics. |

### Budget & Limits

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MAX_RUN_TOKENS` | `20000` | No | Maximum tokens per run. Run stops gracefully at `BUDGET_EXCEEDED` if exceeded. |
| `MAX_RUN_COST` | `0.50` | No | Maximum estimated cost (USD) per run. Stops at `BUDGET_EXCEEDED` if exceeded. (Estimated only, not real billing.) |

### Database

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./local.db` | No | Database connection string. See below for examples. |

**Examples:**

- **SQLite (development/testing, default)**:
  ```
  DATABASE_URL=sqlite+aiosqlite:///./local.db
  ```
  Creates a local `local.db` file. No credentials needed.

- **Supabase Postgres**:
  ```
  DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
  ```
  Get the connection string from your Supabase dashboard:
  1. Log in to https://supabase.com
  2. Select your project
  3. Click "Connect"
  4. Copy the "PostgreSQL" connection string
  5. Replace `[YOUR-PASSWORD]` with your database password

- **Local Postgres**:
  ```
  DATABASE_URL=postgresql://postgres:password@localhost:5432/agent-control-tower
  ```

The app automatically normalizes the connection string for async SQLAlchemy (adds `+asyncpg` for Postgres).

### Email Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `EMAIL_MODE` | `demo` | No | How to handle email sends. Options: `demo` (log to stdout, don't send), `smtp` (send via SMTP). |

### CORS & Hosting

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `BACKEND_CORS_ORIGINS` | (empty) | No | Comma-separated list of allowed frontend origins (e.g., `http://localhost:3000,https://yourapp.com`). Empty = allow all (not recommended for production). |

### Harness Provider

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `HARNESS_PROVIDER` | `local` | No | Which harness backend to use. Options: `local` (in-process, default), `trueforge` (not implemented; raises error if set). |

### Environment & Logging

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ENVIRONMENT` | `development` | No | Deployment environment. Cosmetic; used for logging/debugging. |

## Quick Setup Profiles

### Profile 1: Demo (Default, No Credentials)

```bash
# .env
DEMO_MODE=true
DATABASE_URL=sqlite+aiosqlite:///./local.db
```

✓ Works offline  
✓ No API keys needed  
✓ Tests pass automatically  

**Use this for exploring, testing, and hackathon demos.**

### Profile 2: OpenAI + Local SQLite

```bash
# .env
DEMO_MODE=false
OPENAI_API_KEY=sk-...
PRIMARY_MODEL=gpt-4o-mini
DATABASE_URL=sqlite+aiosqlite:///./local.db
```

✓ Real LLM reasoning  
✓ Local database (easy to reset)  
✗ Costs money per API call  

**Use this to test with real agents on your machine.**

### Profile 3: Production (Supabase + OpenAI)

```bash
# .env
DEMO_MODE=false
OPENAI_API_KEY=sk-...
PRIMARY_MODEL=gpt-4o-mini
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
BACKEND_CORS_ORIGINS=https://yourapp.com
ENVIRONMENT=production
```

✓ Persistent multi-user database  
✓ Real agents  
✗ Requires Supabase + OpenAI accounts  
✗ Costs money  

**Use this for shared deployments.**

## How to Get Credentials

### OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Log in or create an account
3. Click "Create new secret key"
4. Copy the key (you'll only see it once)
5. Paste into `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```

### Supabase Project

1. Go to https://supabase.com
2. Click "New project"
3. Fill in project details, choose a region
4. Wait for provisioning (~1 minute)
5. Once ready, click "Connect"
6. Select "PostgreSQL"
7. Copy the full connection string
8. Paste into `.env`:
   ```
   DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
   ```
   (Replace `PASSWORD` with the one you set during project creation)

## Resetting the Database

If the database gets into a bad state during testing:

**SQLite:**
```bash
rm local.db
make dev-backend  # Recreates the schema on startup
```

**Supabase:**
```bash
# In the Supabase dashboard, go to SQL Editor and run:
DROP TABLE IF EXISTS runs, trace_events, approvals, evaluations CASCADE;
# Then restart the backend
```

## What Each Variable Actually Does

**`DEMO_MODE=true`**  
→ Uses the keyword-based demo agent. No external API calls. Task "Research X and email me" → [web_search, send_email]. Task "delete Y" → [delete_record]. Etc.

**`DEMO_MODE=false` + `OPENAI_API_KEY=sk-...`**  
→ Real OpenAI API calls. The agent uses GPT to reason about which tool to call next. Slower but more flexible.

**`DEMO_FORCE_MODEL_FAILURE=true`**  
→ On run creation, force a simulated model failure after the first model call. Useful for testing retry/fallback. Can also be set per-run: `POST /api/runs {"task": "...", "force_model_failure": true}`.

**`MAX_RUN_TOKENS=20000`**  
→ If a run uses more than 20,000 tokens across all model calls, stop it at `BUDGET_EXCEEDED`.

**`MAX_RUN_COST=0.50`**  
→ If estimated cost exceeds $0.50, stop the run. (Estimated only; not tied to actual billing.)

**`DATABASE_URL=...`**  
→ Where to store runs, trace events, approvals, and evaluations. SQLite works offline; Postgres gives you multi-user persistence.

---

**Next:** See [QUICKSTART.md](./QUICKSTART.md) to run the app, or [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if you hit issues.
