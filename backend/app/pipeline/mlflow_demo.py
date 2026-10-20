"""Two real training rounds on a small synthetic feature fixture, with no test-set use."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
import sklearn
from mlflow import MlflowClient
from mlflow.models import infer_signature
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score


FEATURES = [
    "electricity_ratio", "water_ratio", "gate_frequency_ratio", "resident_interactions"
]
EXPERIMENT = "SimeGuardian-Synthetic-Evolution"
MODEL = "SimeGuardian-Anomaly-Demo"


def checksum(frame):
    return hashlib.sha256(frame.to_csv(index=False, float_format="%.12g").encode()).hexdigest()


def fixture():
    # shortcut: synthetic feature windows, replace with the six-source causal pipeline before app integration.
    rng = np.random.default_rng(42)

    def windows(group, households, days, routine):
        identities = [(f"{group}-{h:02}", day) for h in range(households) for day in days]
        count = len(identities)
        utility_mean = {"usual": 1.0, "changed": 0.35, "concern": 0.04}[routine]
        utilities = rng.lognormal(np.log(utility_mean), 0.2, (count, 2))
        movement = rng.lognormal(0, 0.2, count) if routine != "concern" else np.zeros(count)
        interactions = rng.poisson(2, count) if routine != "concern" else np.zeros(count)
        frame = pd.DataFrame(np.column_stack([utilities, movement, interactions]), columns=FEATURES)
        frame["household_id"] = [identity for identity, _ in identities]
        frame["day"] = [day for _, day in identities]
        frame["concern"] = int(routine == "concern")
        return frame

    initial = windows("train", 16, range(15, 46), "usual")
    recent = windows("train", 16, range(46, 61), "changed")
    validation = pd.concat([
        windows("validation", 8, range(61, 76), routine)
        for routine in ("usual", "changed", "concern")
    ], ignore_index=True)
    return initial, pd.concat([initial, recent], ignore_index=True), validation


def window_metrics(expected, predicted):
    tn, fp, fn, tp = confusion_matrix(expected, predicted, labels=[0, 1]).ravel()
    return {
        "validation_window_precision": float(precision_score(expected, predicted, zero_division=0)),
        "validation_window_recall": float(recall_score(expected, predicted, zero_division=0)),
        "validation_window_f1": float(f1_score(expected, predicted, zero_division=0)),
        "validation_true_positives": int(tp), "validation_false_positives": int(fp),
        "validation_true_negatives": int(tn), "validation_false_negatives": int(fn),
        "validation_windows": len(expected),
    }


def promotion_allowed(candidate, current=None):
    keys = ("validation_window_recall", "validation_false_positives", "validation_window_f1")
    for record in (candidate, current):
        if record is not None and (not all(key in record and math.isfinite(record[key]) for key in keys)
                or not 0 <= record["validation_window_recall"] <= 1
                or not 0 <= record["validation_window_f1"] <= 1
                or record["validation_false_positives"] < 0):
            return False
    if candidate["validation_window_recall"] < 0.9:
        return False
    if current is None:
        return True
    return (
        candidate["validation_window_recall"] >= current["validation_window_recall"]
        and candidate["validation_false_positives"] <= current["validation_false_positives"]
        and candidate["validation_window_f1"] > current["validation_window_f1"]
    )


def run_evolution(tracking_uri, *, promote=False, routine=None, n_estimators=100,
                  contamination=0.02, random_state=42, job_id=None):
    if routine not in (None, "initial", "updated"):
        raise ValueError("Choose initial or updated routine data.")
    if not 10 <= n_estimators <= 500 or not 0.001 <= contamination <= 0.2 or not 0 <= random_state <= 2**31 - 1:
        raise ValueError("Training parameters are outside the supported prototype bounds.")
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(EXPERIMENT)
    client = MlflowClient()
    initial, updated, validation = fixture()
    validation_digest = checksum(validation)
    parent_run_id = None
    try:
        champion = client.get_registered_model(MODEL).aliases.get("champion")
        if champion:
            parent_run_id = client.get_model_version(MODEL, champion).run_id
    except mlflow.MlflowException as error:
        if error.error_code != "RESOURCE_DOES_NOT_EXIST":
            raise
    results = []
    for name, training in (("initial-routine", initial), ("normal-routine-update", updated)):
        if routine == "initial" and name != "initial-routine" or routine == "updated" and name != "normal-routine-update":
            continue
        with mlflow.start_run(run_name=name) as run:
            mlflow.set_tags({
                "data_scope": "synthetic-feature-smoke-fixture",
                "feature_version": "smoke-features-v1",
                "validation_digest": validation_digest,
                "test_status": "not-generated-or-used",
                "change_reason": name,
                "parent_run_id": parent_run_id or "none",
                "code_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "dashboard_job_id": job_id or "cli",
            })
            x_train = training[FEATURES]
            x_validation = validation[FEATURES]
            mlflow.log_input(mlflow.data.from_pandas(x_train, name=name), context="training")
            mlflow.log_input(mlflow.data.from_pandas(
                validation[FEATURES + ["concern"]], targets="concern", name="fixed-smoke-validation-v1"
            ), context="validation")
            mlflow.log_dict({
                "training_sha256": checksum(training), "validation_sha256": validation_digest,
                "training_households": sorted(training.household_id.unique()),
                "validation_households": sorted(validation.household_id.unique()),
                "training_days": [int(training.day.min()), int(training.day.max())],
                "validation_days": [61, 75], "seed": 42, "features": FEATURES,
                "scope": "balanced window benchmark; not episode metrics or expected operating prevalence",
            }, "dataset_manifest.json")
            parameters = {"n_estimators": n_estimators, "contamination": contamination,
                          "random_state": random_state, "n_jobs": 1}
            mlflow.log_params(parameters | {"training_windows": len(training)})
            model = IsolationForest(**parameters).fit(x_train)
            predicted = model.predict(x_validation) == -1
            metrics = window_metrics(validation.concern, predicted)
            mlflow.log_metrics(metrics)
            mlflow.log_dict({"predicted_concern": predicted.astype(int).tolist()}, "validation_predictions.json")
            mlflow.log_dict({
                "scope": "model-only smoke benchmark; application incident policy remains separate",
                "score_method": "decision_function", "anomaly_when_below": 0.0,
                "learned_score_offset": float(model.offset_),
            }, "score_policy.json")
            logged = mlflow.sklearn.log_model(
                model, name="model", input_example=x_train.head(2),
                signature=infer_signature(x_train, model.predict(x_train)),
                # These trees were fitted here; never accept an uploaded model's suggested trust list.
                skops_trusted_types=["sklearn.tree._tree.Tree"],
                pip_requirements=[
                    f"scikit-learn=={sklearn.__version__}", f"numpy=={np.__version__}",
                    f"pandas=={pd.__version__}",
                ],
            )
            version = mlflow.register_model(logged.model_uri, MODEL)
            client.set_model_version_tag(MODEL, version.version, "validation_digest", validation_digest)
            client.set_model_version_tag(MODEL, version.version, "data_scope", "synthetic-smoke")
            client.set_registered_model_alias(MODEL, "candidate", version.version)
            aliases = client.get_registered_model(MODEL).aliases
            current_version = aliases.get("champion")
            current_metrics = None
            comparable = True
            if current_version:
                current = client.get_model_version(MODEL, current_version)
                comparable = current.tags.get("validation_digest") == validation_digest
                current_metrics = client.get_run(current.run_id).data.metrics
            eligible = comparable and promotion_allowed(metrics, current_metrics)
            promoted = promote and eligible
            if promoted:
                # shortcut: one local operator, serialise promotions in the API before multi-user activation.
                if current_version:
                    client.set_registered_model_alias(MODEL, "previous_champion", current_version)
                client.set_registered_model_alias(MODEL, "champion", version.version)
            decision = {
                "run_id": run.info.run_id, "model_version": version.version,
                "previous_champion": current_version, "eligible": eligible,
                "promoted": promoted, "operator_requested_promotion": promote,
                "validation_digest": validation_digest,
                "reason": "quality-gate-pass" if eligible else "quality-gate-failed-or-benchmark-mismatch",
            }
            mlflow.log_dict(decision, "promotion_decision.json")
            mlflow.set_tag("promotion_decision", "promoted" if promoted else "retained-as-candidate")
            results.append(decision | {"metrics": metrics})
            parent_run_id = run.info.run_id
    return results


def rollback(tracking_uri):
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(EXPERIMENT)
    client = MlflowClient()
    aliases = client.get_registered_model(MODEL).aliases
    current, previous = aliases.get("champion"), aliases.get("previous_champion")
    if not current or not previous:
        raise ValueError("Rollback requires champion and previous_champion versions.")
    with mlflow.start_run(run_name="operator-rollback"):
        mlflow.set_tag("event_type", "rollback")
        mlflow.log_dict({"from_version": current, "to_version": previous}, "rollback.json")
        client.set_registered_model_alias(MODEL, "champion", previous)
        client.set_registered_model_alias(MODEL, "previous_champion", current)
    return {"from_version": current, "to_version": previous}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracking-uri", default="http://127.0.0.1:5050")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--promote", action="store_true", help="Allow quality-gated alias changes")
    action.add_argument("--rollback", action="store_true", help="Restore the previous champion")
    args = parser.parse_args()
    result = rollback(args.tracking_uri) if args.rollback else run_evolution(
        args.tracking_uri, promote=args.promote
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
