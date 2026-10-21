"""Persisted local scenario replay and inspectable development fixtures."""

from functools import lru_cache
import hashlib
import json
from pathlib import Path
import random
import sqlite3
import uuid

from app.pipeline.mlflow_demo import FEATURES, checksum, fixture

BASE_TIME = 1792371600000  # 19 Oct 2026, 09:00 MYT
UI_HOUSEHOLDS = 120
SOURCES = {
    "electricity": ("Electricity", "kWh"), "water": ("Water", "litres"),
    "parking": ("Parking / car plate", "event"), "mall": ("Mall activity", "event"),
    "gate": ("Gate card", "event"), "app": ("Resident app", "event"),
}
SCENARIOS = {
    "concern": ("Quiet household", [0.04, 0.04, 0, 0], "eligible"),
    "missing_water": ("Missing water feed", [0.04, None, 0, 0], "coverage-blocked"),
    "resident_activity": ("Resident check-in", [0.04, 0.04, 0, 2], "activity-conflict"),
    "away": ("Resident away", [0.04, 0.04, 0, 0], "away-paused"),
    "usual": ("Usual routine", [1.0, 1.0, 1.0, 2], "no-utility-concern"),
}


def connect(directory):
    return sqlite3.connect(Path(directory) / "workspace.db", timeout=10)


def fresh_state():
    return {"id": uuid.uuid4().hex[:12], "revision": 0, "scenario": "usual", "minutes": 0,
            "inference": None, "inferences": [], "incident": None, "audit": []}


def initialize(directory):
    Path(directory).mkdir(parents=True, exist_ok=True)
    with connect(directory) as db:
        db.execute("CREATE TABLE IF NOT EXISTS replay (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL)")
        db.execute("INSERT OR IGNORE INTO replay VALUES (1, ?)", (json.dumps(fresh_state()),))


def read(directory):
    with connect(directory) as db:
        return json.loads(db.execute("SELECT state FROM replay WHERE id=1").fetchone()[0])


def now(state):
    return BASE_TIME + state["minutes"] * 60_000


def event(state, name, actor="operator"):
    entry = {"at": now(state), "name": name, "actor": actor}
    state["audit"].append(entry)
    return entry


def transition(state, action, *, scenario=None, minutes=5, inference=None, outcome="", actor="operator"):
    if action == "reset" or action == "load":
        if action == "load" and scenario not in SCENARIOS:
            raise ValueError("Choose an available scenario.")
        revision = state["revision"]
        state = fresh_state()
        state["revision"] = revision
        state["scenario"] = scenario if action == "load" else "usual"
        event(state, "Scenario loaded" if action == "load" else "Replay reset", actor)
    elif action == "score":
        state["inference"] = inference
        state.setdefault("inferences", []).append(inference)
        event(state, "Model inference recorded", actor)
        if inference["policy_decision"] == "create-incident" and not state["incident"]:
            state["incident"] = {"id": f"INC-{state['id']}", "household": "SG-001", "status": "open",
                "owner": None, "created_at": now(state), "outcome": None, "assigned_to": None,
                "accepted": False, "inference": inference, "events": [], "notifications": []}
            incident = state["incident"]
            incident["events"].append(event(state, "Concern incident created from model and utility policy", actor))
            incident["notifications"].append({"stage": "family", "created_at": now(state),
                "delivery": "simulated · receipt unconfirmed"})
            incident["events"].append(event(state, "Family notification created in replay", actor))
    elif action == "advance":
        if not 1 <= minutes <= 60 or state["minutes"] + minutes > 1440:
            raise ValueError("Advance 1–60 minutes, within the replay's 24-hour limit.")
        state["minutes"] += minutes
        incident = state["incident"]
        if incident and incident["status"] == "open" and not incident["owner"]:
            for stage, delay in (("resident", 5), ("township", 10)):
                due = incident["created_at"] + delay * 60_000
                if now(state) >= due and not any(n["stage"] == stage for n in incident["notifications"]):
                    incident["notifications"].append({"stage": stage, "created_at": due,
                        "delivery": "simulated · receipt unconfirmed"})
                    incident["events"].append({"at": due, "name": f"{stage.title()} notification created in replay", "actor": "replay-worker"})
                    if stage == "township":
                        incident["assigned_to"] = "responder-01"
        event(state, f"Shared clock advanced by {minutes} minutes", actor)
    else:
        incident = state["incident"]
        if not incident or incident["status"] != "open":
            raise ValueError("There is no open incident for this action.")
        if action == "family_ack":
            if incident["accepted"]:
                raise ValueError("Township already owns this task. Record an explicit handoff instead.")
            incident["owner"] = "family"
            incident["events"].append(event(state, "Family took responsibility; incident remains open", actor))
        elif action == "accept":
            if incident["assigned_to"] != actor or incident["owner"] or incident["accepted"]:
                raise ValueError("This task is not available for acceptance.")
            incident["owner"] = actor
            incident["accepted"] = True
            incident["events"].append(event(state, "Assigned responder accepted responsibility", actor))
        elif action == "complete":
            if incident["owner"] != actor or not incident["accepted"] or not outcome.strip():
                raise ValueError("Accept the assigned task and provide a completed check-in outcome first.")
            incident["status"] = "resolved"
            incident["outcome"] = outcome.strip()
            incident["events"].append(event(state, f"Completed check-in: {outcome.strip()}", actor))
        else:
            raise ValueError("Unsupported replay action.")
    state["revision"] += 1
    return state


def mutate(directory, expected_revision, action, **parameters):
    # shortcut: single-machine replay transactions; replace with the production incident store before real notifications.
    with connect(directory) as db:
        db.execute("BEGIN IMMEDIATE")
        state = json.loads(db.execute("SELECT state FROM replay WHERE id=1").fetchone()[0])
        if state["revision"] != expected_revision:
            raise ValueError("The replay changed. Refresh before trying again.")
        state = transition(state, action, **parameters)
        db.execute("UPDATE replay SET state=? WHERE id=1", (json.dumps(state),))
        db.execute("INSERT INTO audit(event) VALUES (?)", (json.dumps({"run": state["id"],
            "revision": state["revision"], "action": action, "actor": parameters.get("actor", "operator")}),))
    return state


@lru_cache(maxsize=1)
def raw_fixture():
    rng = random.Random(42)
    records = []
    for home in range(1, UI_HOUSEHOLDS + 1):
        household = f"SG-{home:03}"
        for slot in range(96):
            at = BASE_TIME - (95 - slot) * 900_000
            for source in ("electricity", "water"):
                records.append({"household": household, "source": source, "at": at,
                    "value": round(rng.uniform(0.04, 0.3) if source == "electricity" else rng.uniform(0, 12), 3),
                    "unit": SOURCES[source][1], "attribution": "household", "group": f"{household}-{source}-{slot}"})
        for source, slot, attribution in (("parking", 42, "shared vehicle"), ("gate", 42, "shared card"),
                ("mall", 52, "resident-linked"), ("app", 90, "resident-linked")):
            records.append({"household": household, "source": source, "at": BASE_TIME - (95-slot)*900_000,
                "value": 1, "unit": "event", "attribution": attribution,
                "group": f"{household}-trip-42" if source in ("parking", "gate") else f"{household}-{source}"})
    return records


def manifest(records):
    return hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()


def dataset_detail(identifier):
    if identifier == "township-ui-v1":
        records = raw_fixture()
        return {"id": identifier, "name": "Six-source UI fixture", "seed": 42, "checksum": manifest(records),
            "scope": "Development source records for the explorer. Not the training pipeline or a measured resident history.",
            "households": sorted({r["household"] for r in records}), "records": records, "count": len(records),
            "splits": [{"name": "UI preview only", "households": UI_HOUSEHOLDS, "windows": len(records)}],
            "features": [], "test_status": "No test partition generated", "labels": "No clinical or episode labels"}
    if identifier != "smoke-features-v1":
        return None
    initial, updated, validation = fixture()
    records = []
    for split, frame in (("training", updated), ("validation", validation)):
        for row in frame.to_dict("records"):
            records.append({"household": row["household_id"], "day": row["day"], "split": split,
                "values": {key: row[key] for key in FEATURES}, "label": row["concern"]})
    return {"id": identifier, "name": "Model feature fixture", "seed": 42, "checksum": checksum(updated),
        "validation_checksum": checksum(validation),
        "scope": "Directly generated feature windows used by the real MLflow runs. Labels are evaluation annotations, never model inputs.",
        "households": sorted({r["household"] for r in records}), "records": records, "count": len(records),
        "splits": [{"name": "Initial training · days 15–45", "households": 16, "windows": len(initial)},
                   {"name": "Updated training · days 15–60 (includes initial)", "households": 16, "windows": len(updated)},
                   {"name": "Fixed validation · days 61–75", "households": 8, "windows": len(validation)}],
        "features": FEATURES, "test_status": "Not generated or used", "labels": "360 validation windows · 120 concern / 240 benign"}


def snapshot(directory):
    state = read(directory)
    records = raw_fixture()
    sources = []
    for key, (name, unit) in SOURCES.items():
        group = [r for r in records if r["source"] == key]
        stale = key == "water" and state["scenario"] == "missing_water"
        sources.append({"id": key, "name": name, "unit": unit, "count": len(group),
            "last_event": max(r["at"] for r in group), "feed_checked_at": now(state) - (45*60_000 if stale else 0),
            "status": "delayed" if stale else "available", "rejected": 0})
    return {"state": state, "clock": now(state), "sources": sources,
        "datasets": [{key: value for key, value in dataset_detail(name).items() if key != "records"}
                     for name in ("smoke-features-v1", "township-ui-v1")],
        "scenarios": [{"id": key, "name": value[0]} for key, value in SCENARIOS.items()],
        "features": dict(zip(FEATURES, SCENARIOS[state["scenario"]][1])),
        "coverage": SCENARIOS[state["scenario"]][2], "households": UI_HOUSEHOLDS,
        "scope": "local-synthetic-replay", "transport": "No iOS delivery transport connected"}


def response_snapshot(directory):
    state = read(directory)
    incident = state["incident"]
    tasks = []
    if incident and incident["assigned_to"] == "responder-01" and incident["owner"] in (None, "responder-01"):
        tasks.append({key: incident[key] for key in ("id", "household", "status", "owner", "accepted", "outcome", "created_at", "events")})
    return {"revision": state["revision"], "clock": now(state), "identity": "responder-01", "tasks": tasks,
        "scope": "Assigned synthetic check-ins only"}
