# Starter Kit

Welcome to Agent Control Tower. This directory contains guides to help you get started quickly.

## Quick Navigation

- **[QUICKSTART.md](./QUICKSTART.md)** — Clone, install, and run in 5 minutes
- **[ENVIRONMENT.md](./ENVIRONMENT.md)** — Environment variables explained
- **[ARCHITECTURE_CHEATSHEET.md](./ARCHITECTURE_CHEATSHEET.md)** — One-line summary of every module
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — Common issues and solutions

## What Is This?

Agent Control Tower is a minimal harness that sits between an AI agent and its tools. It:
- Enforces policies (ALLOW / REQUIRE_APPROVAL / DENY)
- Pauses for human approval before risky operations
- Traces every step in real-time
- Recovers from failures automatically (retry + fallback)
- Tracks token usage and costs
- Evaluates runs deterministically

## Hello World

```bash
# 1. Clone and install
git clone ...
cd agent-harness-build
make setup

# 2. Start backend (terminal 1)
make dev-backend

# 3. Start frontend (terminal 2)
make dev-frontend

# 4. Open http://localhost:3000 and click a DEMO button
```

That's it! No credentials needed; the default demo agent is offline.

## Next Steps

- Read [QUICKSTART.md](./QUICKSTART.md) for the exact commands
- Explore the [ARCHITECTURE_CHEATSHEET.md](./ARCHITECTURE_CHEATSHEET.md) to understand the modules
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if something doesn't work
- See the root [README.md](../README.md) for a detailed overview
- Read [ARCHITECTURE.md](../ARCHITECTURE.md) for deep dives into design decisions

## Questions?

If something isn't working, check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or open an issue.
