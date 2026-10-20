"""Same-origin local operator dashboard backed by FastAPI and MLflow."""

from contextlib import asynccontextmanager
import hmac
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
from typing import Annotated, Literal

os.environ.setdefault("MLFLOW_HTTP_REQUEST_TIMEOUT", "5")
os.environ.setdefault("MLFLOW_HTTP_REQUEST_MAX_RETRIES", "1")

import mlflow
import mlflow.sklearn
from mlflow import MlflowClient
from mlflow.exceptions import MlflowException
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app import jobs, workspace
from app.pipeline.mlflow_demo import EXPERIMENT, FEATURES, MODEL, promotion_allowed, rollback


ROOT = Path(__file__).resolve().parents[2]


class TrainingParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    routine: Literal["initial", "updated"] = "updated"
    n_estimators: int = Field(default=100, ge=10, le=500)
    contamination: float = Field(default=0.02, ge=0.001, le=0.2)
    random_state: int = Field(default=42, ge=0, le=2**31 - 1)


class ModelAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_champion: Annotated[str, Field(pattern=r"^[1-9][0-9]*$")] | None


class ReplayAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["load", "reset", "advance", "score", "family_ack"]
    revision: int = Field(ge=0)
    scenario: Literal["usual", "concern", "missing_water", "resident_activity", "away"] | None = None
    minutes: int = Field(default=5, ge=1, le=60)


class ResponseAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["accept", "complete"]
    revision: int = Field(ge=0)
    outcome: str = Field(default="", max_length=500)


def create_app(*, tracking_uri=None, data_dir=None, frontend_dir=None):
    uri = tracking_uri or os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5050")
    directory = Path(data_dir or os.environ.get("SIMEGUARDIAN_DATA_DIR", ROOT / "artifacts/dashboard"))
    client = MlflowClient(tracking_uri=uri)
    token = secrets.token_urlsafe(32)
    responder_token = secrets.token_urlsafe(32)
    processes = {}
    mutation_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app):
        jobs.initialize(directory)
        workspace.initialize(directory)
        jobs.reconcile(directory, processes)
        yield

    app = FastAPI(title="SimeGuardian model workspace", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.middleware("http")
    async def local_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in {"http://127.0.0.1:8000", "http://localhost:8000",
                                    "http://127.0.0.1:5173", "http://localhost:5173"}:
            return JSONResponse({"detail": "This local operator session does not allow that origin."}, status_code=403)
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    def operator(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))]):
        if credentials and hmac.compare_digest(credentials.credentials, responder_token):
            raise HTTPException(403, "The responder identity cannot access operator evidence.")
        if not credentials or not hmac.compare_digest(credentials.credentials, token):
            raise HTTPException(401, "Open a local operator session to continue.")

    def responder(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))]):
        if credentials and hmac.compare_digest(credentials.credentials, token):
            raise HTTPException(403, "Switch to the assigned demo responder identity first.")
        if not credentials or not hmac.compare_digest(credentials.credentials, responder_token):
            raise HTTPException(401, "Open a local responder session to continue.")

    @app.exception_handler(MlflowException)
    async def tracking_error(request, error):
        if error.error_code == "RESOURCE_DOES_NOT_EXIST":
            return JSONResponse({"detail": "The requested experiment, run or model was not found."}, status_code=404)
        return JSONResponse({"detail": "The tracking service could not complete the request. Check the local MLflow service and retry."}, status_code=503)

    @app.get("/api/session")
    def session(role: Literal["operator", "responder"] = "operator"):
        # shortcut: loopback-only demo operator, replace with account/role authentication before network deployment.
        return {"token": responder_token if role == "responder" else token,
                "operator": "responder-01" if role == "responder" else "Local operator",
                "role": role, "scope": "synthetic-demo"}

    def registry():
        try:
            return client.get_registered_model(MODEL)
        except MlflowException as error:
            if error.error_code != "RESOURCE_DOES_NOT_EXIST":
                raise
            return None

    def run_record(run):
        return {"id": run.info.run_id, "name": run.info.run_name,
                "status": run.info.status, "started_at": run.info.start_time,
                "finished_at": run.info.end_time, "parameters": run.data.params,
                "metrics": run.data.metrics, "tags": run.data.tags}

    def version_record(version, aliases):
        aliases = {name: str(number) for name, number in aliases.items()}
        number = str(version.version)
        run = client.get_run(version.run_id)
        current = aliases.get("champion")
        current_run = client.get_run(client.get_model_version(MODEL, current).run_id) if current else None
        comparable = not current_run or (run.data.tags.get("validation_digest") is not None and
            run.data.tags.get("validation_digest") == current_run.data.tags.get("validation_digest"))
        eligible = (run.info.status == "FINISHED" and comparable and
                    promotion_allowed(run.data.metrics, current_run.data.metrics if current_run else None))
        return {"version": number, "run": run_record(run),
                "aliases": [name for name, value in aliases.items() if value == number],
                "can_promote": eligible, "comparable": comparable,
                "gate_reason": "Quality checks passed" if eligible else
                    "Already champion" if current == number else
                    "Validation benchmarks differ" if not comparable else
                    "Requires recall ≥ 0.90, no recall/false-positive regression and higher F1"}

    @app.get("/api/mlops", dependencies=[Depends(operator)])
    def snapshot():
        jobs.reconcile(directory, processes)
        model = registry()
        aliases = {name: str(number) for name, number in model.aliases.items()} if model else {}
        experiment = client.get_experiment_by_name(EXPERIMENT)
        runs = client.search_runs([experiment.experiment_id], max_results=100,
            order_by=["attributes.start_time DESC"]) if experiment else []
        versions = client.search_model_versions(f"name='{MODEL}'", max_results=100) if model else []
        return {"model_name": MODEL, "aliases": aliases,
                "versions": [version_record(version, aliases) for version in sorted(versions, key=lambda v: int(v.version))],
                "runs": [run_record(run) for run in runs], "jobs": jobs.list_jobs(directory),
                "tracking_status": "connected", "scope": "synthetic-feature-window-validation",
                "history_limit": 100}

    @app.get("/api/runs/{run_id}", dependencies=[Depends(operator)])
    def run_detail(run_id: Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]):
        run = client.get_run(run_id)
        experiment = client.get_experiment_by_name(EXPERIMENT)
        if not experiment or run.info.experiment_id != experiment.experiment_id:
            raise HTTPException(404, "This run is outside the model workspace.")
        available = {entry.path for entry in client.list_artifacts(run_id)}
        artifacts = {}
        with tempfile.TemporaryDirectory() as destination:
            for name in ("dataset_manifest.json", "score_policy.json", "promotion_decision.json", "rollback.json"):
                if name in available:
                    path = Path(client.download_artifacts(run_id, name, destination))
                    if path.stat().st_size > 1_000_000:
                        raise HTTPException(422, "The run artifact exceeds the workspace size limit.")
                    artifacts[name] = json.loads(path.read_text())
        return run_record(run) | {"artifacts": artifacts}

    @app.post("/api/training-runs", status_code=202, dependencies=[Depends(operator)])
    def start_training(parameters: TrainingParameters):
        jobs.reconcile(directory, processes)
        try:
            return jobs.launch(directory, uri, parameters.model_dump(), processes)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        except OSError as error:
            raise HTTPException(503, "Could not start training. Retry after checking the local worker.") from error

    def check_current(action):
        model = registry()
        current = model.aliases.get("champion") if model else None
        current = str(current) if current is not None else None
        if current != action.expected_champion:
            raise HTTPException(409, "The champion changed. Refresh the workspace before trying again.")
        return model, current

    @app.post("/api/models/{version}/promote", dependencies=[Depends(operator)])
    def promote(version: Annotated[int, Field(ge=1)], action: ModelAction):
        # shortcut: one API worker serialises model actions, use a cross-process lock before scaling workers.
        with mutation_lock:
            model, current = check_current(action)
            if not model:
                raise HTTPException(404, "No registered model is available.")
            candidate = client.get_model_version(MODEL, str(version))
            evidence = version_record(candidate, model.aliases)
            if not evidence["can_promote"]:
                raise HTTPException(409, evidence["gate_reason"])
            # Resolve the numeric artifact through this server's configured tracking store.
            mlflow.set_tracking_uri(uri)
            loaded = mlflow.sklearn.load_model(f"models:/{MODEL}/{version}")
            if list(loaded.feature_names_in_) != FEATURES:
                raise HTTPException(409, "The candidate has an incompatible feature signature.")
            experiment = client.get_experiment_by_name(EXPERIMENT)
            audit = client.create_run(experiment.experiment_id,
                tags={"event_type": "promotion", "from_version": current or "none",
                      "to_version": str(version), "actor": "local-operator"}, run_name="operator-promotion")
            try:
                if current:
                    client.set_registered_model_alias(MODEL, "previous_champion", current)
                client.set_registered_model_alias(MODEL, "champion", str(version))
                client.set_terminated(audit.info.run_id, "FINISHED")
            except Exception:
                client.set_terminated(audit.info.run_id, "FAILED")
                raise
            return {"champion": str(version), "previous_champion": current}

    @app.post("/api/models/rollback", dependencies=[Depends(operator)])
    def restore_previous(action: ModelAction):
        with mutation_lock:
            model, current = check_current(action)
            if not model or not model.aliases.get("previous_champion"):
                raise HTTPException(409, "No previous champion is available for rollback.")
            previous = model.aliases["previous_champion"]
            mlflow.set_tracking_uri(uri)
            loaded = mlflow.sklearn.load_model(f"models:/{MODEL}/{previous}")
            if list(loaded.feature_names_in_) != FEATURES:
                raise HTTPException(409, "The previous model has an incompatible feature signature.")
            return rollback(uri)

    @app.get("/api/workspace", dependencies=[Depends(operator)])
    def main_workspace():
        return workspace.snapshot(directory)

    @app.get("/api/datasets/{identifier}", dependencies=[Depends(operator)])
    def dataset(identifier: str):
        detail = workspace.dataset_detail(identifier)
        if detail is None:
            raise HTTPException(404, "This dataset is not in the workspace.")
        return detail

    @app.get("/api/jobs/{job_id}", dependencies=[Depends(operator)])
    def job_detail(job_id: Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]):
        job = next((item for item in jobs.list_jobs(directory) if item["id"] == job_id), None)
        if not job:
            raise HTTPException(404, "Training job not found in the recent job history.")
        log = directory / f"{job_id}.log"
        with log.open("rb") if log.exists() else tempfile.TemporaryFile() as stream:
            stream.seek(0, 2)
            length = stream.tell()
            stream.seek(max(0, length - 20000))
            content = stream.read().decode("utf-8", errors="replace")
        return job | {"log": content, "log_truncated": length > 20000}

    @app.post("/api/demo", dependencies=[Depends(operator)])
    def replay(action: ReplayAction):
        parameters = {"scenario": action.scenario, "minutes": action.minutes}
        if action.action == "score":
            state = workspace.read(directory)
            values = workspace.SCENARIOS[state["scenario"]][1]
            coverage = workspace.SCENARIOS[state["scenario"]][2]
            evidence = {"at": workspace.now(state), "features": dict(zip(FEATURES, values)),
                "coverage": coverage, "score": None, "version": None, "run_id": None,
                "anomaly": None, "policy_decision": coverage, "policy_version": "replay-policy-v1"}
            if None not in values:
                import pandas as pd
                model = registry()
                current = str(model.aliases.get("champion", "")) if model else ""
                if not current:
                    raise HTTPException(409, "Select a registered champion before running inference.")
                mlflow.set_tracking_uri(uri)
                loaded = mlflow.sklearn.load_model(f"models:/{MODEL}/{current}")
                if list(loaded.feature_names_in_) != FEATURES:
                    raise HTTPException(409, "The champion feature signature does not match this replay.")
                frame = pd.DataFrame([values], columns=FEATURES)
                score = float(loaded.decision_function(frame)[0])
                anomaly = score < 0
                evidence.update({"score": score, "anomaly": anomaly, "version": current,
                    "run_id": client.get_model_version(MODEL, current).run_id,
                    "policy_decision": "create-incident" if coverage == "eligible" and anomaly else
                        "model-not-flagged" if coverage == "eligible" else coverage})
            parameters["inference"] = evidence
        try:
            workspace.mutate(directory, action.revision, action.action, **parameters)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return workspace.snapshot(directory)

    @app.get("/api/response", dependencies=[Depends(responder)])
    def assigned_tasks():
        return workspace.response_snapshot(directory)

    @app.post("/api/response/{incident_id}", dependencies=[Depends(responder)])
    def respond(incident_id: str, action: ResponseAction):
        tasks = workspace.response_snapshot(directory)["tasks"]
        if not any(task["id"] == incident_id for task in tasks):
            raise HTTPException(404, "No assigned check-in matches this identifier.")
        try:
            workspace.mutate(directory, action.revision, action.action, outcome=action.outcome, actor="responder-01")
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return workspace.response_snapshot(directory)

    @app.get("/api/{unmatched:path}", dependencies=[Depends(operator)])
    def unknown_api(unmatched):
        raise HTTPException(404, "Unknown API endpoint.")

    build = Path(frontend_dir or ROOT / "web/dist")
    if build.exists():
        app.frontend("/", directory=build)
    else:
        @app.get("/")
        def unbuilt():
            return JSONResponse({"detail": "Build the dashboard with npm run build in web/."}, status_code=503)
    return app


app = create_app()
