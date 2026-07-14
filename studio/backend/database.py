"""SQLite storage for Studio v2 — projects + jobs."""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from config import DB_PATH, STORAGE


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Row]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              artist TEXT DEFAULT '',
              data_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              type TEXT NOT NULL,
              status TEXT NOT NULL,
              progress REAL NOT NULL DEFAULT 0,
              message TEXT NOT NULL DEFAULT '',
              error TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(project_id) REFERENCES projects(id)
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
            """
        )


def _row_project(row: sqlite3.Row) -> dict[str, Any]:
    data = json.loads(row["data_json"] or "{}")
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        **data,
    }


def create_project(title: str, artist: str = "") -> dict[str, Any]:
    pid = str(uuid.uuid4())
    now = _utc()
    data = {
        "stage": "uploaded",
        "steps": {
            "song": "ready",
            "rhythm": "pending",
            "vocals": "pending",
            "lyrics": "pending",
            "understanding": "pending",
            "lyric_video": "pending",
        },
        "audio_url": None,
        "converted_audio_url": None,
        "vocals_url": None,
        "vocals_source": None,  # "uploaded" | "isolated" | None
        "bpm": None,
        "musical_key": None,
        "beat_grid": [],
        "transcript": None,
        "user_lyrics_text": None,
        "analysis": None,
        "treatment": None,
        "elements": [],
        "storyboard": [],
        "base_video_url": None,
        "lipsynced_video_url": None,
        "final_video_url": None,
        "error_message": None,
    }
    with db() as conn:
        conn.execute(
            "INSERT INTO projects (id, title, artist, data_json, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (pid, title, artist, json.dumps(data), now, now),
        )
    (STORAGE / pid).mkdir(parents=True, exist_ok=True)
    return get_project(pid)


def list_projects() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [_row_project(r) for r in rows]


def get_project(project_id: str) -> Optional[dict[str, Any]]:
    with db() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return _row_project(row) if row else None


def update_project(project_id: str, **fields: Any) -> dict[str, Any]:
    proj = get_project(project_id)
    if not proj:
        raise KeyError(project_id)
    title = fields.pop("title", proj["title"])
    artist = fields.pop("artist", proj["artist"])
    # known top-level columns vs data blob
    data_keys = {
        "stage", "steps", "audio_url", "converted_audio_url", "vocals_url", "vocals_source",
        "bpm", "musical_key", "beat_grid", "transcript", "user_lyrics_text",
        "analysis", "treatment", "elements", "storyboard",
        "base_video_url", "lipsynced_video_url", "final_video_url", "error_message",
    }
    data = {k: proj[k] for k in data_keys if k in proj}
    for k, v in fields.items():
        if k in data_keys:
            data[k] = v
    now = _utc()
    with db() as conn:
        conn.execute(
            "UPDATE projects SET title=?, artist=?, data_json=?, updated_at=? WHERE id=?",
            (title, artist, json.dumps(data), now, project_id),
        )
    return get_project(project_id)


def set_step(project_id: str, step: str, status: str) -> dict[str, Any]:
    proj = get_project(project_id)
    steps = dict(proj.get("steps") or {})
    steps[step] = status
    return update_project(project_id, steps=steps)


def project_dir(project_id: str) -> Path:
    p = STORAGE / project_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def create_job(project_id: str, job_type: str) -> dict[str, Any]:
    jid = str(uuid.uuid4())
    now = _utc()
    with db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, project_id, type, status, progress, message, error, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (jid, project_id, job_type, "queued", 0, "Queued", None, now, now),
        )
    return get_job(jid)


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    with db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        return None
    return dict(row)


def list_jobs(project_id: str, limit: int = 20) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def update_job(
    job_id: str,
    *,
    status: Optional[str] = None,
    progress: Optional[float] = None,
    message: Optional[str] = None,
    error: Optional[str] = None,
) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise KeyError(job_id)
    now = _utc()
    with db() as conn:
        conn.execute(
            "UPDATE jobs SET status=?, progress=?, message=?, error=?, updated_at=? WHERE id=?",
            (
                status if status is not None else job["status"],
                progress if progress is not None else job["progress"],
                message if message is not None else job["message"],
                error if error is not None else job["error"],
                now,
                job_id,
            ),
        )
    return get_job(job_id)
