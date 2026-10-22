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
Activity signals, the guard, and the family phone call are simulated. Nothing connects to real plate recognition, access cards, Air Selangor or TNB yet. The live demo clock runs the rule engine; the **Model** tab shows a real prior training run and labels its live-inference line as a demo replay.

## Model training

`ml/` generates a synthetic dataset (120 elderly households × 90 days of 15-minute electricity and water, plus app and gate events, with labelled concern episodes, naps, away trips and feed outages), builds past-only hourly features, splits households 70/15/15 with separate date ranges, trains an Isolation Forest on normal training windows, picks thresholds on validation and scores the untouched test split once against the rule baseline.

```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
ml/.venv/bin/python ml/train.py     # writes ml/runs/<run_id>/ and ml/runs/latest.json
```

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
