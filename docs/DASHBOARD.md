# Main web dashboard

19 October 2026 · Local UI prototype

The main UI runs at [localhost:8000](http://127.0.0.1:8000). Follow the [README setup](../README.md#run-the-main-dashboard). React, TypeScript, Vite, React Router and shared CSS build the frontend; FastAPI serves the app and its API. MLflow provides real experiment and registry evidence inside the same UI.

The sidebar uses the original [Sime Darby Property logo](https://www.simedarbyproperty.com/home/images/sdp-logo-coloured.png?v2) and the browser tab uses its [official favicon](https://www.simedarbyproperty.com/home/favicon.png?v3), downloaded from the [official website](https://www.simedarbyproperty.com/home/). Both are served locally from `web/public/brand/` with their colours and aspect ratios preserved. SimeGuardian remains the product name.

## Views

| Route | Implemented behaviour |
| --- | --- |
| `/` | Household search, replay incident summary, source availability, real registered champion and links into the workflow |
| `/pipeline` | Township totals over 24 hours / 7 days / 30 days, household usage heatmap, selectable household routines, animated six-source daily detail, anomaly detection walkthrough, pause/resume, current replay model inputs, source timestamps, coverage rules and replay stages |
| `/datasets` | Two explicit datasets, seed, checksums, household counts and training/test scope |
| `/datasets/:id` | Manifest, split membership, filtered distributions, household/source records, annotations and pagination; filters persist in the URL |
| `/training` | Real background training controls, persisted jobs, version comparison and worker logs |
| `/training/:runId` | Deep-linked MLflow run evidence, parameters, artifacts and predecessor/code/data lineage |
| `/training/jobs/:jobId` | Deep-linked local training log, bounded to the last 20 kB |
| `/evaluation` | Recorded model-only validation metrics, confusion counts, same-benchmark comparison and test-set status |
| `/models` | Numeric MLflow versions/aliases, quality/compatibility checks, explicit promotion, rollback and audit history |
| `/inference` | Explicit scoring by the numeric champion, feature inputs, model score, policy decision and incident queue |
| `/incidents/:id` | Persisted incident timeline, simulated family/resident/township notification creation, receipt uncertainty and responsibility |
| `/operations` | Simulated feed-check ages, activity timestamps, local job failures, volumes and an honest insufficient-data drift state |
| `/demo` | Named scenarios, server-persisted clock, explicit inference/time advancement and confirmed replay reset |
| `/response` | Separate responder session, assigned tasks only, acceptance and completed human outcome |

## Demonstrate the journey

1. Open **Demo controls**, choose **Quiet household**, and click **Load scenario**.
2. Click **Run registered model**. The backend loads the registered numeric champion, scores the four-feature window and applies the replay policy. A model anomaly with corroborating utilities creates one incident and a simulated family notification.
3. Open the trace. Advance **+5 minutes** for the resident stage, then another **+5 minutes** for township assignment. Deadlines come from persisted family notification creation time. Page refresh does not restart them.
4. Click **Switch to responder**. This requests a separate local bearer session. The server denies operator evidence to this session and returns only assigned check-ins.
5. **Accept responsibility**, then **Record completed check-in** with an outcome. Acceptance keeps the incident open; the completed outcome resolves it.
6. Return to the operator to inspect the shared result. Resetting this replay preserves all dataset and MLflow evidence and appends a local reset audit record.

Other scenarios demonstrate missing water, resident activity, away status and usual activity. Missing water is represented as missing, skips model scoring and blocks incident creation. Resident activity and away status block new inactivity incidents even if the model scores the window as anomalous.

## Evidence and boundaries

The model fixture is deterministic: seed 42, 496 initial training windows, 736 updated training windows (including initial), and 360 fixed validation windows. Training and validation households and days differ. Labels are excluded from model inputs. The final test set has not been generated or used. Training is real batch retraining; recorded versions alone do not prove better field performance.

The source explorer independently generates 4,704 records for 24 synthetic households across six source groups. It is UI development evidence, not a causal input pipeline for the trained model. Parking/gate records from the same synthetic trip retain a shared evidence group and shared attribution.

The pipeline simulation covers all 24 source-fixture household IDs, with deterministic early, daytime, evening and split routines. Each home has its own timing, consumption level, daily variation and weekend timing; these are illustrative profiles, not inferred resident attributes. Township totals are available for 24 hours (hourly bins), 7 days (six-hour bins) and 30 days (daily bins), summing each home's simulated hourly amounts. Only one signal is aggregated at a time, preserving its native unit. The average per home covers that same period.

The household heatmap compares each bin with that home's average bin value within the selected window. Colour represents usage, not risk or a learned normal range. Searching filters heatmap rows only; township totals continue to include all homes. Selecting a row or using the household selector updates the six-source 24-hour detail. Each detail curve is scaled to its own peak for that household/window; cards and tooltips retain native hourly values. Parking/gate share trip activity and must not be counted as independent evidence.

One second advances 15 simulated minutes. Pause freezes both views, reduced-motion preferences start them paused, and a refresh restarts the illustration. It does not advance replay time, change datasets, run inference or create incidents. The four current model inputs remain explicitly tied to SG-001's separate replay, regardless of the household selected in the illustration.

**Run anomaly demo** starts a nine-second walkthrough for the selected household: normal routine, a utility drop, a cross-check of supporting signals, and an illustrative detected concern. It selects the 24-hour electricity view, reduces both utilities to 4% of their generated normal values in a recent window, and suppresses movement/app events there. The expected-versus-observed chart, six-source detail and township totals share those altered readings. The demonstration rule requires both utilities below 20% of their usual values and no conflicting activity; the affected home and time cells are then marked in coral. This is not registered-model inference, a health-risk score, or a real incident/notification.

Pause/continue freezes the walkthrough and simulation together. Replay restarts it; Clear demo, changing households or leaving the page removes the local demonstration. Reduced-motion preferences disable the scan, pulse and curve transitions while retaining the explicitly started step-by-step walkthrough. The registered-model demo link opens the existing replay controls for a separately recorded inference.

Replay state and reset audit records persist in `artifacts/dashboard/workspace.db`. Local jobs use `dashboard.db`; MLflow owns its separate tracking store and artifacts. Keep all of these when preserving a demonstration. Reset changes only the current replay. Completed incident history across replay resets is not a production incident archive.

Notification creation and escalation are **simulated**. No phone notification delivery, receipt, worker heartbeat or latency is invented. Explicit clock advancement drives replay deadlines; a production scheduler, device transport and retries are pending. Incident creation records its model version; registry changes affect later explicit scoring.

Production accounts/consent, PostgreSQL incident constraints, full six-source feature construction, episode-level rule/model/combined evaluation, validation threshold experiments, iOS delivery, sustained AI recovery, handoffs/cancellation, help requests and withdrawal are not complete. Local role switching is intentionally available to anyone with loopback access. Keep the service bound to loopback. The full [implementation plan](IMPLEMENTATION_PLAN.md) remains the integration checklist.

## Verification

`uv run --locked pytest -q` in `backend/` covers reproducibility, real MLflow runs and model actions, training jobs, replay deadline boundaries/restart/stale updates, responsibility, reset preservation, deterministic source records, role scope and missing utilities.

`npm run build` and `npm run test:e2e` in `web/` check TypeScript/build, actual Chrome browser workflows, stable routes, dataset filters, UI training/registry actions, incident/responder flow, failure recovery and mobile width. Browser tests operate on the local synthetic stores and append real tracking/audit evidence.
