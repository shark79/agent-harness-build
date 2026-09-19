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
