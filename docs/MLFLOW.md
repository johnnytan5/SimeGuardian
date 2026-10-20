# SimeGuardian — MLflow prototype

## What is implemented

MLflow is now the selected experiment tracker and model registry. A runnable local slice in [mlflow_demo.py](../backend/app/pipeline/mlflow_demo.py) performs two real Isolation Forest training rounds:

1. **Initial routine:** fit normal synthetic feature windows from training households on days 15–45.
2. **Normal-routine update:** retrain on those windows plus independently generated normal routine changes on days 46–60.

The main operator interface is now the [SimeGuardian dashboard](http://127.0.0.1:8000), built in React and served by [FastAPI](../backend/app/main.py). It reads MLflow through scoped backend endpoints and implements training controls, persisted job status, metrics/comparisons, run evidence, quality-gated promotion and rollback. There is no embedded external dashboard or iframe; the MLflow service remains an internal tracking dependency.

Both rounds use the same disjoint validation households on days 61–75, the same feature columns and hyperparameters, and the same fixed validation benchmark. The second run records its predecessor. No test partition is generated or used. Rerunning the command appends evidence rather than overwriting earlier runs.

The fixture generates a small set of feature windows directly. It does not implement the six-source ingestion, causal household-baseline pipeline, incident policy or iPhone delivery. Its deliberately balanced validation examples are a smoke benchmark; its **window-level metrics are not episode metrics or expected operating rates**. The full dataset/split and application acceptance remain in the [implementation plan](IMPLEMENTATION_PLAN.md).

## Run locally

Use Python 3.12 and [uv](https://docs.astral.sh/uv/). Dependencies, including MLflow 3.17.1, are recorded in [uv.lock](../backend/uv.lock).

From the repository root:

```bash
cd backend
uv sync --locked
mkdir -p ../artifacts/mlflow
export MLFLOW_DISABLE_TELEMETRY=true
uv run --locked mlflow server \
  --host 127.0.0.1 \
  --port 5050 \
  --backend-store-uri sqlite:///../artifacts/mlflow/tracking.db \
  --artifacts-destination ../artifacts/mlflow/artifacts \
  --serve-artifacts
```

The local UI is available at [localhost:5050](http://127.0.0.1:5050). Keep this development server on loopback. Its local operator UI is separate from participant access; a network deployment needs its own authenticated access controls.

Port 5050 is the internal tracking service. Use the main dashboard on port 8000 for normal operation. After building `web/` with `npm ci` and `npm run build`, start it from `backend/` with:

```bash
MLFLOW_DISABLE_TELEMETRY=true uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The dashboard's **Train new model** dialog selects initial/updated training data and bounded tree-count, contamination and seed values. The server launches a separate process, stores its state in `artifacts/dashboard/dashboard.db` and keeps the registry champion unchanged. Use the evidence panel and model registry for explicit promotion/rollback. A stale champion selection or failed quality gate is rejected by FastAPI even if a browser submits the action directly.

The local browser obtains an in-memory operator token from a same-origin session endpoint. Host/origin checks restrict the demo to loopback; production identities/roles, TLS and cross-process model-action coordination remain later work. Run a single API worker. Do not run concurrent CLI promotions alongside dashboard model actions.

In another terminal, from the repository root:

```bash
cd backend
export MLFLOW_DISABLE_TELEMETRY=true
uv run --locked python -m app.pipeline.mlflow_demo
```

This logs both training runs and registered versions, updates the `candidate` alias and leaves the `champion` alias unchanged. To explicitly permit quality-gated promotion while running the two rounds:

```bash
uv run --locked python -m app.pipeline.mlflow_demo --promote
```

The initial eligible model becomes champion. A later candidate replaces it only when its recall is at least 0.90, recall does not regress, false positives do not increase, and F1 strictly improves on the same validation fingerprint. These are smoke-demo promotion gates, not validated resident-service targets. A later version that fails stays recorded as a candidate; improvement is not guaranteed or fabricated.

To restore the last displaced champion, when both aliases exist:

```bash
uv run --locked python -m app.pipeline.mlflow_demo --rollback
```

Rollback creates a separate audit run. The prototype assumes one local operator; concurrent promotion/rollback and transactional application activation are future backend integration work.

To run checks:

```bash
uv run --locked pytest -q
```

Tests use an isolated temporary SQLite tracking store and artifact directory. They check household/time separation, reproducibility, regression rejection, actual training/logging/registration, model loading, lineage, explicit rollback and unchanged champion when promotion is not requested.

## Evidence visible in MLflow

Open **Experiments** in the main dashboard, select two runs and inspect their recorded evidence. The backend retains the following MLflow records:

| Evidence | Recorded values |
| --- | --- |
| Model/data evolution | Initial/update run names, change reason, predecessor run ID and model version |
| Reproducibility | Seed, training/validation SHA-256 checksums, source-code checksum and dependency versions |
| Dataset lineage | MLflow training/validation dataset inputs; separate household lists and day ranges in `dataset_manifest.json` |
| Experiment parameters | Estimator count, contamination cutoff, random state, training-window count |
| Measured validation results | Window precision/recall/F1, confusion counts and evaluated-window denominator |
| Scoring semantics | Model-only score policy and learned offset in `score_policy.json` |
| Model artifact | MLflow sklearn model with input example, signature and environment metadata |
| Promotion history | `promotion_decision.json`, eligible/promoted status, previous champion and comparison fingerprint |
| Active/candidate versions | `champion`, `candidate` and, after replacement, `previous_champion` registry aliases |
| Rollback history | Explicit `operator-rollback` run with source/destination versions |

Model versions show that training changed over time. A measured reduction in validation errors supports an improvement claim on this fixture only. Additional versions, drift or elapsed time alone do not prove better real-world performance. Isolation Forest retraining is batch training; this demo does not invent epochs or imply continuous self-learning.

## Recorded local comparison — 18 October 2026

The first HTTP tracking-server run produced the following measured results on the same 360 validation windows: 120 synthetic concern windows and 240 benign windows. No test data was used.

| Evidence | Initial version 1 | Retrained version 2 |
| --- | --- | --- |
| Normal training windows | 496 | 736 |
| Validation false positives | 49 | 4 |
| Validation false negatives | 0 | 0 |
| Window precision | 0.7101 | 0.9677 |
| Window recall | 1.0000 | 1.0000 |
| Window F1 | 0.8304 | 0.9836 |
| Promotion outcome | Initial champion | Passed gate; replaced version 1 |

The run IDs are `f50493461f6e436e99852a2445f789d6` and `7ee130276de143ca9301810f5ee3393f`; both record validation checksum `4ac98c377299905e3cdc796fb01cf6f414bfed78ea4efbdd0e4b63d384384c79`. Inspect them in the [local experiment UI](http://127.0.0.1:5050/#/experiments/1) while the server is running. Generated tracking data remains local and ignored by Git; the code and lockfile reproduce the fixture and metrics, while new executions receive new run IDs/model versions.

These are balanced synthetic window-level validation results. They do not establish episode-level operating performance, health detection accuracy or an untouched-test result.

## Integration into the web application

The full stack adds one MLflow tracking service to the planned Compose setup. Use a dedicated MLflow database and database user in the existing PostgreSQL instance, plus a persistent MLflow-managed artifact volume. The local smoke uses SQLite so it can run without Docker/PostgreSQL; SQL-backed tracking supports the registry in either case. MLflow owns its schema and migrations; application Alembic migrations do not touch MLflow tables.

- **MLflow owns:** experiments, runs, parameters/metrics, input lineage, registered model versions and training/report artifacts.
- **Application PostgreSQL owns:** jobs, consent, incidents, notifications, live metrics, activation audit/history and the active serving configuration. Its job/model references store MLflow experiment/run IDs, registered name/version, model URI and validation-report fingerprint.
- **Python training process:** logs real train/validation results explicitly using the MLflow SDK. Isolation Forest needs the domain episode/policy evaluator from Phase 3; automatic estimator logging alone cannot provide those metrics.
- **FastAPI:** serves the React dashboard and queries MLflow through its API. Its local operator endpoints expose bounded model/run evidence and model actions; browser and iPhone clients receive no MLflow credentials or database access. The required controls live inside SimeGuardian, with no navigation to the separate MLflow UI.
- **Model activation:** validate and download a numeric registered version, check signature/features/policy compatibility, then atomically switch the application serving reference. Keep the loaded last-known-good model if MLflow is unavailable; do not mark a failed activation successful.
- **Aliases:** show `candidate`/`champion` as convenient pointers, while every inference and incident records a resolved numeric version. Mirror the application activation decision to MLflow with retry/reconciliation; these two systems do not share a distributed transaction.
- **Review/retrain:** an operator investigates drift or reviewed outcomes, starts another real training run and compares candidates on an unchanged validation benchmark. Retraining does not auto-promote. Freeze the final selection before untouched-test evaluation; repeated development comparisons use validation only.

The local dashboard/registry integration is implemented. The [main dashboard](DASHBOARD.md) also resolves the numeric champion for explicit replay inference and records the model score, policy and simulated incident/response trace. Its SQLite stores, local identity selector and explicit simulation clock are prototype limits; PostgreSQL deployment, production identities, full source/episode policies and production serving activation remain unchecked work in the full plan. Back up tracking metadata, artifacts and the local job/replay stores; deleting one loses the associated evidence/state.

## Official references

- [MLflow tracking server](https://mlflow.org/docs/latest/self-hosting/architecture/tracking-server/): HTTP tracking, SQL backend and proxied artifacts.
- [Model registry workflow](https://mlflow.org/docs/latest/ml/model-registry/workflow/): versioned models and mutable aliases.
- [scikit-learn integration](https://mlflow.org/docs/latest/api_reference/python_api/mlflow.sklearn.html): model logging, signatures and loading.
