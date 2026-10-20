.PHONY: dev dev-frontend dev-backend

dev:
	$(MAKE) -j2 dev-frontend dev-backend

dev-frontend:
	cd web && npm run dev

dev-backend:
	cd backend && MLFLOW_DISABLE_TELEMETRY=true uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
