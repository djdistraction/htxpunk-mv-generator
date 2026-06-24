"""
SQLite database via SQLAlchemy async.
No server needed — DB file lives at ./htxpunk.db next to main.py.
Swap database_url to postgresql+asyncpg://... when deploying.
"""
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import Column, String, Text, DateTime, text
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class ProjectRow(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True)
    title = Column(String)
    artist = Column(String)
    series_id = Column(String)           # optional: link to a series
    stage = Column(String, default="uploaded")
    audio_url = Column(String)
    analysis = Column(Text)              # JSON
    treatment = Column(Text)             # JSON
    elements = Column(Text)              # JSON
    panel_order = Column(Text)           # JSON list of asset IDs
    video_url = Column(String)
    revision_notes = Column(Text)        # feedback for treatment/storyboard revision
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AssetRow(Base):
    __tablename__ = "assets"
    id = Column(String, primary_key=True)
    project_id = Column(String)
    asset_type = Column(String)   # background | element | storyboard_panel | clip | final_video
    label = Column(String)
    url = Column(String)
    prompt = Column(Text)
    asset_meta = Column("metadata", Text)  # JSON (state, panel_index, lyric, scene_description, etc.)
    created_at = Column(DateTime, default=datetime.utcnow)

class TaskRow(Base):
    """Orchestrator task log — one row per worker dispatch."""
    __tablename__ = "tasks"
    id = Column(String, primary_key=True)
    project_id = Column(String)
    task_type = Column(String)
    status = Column(String, default="running")  # running | completed | failed
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

class SeriesRow(Base):
    """A series groups related music videos (same artist, recurring characters/style)."""
    __tablename__ = "series"
    id = Column(String, primary_key=True)
    name = Column(String)
    artist = Column(String)
    style_prompt = Column(Text)    # carries into every project treatment
    characters = Column(Text)      # JSON — character definitions to seed element extraction
    color_palette = Column(Text)   # JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Safe column migrations for existing databases
    _migrate_db()

def _migrate_db():
    """Add new columns to existing tables without dropping data."""
    conn = _sync_db()
    _add_column_if_missing(conn, "projects", "series_id", "TEXT")
    _add_column_if_missing(conn, "projects", "revision_notes", "TEXT")
    _add_column_if_missing(conn, "projects", "panel_order", "TEXT")
    conn.commit()
    conn.close()

def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """SQLite-safe column addition (ALTER TABLE IF NOT EXISTS equivalent)."""
    import sqlite3 as _sqlite3
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
    except _sqlite3.OperationalError:
        pass  # column already exists

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Convenience helpers used by pipeline workers (sync context)
import sqlite3, uuid

DB_PATH = settings.database_url.replace("sqlite+aiosqlite:///", "")

def _sync_db():
    return sqlite3.connect(DB_PATH)

def db_list_projects() -> list[dict]:
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        for field in ("analysis", "treatment", "elements", "panel_order"):
            if d.get(field):
                d[field] = json.loads(d[field])
        result.append(d)
    return result

def db_create_project(project_id: str, title: str, artist: str) -> dict:
    conn = _sync_db()
    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO projects (id, title, artist, stage, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        (project_id, title, artist, "uploaded", now, now)
    )
    conn.commit()
    conn.close()
    return db_get_project(project_id)

def db_get_project(project_id: str) -> dict | None:
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    for field in ("analysis", "treatment", "elements", "panel_order"):
        if d.get(field):
            d[field] = json.loads(d[field])
    return d

def db_update_project(project_id: str, **kwargs):
    conn = _sync_db()
    for key, value in kwargs.items():
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        conn.execute(f"UPDATE projects SET {key}=?, updated_at=? WHERE id=?",
                     (value, datetime.utcnow().isoformat(), project_id))
    conn.commit()
    conn.close()

def db_create_asset(project_id: str, asset_type: str, label: str,
                    url: str = "", prompt: str = "", **meta) -> str:
    asset_id = str(uuid.uuid4())
    conn = _sync_db()
    conn.execute(
        "INSERT INTO assets (id, project_id, asset_type, label, url, prompt, metadata, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (asset_id, project_id, asset_type, label, url, prompt,
         json.dumps(meta), datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return asset_id

def db_update_asset(asset_id: str, **kwargs):
    conn = _sync_db()
    for key, value in kwargs.items():
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        conn.execute(f"UPDATE assets SET {key}=? WHERE id=?", (value, asset_id))
    conn.commit()
    conn.close()

def db_get_assets(project_id: str, asset_type: str = None) -> list[dict]:
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    if asset_type:
        rows = conn.execute("SELECT * FROM assets WHERE project_id=? AND asset_type=?",
                            (project_id, asset_type)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM assets WHERE project_id=?",
                            (project_id,)).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        if d.get("metadata"):
            meta = json.loads(d["metadata"])
            meta.pop("id", None)  # never overwrite the asset's own UUID
            d.update(meta)
        result.append(d)
    return result


# ── Orchestrator task helpers ────────────────────────────────────────────────

def db_create_task(project_id: str, task_type: str) -> str:
    """Log a task as running. Returns task_id."""
    task_id = str(uuid.uuid4())
    conn = _sync_db()
    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO tasks (id, project_id, task_type, status, created_at) VALUES (?,?,?,?,?)",
        (task_id, project_id, task_type, "running", now)
    )
    conn.commit()
    conn.close()
    return task_id

def db_complete_task(task_id: str):
    conn = _sync_db()
    conn.execute(
        "UPDATE tasks SET status='completed', completed_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), task_id)
    )
    conn.commit()
    conn.close()

def db_fail_task(task_id: str, error: str):
    conn = _sync_db()
    conn.execute(
        "UPDATE tasks SET status='failed', error=?, completed_at=? WHERE id=?",
        (error[:2000], datetime.utcnow().isoformat(), task_id)
    )
    conn.commit()
    conn.close()

def db_get_running_task(project_id: str) -> dict | None:
    """Returns the first running task for this project, or None."""
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM tasks WHERE project_id=? AND status='running' LIMIT 1",
        (project_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ── Series helpers ────────────────────────────────────────────────────────────

def db_create_series(series_id: str, name: str, artist: str = "") -> dict:
    conn = _sync_db()
    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO series (id, name, artist, created_at, updated_at) VALUES (?,?,?,?,?)",
        (series_id, name, artist, now, now)
    )
    conn.commit()
    conn.close()
    return db_get_series(series_id)

def db_get_series(series_id: str) -> dict | None:
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM series WHERE id=?", (series_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    for field in ("characters", "color_palette"):
        if d.get(field):
            d[field] = json.loads(d[field])
    return d

def db_list_series() -> list[dict]:
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM series ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        for field in ("characters", "color_palette"):
            if d.get(field):
                d[field] = json.loads(d[field])
        result.append(d)
    return result

def db_update_series(series_id: str, **kwargs):
    conn = _sync_db()
    for key, value in kwargs.items():
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        conn.execute(
            f"UPDATE series SET {key}=?, updated_at=? WHERE id=?",
            (value, datetime.utcnow().isoformat(), series_id)
        )
    conn.commit()
    conn.close()
