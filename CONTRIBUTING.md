# Contributing

Agent Control Tower is a hackathon project. Contributions are welcome and straightforward.

## Before You Start

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the harness design
- Run the test suite to verify the project works in your environment:
  ```bash
  make setup
  make test
  ```

## Workflow

1. **Create a branch** off `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Backend: `backend/app/` → run `make test` to verify
   - Frontend: `frontend/` → test in browser at http://localhost:3000
   - Keep changes focused and small

3. **Run tests** before submitting:
   ```bash
   make test
   ```

4. **Commit and push**:
   ```bash
   git commit -m "Clear, concise message"
   git push origin feature/your-feature-name
   ```

5. **Open a pull request** on `main`

## Testing

Backend tests use pytest. Run all tests:
```bash
make test
```

Run a specific test file:
```bash
cd backend && . .venv/bin/activate && pytest tests/test_golden_path.py -v
```

Tests use SQLite in-memory databases, so no Supabase credentials are needed. The test suite covers:
- Permissions engine
- Approval flows
- Retry and fallback mechanics
- Budget enforcement
- Evaluation criteria
- Demo scenarios
- Tool execution

## Code Style

- **Python**: Follow PEP 8; the codebase uses type hints
- **TypeScript**: Follow standard conventions; no strict linting rules enforced
- **Imports**: Organize alphabetically; use absolute paths in TypeScript

## Commit Guidelines

- Keep commits atomic (one logical change per commit)
- Write clear commit messages ("Add retry logic for transient errors", not "fix bug")
- Reference issue numbers if applicable

## Questions?

- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for design questions
- See [starter-kit/TROUBLESHOOTING.md](./starter-kit/TROUBLESHOOTING.md) for common issues
- Open an issue to discuss larger changes before submitting a PR

---

**Happy contributing!**
