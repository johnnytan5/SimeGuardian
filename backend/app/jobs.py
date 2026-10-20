"""Local, persisted training jobs; the child process survives API restarts."""

import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import uuid


def connect(directory):
    connection = sqlite3.connect(Path(directory) / "dashboard.db", timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize(directory):
    Path(directory).mkdir(parents=True, exist_ok=True)
    with connect(directory) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, status TEXT NOT NULL, parameters TEXT NOT NULL,
            created_at REAL NOT NULL, finished_at REAL, pid INTEGER,
            result TEXT, error TEXT
        )""")


def list_jobs(directory):
    with connect(directory) as connection:
        rows = connection.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 20").fetchall()
    result = []
    for row in rows:
        job = dict(row)
        for key in ("parameters", "result"):
            job[key] = json.loads(job[key]) if job[key] else None
        job.pop("pid")
        result.append(job)
    return result


def reconcile(directory, processes):
    with connect(directory) as connection:
        rows = connection.execute("SELECT id, pid FROM jobs WHERE status IN ('queued','running')").fetchall()
        for row in rows:
            process = processes.get(row["id"])
            alive = process.poll() is None if process else False
            if not process and row["pid"]:
                try:
                    os.kill(row["pid"], 0)
                    alive = True
                except (ProcessLookupError, PermissionError):
                    pass
            if not alive:
                connection.execute("""UPDATE jobs SET status='failed', error=?, finished_at=?
                    WHERE id=? AND status IN ('queued','running')""",
                    ("Training process stopped before reporting completion. Retry the run.", time.time(), row["id"]))


def launch(directory, tracking_uri, parameters, processes):
    # shortcut: single-machine subprocess supervision, use a durable distributed worker before multiple hosts.
    job_id = uuid.uuid4().hex
    with connect(directory) as connection:
        connection.execute("BEGIN IMMEDIATE")
        if connection.execute("SELECT 1 FROM jobs WHERE status IN ('queued','running')").fetchone():
            raise ValueError("A training job is already running. Wait for it to finish.")
        connection.execute("INSERT INTO jobs (id,status,parameters,created_at) VALUES (?,?,?,?)",
                           (job_id, "queued", json.dumps(parameters), time.time()))
    try:
        environment = os.environ | {"MLFLOW_TRACKING_URI": tracking_uri,
            "SIMEGUARDIAN_DATA_DIR": str(Path(directory).resolve()), "MLFLOW_DISABLE_TELEMETRY": "true"}
        with (Path(directory) / f"{job_id}.log").open("w") as log:
            process = subprocess.Popen([sys.executable, "-m", "app.jobs", job_id],
                cwd=Path(__file__).resolve().parents[1], env=environment,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        processes[job_id] = process
        with connect(directory) as connection:
            connection.execute("UPDATE jobs SET pid=? WHERE id=?", (process.pid, job_id))
    except OSError:
        with connect(directory) as connection:
            connection.execute("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=?",
                               ("Could not start the training process.", time.time(), job_id))
        raise
    return next(job for job in list_jobs(directory) if job["id"] == job_id)


def run_job(job_id):
    from app.pipeline.mlflow_demo import run_evolution

    directory = Path(os.environ["SIMEGUARDIAN_DATA_DIR"])
    with connect(directory) as connection:
        job = connection.execute("SELECT parameters FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not job:
            raise ValueError("Unknown training job.")
        connection.execute("UPDATE jobs SET status='running',pid=? WHERE id=?", (os.getpid(), job_id))
    try:
        result = run_evolution(os.environ["MLFLOW_TRACKING_URI"], job_id=job_id, **json.loads(job["parameters"]))
    except Exception:
        with connect(directory) as connection:
            connection.execute("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=?",
                               ("Training failed. Check the local job log before retrying.", time.time(), job_id))
        raise
    with connect(directory) as connection:
        connection.execute("UPDATE jobs SET status='completed',result=?,finished_at=? WHERE id=?",
                           (json.dumps(result), time.time(), job_id))


if __name__ == "__main__":
    run_job(sys.argv[1])
