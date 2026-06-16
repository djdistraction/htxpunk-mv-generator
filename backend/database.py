"""
SQLite database via SQLAlchemy async.
No server needed — DB file lives at ./voodoo.db next to main.py.
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
    stage = Column(String, default="uploaded")
    audio_url = Column(String)
    analysis = Column(Text)       # JSON
    treatment = Column(Text)      # JSON
    elements = Column(Text)       # JSON
    panel_order = Column(Text)    # JSON list of asset IDs
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
    metadata = Column(Text)       # JSON (state, panel_index, lyric, scene_description, etc.)
    created_at = Column(DateTime, default=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Convenience helpers used by pipeline workers (sync context)
import sqlite3, uuid

DB_PATH = settings.database_url.replace("sqlite+aiosqlite:///", "")

def _sync_db():
    return sqlite3.connect(DB_PATH)

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
            d.update(meta)
        result.append(d)
    return result
