import time

from fastapi.testclient import TestClient
from mlflow import MlflowClient
import pytest

from app.main import create_app
from app.pipeline.mlflow_demo import EXPERIMENT, MODEL, run_evolution


@pytest.fixture
def workspace(tmp_path):
    uri = f"sqlite:///{tmp_path / 'tracking.db'}"
    tracker = MlflowClient(tracking_uri=uri)
    tracker.create_experiment(EXPERIMENT, artifact_location=(tmp_path / "artifacts").as_uri())
    decisions = run_evolution(uri, promote=True)
    app = create_app(tracking_uri=uri, data_dir=tmp_path / "dashboard", frontend_dir=tmp_path / "not-built")
    with TestClient(app, base_url="http://localhost") as client:
        headers = {"Authorization": f"Bearer {client.get('/api/session').json()['token']}"}
        yield client, headers, tracker, decisions


def test_operator_scope_parameters_and_source_evidence(workspace):
    client, headers, tracker, decisions = workspace
    assert client.get("/api/mlops").status_code == 401
    assert client.get("/api/mlops", headers=headers | {"Origin": "https://untrusted.example"}).status_code == 403
    assert client.get("/api/session", headers={"Host": "untrusted.example"}).status_code == 400
    response = client.get("/api/mlops", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["aliases"]["champion"] == str(decisions[-1]["model_version"])
    assert len(data["versions"]) == 2
    assert data["versions"][0]["run"]["metrics"] == tracker.get_run(decisions[0]["run_id"]).data.metrics
    detail = client.get(f"/api/runs/{decisions[0]['run_id']}", headers=headers).json()
    assert detail["artifacts"]["dataset_manifest.json"]["validation_sha256"] == decisions[0]["validation_digest"]
    other = tracker.create_experiment("Other workspace")
    foreign = tracker.create_run(other)
    assert client.get(f"/api/runs/{foreign.info.run_id}", headers=headers).status_code == 404
    assert client.get("/api/runs/not-a-run", headers=headers).status_code == 422
    for parameters in ({"n_estimators": 10000}, {"contamination": 0.99},
                       {"routine": "test"}, {"tracking_uri": "http://untrusted.example"}):
        assert client.post("/api/training-runs", headers=headers, json=parameters).status_code == 422
    replay = client.get("/api/workspace", headers=headers).json()
    for scenario, policy in (("concern", "create-incident"), ("away", "away-paused"),
                             ("resident_activity", "activity-conflict"), ("usual", "no-utility-concern")):
        replay = client.post("/api/demo", headers=headers, json={"action": "load", "scenario": scenario,
            "revision": replay["state"]["revision"]}).json()
        result = client.post("/api/demo", headers=headers, json={"action": "score", "revision": replay["state"]["revision"]})
        assert result.status_code == 200
        replay = result.json()
        evidence = replay["state"]["inference"]
        assert evidence["version"] == str(decisions[-1]["model_version"])
        assert evidence["policy_decision"] == policy
        assert bool(replay["state"]["incident"]) == (scenario == "concern")
        assert len(replay["state"]["inferences"]) == 1


def test_promotion_rechecks_quality_and_stale_state_and_audits_rollback(workspace):
    client, headers, tracker, decisions = workspace
    first, second = [d["model_version"] for d in decisions]
    assert client.post(f"/api/models/{first}/promote", headers=headers,
                       json={"expected_champion": str(second)}).status_code == 409
    assert tracker.get_registered_model(MODEL).aliases["champion"] == second
    assert client.post("/api/models/rollback", headers=headers,
                       json={"expected_champion": "999"}).status_code == 409
    assert client.post("/api/models/rollback", headers=headers,
                       json={"expected_champion": str(second)}).status_code == 200
    assert tracker.get_registered_model(MODEL).aliases["champion"] == first
    assert client.post(f"/api/models/{second}/promote", headers=headers,
                       json={"expected_champion": str(first)}).status_code == 200
    assert tracker.get_registered_model(MODEL).aliases["champion"] == second
    experiment = tracker.get_experiment_by_name(EXPERIMENT)
    audits = tracker.search_runs([experiment.experiment_id], "tags.event_type = 'promotion'")
    assert len(audits) == 1 and audits[0].info.status == "FINISHED"


def test_real_background_training_is_persisted_and_never_auto_promotes(workspace):
    client, headers, tracker, decisions = workspace
    champion = tracker.get_registered_model(MODEL).aliases["champion"]
    result = client.post("/api/training-runs", headers=headers,
                         json={"routine": "updated", "n_estimators": 20, "contamination": 0.02, "random_state": 7})
    assert result.status_code == 202
    job_id = result.json()["id"]
    assert client.post("/api/training-runs", headers=headers, json={}).status_code == 409
    for _ in range(100):
        data = client.get("/api/mlops", headers=headers).json()
        job = next(job for job in data["jobs"] if job["id"] == job_id)
        if job["status"] in ("completed", "failed"):
            break
        time.sleep(0.1)
    assert job["status"] == "completed", job
    trained = tracker.get_run(job["result"][0]["run_id"])
    assert trained.data.params["n_estimators"] == "20"
    assert trained.data.params["random_state"] == "7"
    assert trained.data.tags["dashboard_job_id"] == job_id
    assert trained.data.tags["parent_run_id"] == decisions[-1]["run_id"]
    assert tracker.get_registered_model(MODEL).aliases["champion"] == champion
