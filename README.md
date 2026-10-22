# SimeGuardian

An opt-in wellbeing check for Sime Darby Property township residents who are often home alone. Township signals (car plate recognition, access cards, SDP app activity, a water flow sensor in the pilot) tell the system whether a resident is home and recently active. If an unexplained silence goes on too long, it escalates step by step: an in-app check-in to the resident, then the family contact after five unanswered minutes, then a township welfare check after another five.

Built for the Sime Darby Property University Hackathon 2026 (Township of Tomorrow).

## Run the demo

You need Node 24 on the Mac and the **Expo Go** app on an iPhone. The Mac and the phone must be on the same Wi-Fi network, or the Mac can join the phone's hotspot.

1. **Server and dashboard**
   ```bash
   cd server
   npm start
   ```
   Open <http://localhost:4000>. Tabs: Demo control, Security console, Model. All resident and family screens are in the Expo app.

2. **Resident app (Madam Lee)**
   ```bash
   cd app
   npm install
   npx expo start
   ```
   Scan the QR code with the iPhone Camera, and it opens in Expo Go. On the Mac, open **iPhone Mirroring** so the phone shows next to the dashboard (QuickTime → New Movie Recording → iPhone over USB is the backup).

3. **If the phone shows "Can't reach SimeGuardian server"**, start Expo with the Mac's IP set explicitly:
   ```bash
   EXPO_PUBLIC_SERVER_URL=http://<mac-ip>:4000 npx expo start
   ```
   At a venue whose Wi-Fi isolates devices, use the phone's hotspot, or `npx expo start --tunnel` together with the URL override.

### Scenario A: escalation
1. On the phone, pick **Madam Lee (resident)**, go through onboarding and tap **I agree**.
2. Let the dashboard run for a moment, then click **Madam Lee goes quiet**.
3. The phone shows a notification, then the "Are you OK?" pop-up with a countdown.
4. Don't tap anything. After 10 s, Daniel is notified. Tap **Demo · switch to Daniel (family)** at the bottom of the phone to see his alert, with **Call Mum** and **Mark safe**.
5. After another 10 s, a welfare check appears on the Security console. Click through **Assign guard → Mark on the way → Mark arrived**.
6. The phone shows "All clear". The event log reads like real time (+5 min, +5 min, +2, +3, +3).

### Scenario B: happy path
Click **Reset demo** and switch the phone back to Madam Lee. It returns to onboarding. Repeat steps 1–3, then tap **I'm OK** on the phone, and every screen closes the alert.

The escalation step (default 10 s) and the clock speed can be changed on the Demo control tab.

### What is simulated
Activity signals, the guard, and the family phone call are simulated. Nothing connects to real plate recognition, access cards, Air Selangor or TNB yet. The live demo clock runs the rule engine. Previous local ML results have been removed; the legacy **Model** tab has no training result until a new demo run is explicitly created.

## Current experiment: precision optimisation (v6)

The [precision study](ml/household/PRECISION_REVIEW.md) reaches pooled reviewed-interval precision of **91.0% for utility anomalies and 87.1% for emergencies**, using new reserved simulation replays. Recall is 61.0% and 22.1%; grouped-alert precision remains 75.0% and 71.4%. The simulator is unchanged, the four separate source LSTMs are reused, and only detector training/features/calibration change. Family confirmations remain labels only.

```sh
python3 ml/household/precision_study.py prepare
python3 ml/household/precision_study.py run --device mps
python3 ml/household/verify_precision.py
python3 -m unittest discover -s ml -p 'test_*.py'
```

The CSV data catalog is `ml/household/precision_data_v6/plan.csv`; results are in `ml/household/runs/precision-v6/`. All three reserved test seeds are retained; two individual emergency replays fall below 85% precision. This is one family archetype with independent simulation replicates, not real-world validation or multiple independent households. Commands refuse existing destinations; choose fresh `--data`/`--out` paths for reruns. Use `--device cpu` without MPS.

## Earlier v5: independent forecasts and revised detection

The [v5 study](ml/household/README.md#current-v5-revision) keeps four independent LSTMs for electricity, water, gate and ordinary app activity, followed by separate usage-anomaly and emergency classifiers. The revision addresses sparse/corrupted training labels and makes the older adult's agreed check-in deadlines explicit. Family confirmation responses remain labels only. [Investigation and results](ml/household/DETECTION_REVIEW.md).

```sh
python3 ml/household/multisource_dataset.py generate --revised --data ml/household/multisource_data_v5
python3 ml/household/two_stage.py --data ml/household/multisource_data_v5 --out ml/household/runs/two-stage-v5 --device mps
python3 ml/household/verify_two_stage.py
python3 -m unittest discover -s ml -p 'test_*.py'
```

Generation/training refuses to overwrite existing artifacts: choose fresh paths for a rerun. Review the CSVs in `ml/household/multisource_data_v5/` and `ml/household/runs/two-stage-v5/`. Start with `app_reviews.csv`, `confusion_matrices.csv`, `forecast_metrics.csv`, `oracle_scenario_metrics.csv` and `report.md`. Fixed baseline weights remain 40% electricity, 30% water, 15% gate and 15% app; they do not constrain learned tree importance. Unconfirmed feedback is not counted as normal. Previous versions remain preserved. This enriched synthetic year is not evidence of real-world emergency performance.

## Earlier v3 dataset: electricity-only with family app confirmations

The current [v3 dataset](ml/household/README.md#current-study-electricity-anomalies-with-app-confirmed-labels) forecasts one family's electricity use and detects unexpected electricity patterns. **Electricity history and calendar are model inputs; family app confirmations supply labels only.** Water/gate records remain optional context. The target is household electricity usage, not an older adult's medical condition.

```sh
python3 ml/household/electricity_dataset.py generate
python3 ml/household/electricity_dataset.py validate
python3 ml/household/electricity_dataset.py benchmark
```

Review `ml/household/electricity_data_v3/hourly.csv`, `app_reviews.csv` and `app_labels_hourly.csv`. A validation-only benchmark is saved in `ml/household/runs/electricity-v3-validation/`. All reports are simulated, unknown feedback stays unlabelled, and the test period is reserved. No application workflow changes. The earlier family experiments below are preserved separately.

## Earlier family inactivity experiments

A separate [illustrative synthetic benchmark](ml/household/ILLUSTRATIVE_REVIEW.md) deliberately makes emergencies easier to distinguish: daytime-only cases and reliable hourly elder check-ins. It achieves93.8% reviewed-interval precision and88.2% recall including positive abstentions, detecting29/30 episodes; grouped-alert precision is74.4%. The original difficult data/results are preserved. These new scores describe the changed simulation, not improved real-world reliability.

The latest [research review](ml/household/RECALL_REVIEW.md) prioritises emergency recall and separates it from usage forecasting. A frozen validation-selected threshold raises fresh synthetic emergency recall27.0%→87.8% and reduces FN84→14, while precision falls88.6%→28.1%. Entire-episode recall is28/30, but false alert groups reach51.6 per30 household-days. A development-only investigation demonstrates why identical sleep/emergency inputs need additional timely resident-specific evidence. Source-only LSTMs remain separate; no application notification behaviour changed.

The research work has restarted with [one family household](ml/household/README.md): an older adult, two other adults and two children. It generates one year of resident routines, electricity and water readings, attributable app/gate events, outages and delayed observations. Resident activity and concern labels stay in separate truth tables. CSV outputs include a separate paired scenario suite for older-adult inactivity masked by family activity. Previous research datasets, models and reports have been deleted. A separate trainer now compares seasonal-naive, ridge, random forest, gradient boosting and LSTM on the frozen family dataset.

```bash
python3 ml/household/generate.py
python3 ml/household/validate.py ml/household/data
python3 -m unittest discover -s ml -p 'test_household_dataset.py'
```

Review `ml/household/data/hourly.csv`, `truth/episodes.csv`, `review.md` and `overview.png`. These remain isolated from the app's existing synthetic fixtures. Use NumPy and Matplotlib; exact generator and dependency versions are recorded in the output CSV configuration.

```sh
python3 ml/household/train.py --out ml/household/runs/comparison
python3 ml/household/train.py --models ridge gradient_boosting --seeds 11 --out ml/household/runs/selected
```

See the [training instructions and tested dependencies](ml/household/README.md#train-different-algorithms). Each run saves CSV predictions/metrics, fitted models and a report, without modifying the dataset. All learned models use matching 14-day histories and chronological splits; exploratory inactivity alarms are evaluated separately from forecast accuracy. This remains a synthetic, one-family study with only two concern episodes in the main test period.

The [paper's breakfast, lunch and sleep alarm rules](ml/household/README.md#use-the-papers-activity-alarm-rules) can also be replayed against a completed forecasting run:

```sh
python3 ml/household/paper_alarms.py --run ml/household/runs/comparison --out ml/household/runs/paper-alarms
```

The [v2 evaluation](ml/household/README.md#evaluation-v2-availability-separate-labels-and-hourly-detection) adds a separate frozen CSV challenge with household routine labels and elder-concern labels, a fixed 30-minute upload allowance, and an hourly elder-focused Isolation Forest comparison. Run `python3 ml/household/evaluation_v2.py prepare` followed by `python3 ml/household/evaluation_v2.py run --device mps`. The original year and saved forecasts remain unchanged; the previously reviewed test is development evidence, while the new challenge is scored after its plan is frozen.

This implements the paper's alarm stage with documented timing and standard-deviation assumptions; it reuses the existing forecasters. Household routine alarms and elder-concern results are reported separately.

## Legacy app demo training

`ml/` generates a synthetic dataset (120 elderly households × 90 days of 15-minute electricity and water, plus app and gate events, with labelled concern episodes, naps, away trips and feed outages), builds past-only hourly features, splits households 70/15/15 with separate date ranges, trains an Isolation Forest on normal training windows, picks thresholds on validation and scores the untouched test split once against the rule baseline.

```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
ml/.venv/bin/python ml/train.py     # writes ml/runs/<run_id>/ and ml/runs/latest.json
```

This older Isolation Forest demo pipeline is retained for its existing app callers. It is not the new family dataset or a result of the restarted study.

## Tests

```bash
cd server && npm test
node --test app/src/timeout.test.ts   # from the repo root
ml/.venv/bin/python -m unittest discover ml
```

## Docs

- [Business and Product Requirements](docs/REQUIREMENTS.md)
- [Design](docs/DESIGN.md)
- [Web dashboard implementation plan](docs/IMPLEMENTATION_PLAN.md) and [mobile implementation plan](docs/MOBILE_IMPLEMENTATION_PLAN.md) (written for native/Flutter clients; this branch uses Expo Go)
- [Demo design](docs/superpowers/specs/2026-10-19-simeguardian-demo-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-19-simeguardian-demo.md)
- [MLflow prototype: setup, model evolution and integration](docs/MLFLOW.md)
- [Dashboard walkthrough and implementation boundaries](docs/DASHBOARD.md)

## Run the MLflow dashboard

The React MLflow dashboard is served by FastAPI. It includes the operations overview, six-source pipeline preview, dataset explorer, real MLflow training/evaluation/registry controls, model inference, incident timelines, operations, demo controls and a restricted responder view. MLflow stays behind the backend; operators do not need its separate UI.

The local replay runs the registered champion on explicit synthetic feature windows and persists model/policy decisions, simulated notification creation, deadlines and human outcomes. The six-source explorer is a separate development fixture; the full causal source pipeline, native iPhone delivery, recovery and withdrawal workflows remain planned. See the [dashboard walkthrough and implementation boundaries](docs/DASHBOARD.md).

Start the local MLflow tracking service using [the runbook](docs/MLFLOW.md#run-locally). Then build the frontend from the repository root:

```bash
cd web
npm ci
npm run build
```

In another terminal, from the repository root:

```bash
cd backend
uv sync --locked
MLFLOW_DISABLE_TELEMETRY=true uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open [SimeGuardian](http://127.0.0.1:8000). FastAPI serves the built frontend and its API at the same origin.

For local development, install the dependencies above and run `make dev` from the repository root. This starts Vite at [127.0.0.1:5173](http://127.0.0.1:5173), FastAPI at port 8000 with hot reload, and MLflow at [127.0.0.1:5050](http://127.0.0.1:5050). Vite proxies `/api` to FastAPI. MLflow uses the existing tracking database and artifacts in `artifacts/mlflow/`. Press Ctrl+C to stop all three. To run only the tracking service, use `make dev-mlflow`.

This is a loopback-only synthetic demo. Operator and responder sessions have different server-enforced scopes, but freely selecting these local identities is not production account authentication. Training creates a candidate; promotion is explicit and quality-gated. The next explicit replay inference resolves the selected numeric champion; no production inference service or phone transport is connected.

Checks: run `uv run --locked pytest -q` in `backend/`, and `npm run build` in `web/`. With the two local services running and initial/retrained versions recorded, `npm run test:e2e` runs browser checks in installed Google Chrome. These cover routes, dataset filters, real training/registry actions, model-to-incident-to-responder flow, missing utilities, recovery from API errors and compact layouts. Tests append one synthetic candidate, temporarily roll back/restore the original champion and reset the current replay; they retain MLflow evidence.

The requirements document reflects the review decisions and remains open for feedback. Dataset/model defaults, real data access, a field pilot, funding and operating commitments remain proposals.
