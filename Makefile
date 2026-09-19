.PHONY: setup dev-backend dev-frontend test demo

setup:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && . .venv/bin/activate && pytest

demo:
	@echo "1. make dev-backend   (separate terminal)"
	@echo "2. make dev-frontend  (separate terminal)"
	@echo "3. open http://localhost:3000 and click a DEMO button, or see DEMO.md"

.PHONY: trueforge dev-trueforge-backend trueforge-check
trueforge:
	bash scripts/trueforge-local.sh

dev-trueforge-backend:
	cd backend && . .venv/bin/activate && HARNESS_PROVIDER=trueforge uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

trueforge-check:
	cd backend && . .venv/bin/activate && python -m app.trueforge_setup check

.PHONY: image-mcp image-mcp-setup
image-mcp-setup:
	cd tools/openai-image-mcp && PYTHON_BIN=$$(command -v python3.12 || command -v python3.13 || command -v python3) && $$PYTHON_BIN -m venv .venv && . .venv/bin/activate && python -m pip install -r requirements.txt

image-mcp:
	cd tools/openai-image-mcp && . .venv/bin/activate && python server.py

.PHONY: linkedin-mcp linkedin-mcp-setup linkedin-mcp-test
linkedin-mcp-setup:
	cd mcp-server && npm install && if [ ! -f .env ]; then cp .env.example .env; fi

linkedin-mcp:
	cd mcp-server && npm run build && npm start

linkedin-mcp-test:
	cd mcp-server && npm test
