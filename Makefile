.PHONY: dev dev-frontend dev-backend dev-mlflow

dev:
	$(MAKE) -j3 dev-frontend dev-backend dev-mlflow

dev-frontend:
	cd web && npm run dev

dev-backend:
	cd backend && MLFLOW_DISABLE_TELEMETRY=true uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-mlflow:
	mkdir -p artifacts/mlflow
	cd backend && MLFLOW_DISABLE_TELEMETRY=true uv run --locked mlflow server \
		--host 127.0.0.1 --port 5050 \
		--backend-store-uri sqlite:///../artifacts/mlflow/tracking.db \
		--artifacts-destination ../artifacts/mlflow/artifacts --serve-artifacts
