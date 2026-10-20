import json
from pathlib import Path

import mlflow
import mlflow.sklearn
from mlflow import MlflowClient

from app.pipeline.mlflow_demo import (
    EXPERIMENT, FEATURES, MODEL, checksum, fixture, promotion_allowed, rollback, run_evolution,
)


def test_fixture_is_reproducible_and_separates_households_and_time():
    initial, updated, validation = fixture()
    assert checksum(validation) == checksum(fixture()[2])
    assert not set(updated.household_id) & set(validation.household_id)
    assert initial.day.max() < 46 <= updated.day.max() < validation.day.min()
    assert (updated.concern == 0).all()
    assert set(FEATURES).isdisjoint({"concern", "household_id", "day"})


def test_promotion_rejects_regression_and_accepts_measured_improvement():
    current = {"validation_window_recall": 1, "validation_false_positives": 10,
               "validation_window_f1": 0.9}
    assert promotion_allowed(current)
    assert not promotion_allowed(current, current)
    assert not promotion_allowed(current | {"validation_window_recall": 0.8}, current)
    assert not promotion_allowed(current | {"validation_false_positives": 11}, current)
    assert promotion_allowed(current | {"validation_false_positives": 5, "validation_window_f1": 0.95}, current)
    assert not promotion_allowed(current | {"validation_window_f1": float("nan")}, current)
    assert not promotion_allowed({})


def test_actual_runs_registry_roundtrip_and_explicit_rollback(tmp_path):
    uri = f"sqlite:///{tmp_path / 'tracking.db'}"
    mlflow.set_tracking_uri(uri)
    client = MlflowClient()
    client.create_experiment(EXPERIMENT, artifact_location=(tmp_path / "artifacts").as_uri())
    decisions = run_evolution(uri, promote=True)
    assert len(decisions) == 2
    assert len(client.search_model_versions(f"name='{MODEL}'")) == 2
    for decision in decisions:
        run = client.get_run(decision["run_id"])
        assert run.info.status == "FINISHED"
        assert run.data.tags["test_status"] == "not-generated-or-used"
        assert run.data.metrics["validation_windows"] == len(fixture()[2])
        loaded = mlflow.sklearn.load_model(f"models:/{MODEL}/{decision['model_version']}")
        saved = json.loads(Path(client.download_artifacts(
            decision["run_id"], "validation_predictions.json"
        )).read_text())
        assert ((loaded.predict(fixture()[2][FEATURES]) == -1).astype(int).tolist()
                == saved["predicted_concern"])
    assert decisions[0]["validation_digest"] == decisions[1]["validation_digest"]
    assert client.get_run(decisions[1]["run_id"]).data.tags["parent_run_id"] == decisions[0]["run_id"]
    aliases = client.get_registered_model(MODEL).aliases
    expected = [d["model_version"] for d in decisions if d["promoted"]][-1]
    assert aliases["champion"] == expected
    # Exercise rollback independently of whether this fixed fixture improves enough to promote twice.
    client.set_registered_model_alias(MODEL, "previous_champion", decisions[0]["model_version"])
    client.set_registered_model_alias(MODEL, "champion", decisions[1]["model_version"])
    assert rollback(uri)["to_version"] == decisions[0]["model_version"]
    assert client.get_registered_model(MODEL).aliases["champion"] == decisions[0]["model_version"]
    before = client.get_registered_model(MODEL).aliases["champion"]
    run_evolution(uri)
    assert client.get_registered_model(MODEL).aliases["champion"] == before
