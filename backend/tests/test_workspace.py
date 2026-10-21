import json
import math

import pytest
from fastapi.testclient import TestClient

from app import workspace
from app.main import create_app


def scored():
    return {"policy_decision": "create-incident", "score": -0.2, "version": "2"}


def test_persisted_clock_boundaries_ownership_and_reset(tmp_path):
    workspace.initialize(tmp_path)
    state = workspace.read(tmp_path)
    state = workspace.mutate(tmp_path, state["revision"], "load", scenario="concern")
    state = workspace.mutate(tmp_path, state["revision"], "score", inference=scored())
    state = workspace.mutate(tmp_path, state["revision"], "score", inference=scored() | {"version": "3"})
    assert len(state["inferences"]) == 2
    assert state["incident"]["inference"]["version"] == "2"
    assert state["inference"]["version"] == "3"
    created = state["incident"]["created_at"]
    state = workspace.mutate(tmp_path, state["revision"], "advance", minutes=4)
    assert len(state["incident"]["notifications"]) == 1
    state = workspace.mutate(tmp_path, state["revision"], "advance", minutes=1)
    assert [item["stage"] for item in state["incident"]["notifications"]] == ["family", "resident"]
    workspace.initialize(tmp_path)
    assert workspace.read(tmp_path)["incident"]["created_at"] == created
    state = workspace.mutate(tmp_path, state["revision"], "advance", minutes=5)
    assert len(state["incident"]["notifications"]) == 3
    assert state["incident"]["notifications"][-1]["created_at"] == created + 600_000
    with pytest.raises(ValueError, match="changed"):
        workspace.mutate(tmp_path, 0, "reset")
    state = workspace.mutate(tmp_path, state["revision"], "accept", actor="responder-01")
    with pytest.raises(ValueError, match="Township"):
        workspace.mutate(tmp_path, state["revision"], "family_ack")
    state = workspace.mutate(tmp_path, state["revision"], "complete", actor="responder-01", outcome="Contact completed; family following up.")
    assert state["incident"]["status"] == "resolved"
    before = workspace.dataset_detail("smoke-features-v1")["checksum"]
    state = workspace.mutate(tmp_path, state["revision"], "reset")
    assert state["incident"] is None and state["minutes"] == 0
    assert workspace.dataset_detail("smoke-features-v1")["checksum"] == before
    with workspace.connect(tmp_path) as db:
        assert any(json.loads(row[0])["action"] == "reset" for row in db.execute("SELECT event FROM audit"))


def test_family_ack_keeps_incident_open_and_stops_unsent_stages(tmp_path):
    workspace.initialize(tmp_path)
    state = workspace.read(tmp_path)
    state = workspace.mutate(tmp_path, state["revision"], "score", inference=scored())
    state = workspace.mutate(tmp_path, state["revision"], "family_ack")
    state = workspace.mutate(tmp_path, state["revision"], "advance", minutes=10)
    assert state["incident"]["status"] == "open"
    assert state["incident"]["owner"] == "family"
    assert len(state["incident"]["notifications"]) == 1
    assert workspace.response_snapshot(tmp_path)["tasks"] == []


def test_source_fixture_is_deterministic_and_preserves_sparse_attribution():
    records = workspace.raw_fixture()
    assert len(records) == 23520
    assert {record["household"] for record in records} == {f"SG-{i:03}" for i in range(1, 121)}
    dataset = workspace.dataset_detail("township-ui-v1")
    assert len(dataset["households"]) == dataset["splits"][0]["households"] == 120
    assert {record["source"] for record in records} == set(workspace.SOURCES)
    assert all(math.isfinite(record["value"]) and record["unit"] == workspace.SOURCES[record["source"]][1] for record in records)
    assert workspace.manifest(records) == workspace.manifest(workspace.raw_fixture())
    movement = [record for record in records if record["household"] == "SG-001" and record["source"] in {"gate", "parking"}]
    assert len({record["group"] for record in movement}) == 1
    assert all("shared" in record["attribution"] for record in movement)


def test_responder_scope_and_missing_utility_block_without_tracking_service(tmp_path):
    app = create_app(tracking_uri=f"sqlite:///{tmp_path / 'tracking.db'}", data_dir=tmp_path / "data", frontend_dir=tmp_path / "missing")
    with TestClient(app, base_url="http://localhost") as client:
        operator = {"Authorization": f"Bearer {client.get('/api/session').json()['token']}"}
        responder = {"Authorization": f"Bearer {client.get('/api/session?role=responder').json()['token']}"}
        for path in ("/api/workspace", "/api/mlops", "/api/datasets/smoke-features-v1", "/api/jobs/"+"a"*32):
            assert client.get(path, headers=responder).status_code == 403
        assert client.get("/api/response", headers=operator).status_code == 403
        assert client.get("/api/response", headers=responder).json()["tasks"] == []
        initial = client.get("/api/workspace", headers=operator).json()
        loaded = client.post("/api/demo", headers=operator, json={"action":"load", "scenario":"missing_water", "revision":initial["state"]["revision"]}).json()
        scored = client.post("/api/demo", headers=operator, json={"action":"score", "revision":loaded["state"]["revision"]}).json()
        assert scored["state"]["inference"]["score"] is None
        assert scored["state"]["inference"]["policy_decision"] == "coverage-blocked"
        assert scored["state"]["incident"] is None
        assert next(source for source in scored["sources"] if source["id"] == "water")["status"] == "delayed"
        assert client.get("/api/datasets/unknown", headers=operator).status_code == 404
        assert client.post("/api/demo", headers=operator, json={"action":"advance", "revision":0, "minutes":999}).status_code == 422
