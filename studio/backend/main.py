"""
HTXpunk Studio v2 API — job-based production desk.
Port 8010 by default (legacy app stays on 8000).
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import database as db
from config import STORAGE
from jobs import runner

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("studio")

app = FastAPI(title="HTXpunk Studio v2", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()
app.mount("/files", StaticFiles(directory=str(STORAGE)), name="files")


class FoundationPatch(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[str] = None
    musical_key: Optional[str] = None
    beat_grid: Optional[list[float]] = None
    user_lyrics_text: Optional[str] = None
    transcript: Optional[dict[str, Any]] = None


class RhythmBody(BaseModel):
    bpm: str = ""
    musical_key: str = ""
    beat_grid: list[float] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"ok": True, "service": "studio-v2"}


@app.get("/api/projects")
def list_projects():
    return db.list_projects()


@app.post("/api/projects")
async def create_project(
    title: str = Form(...),
    artist: str = Form(""),
    file: UploadFile = File(...),
    lyrics_text: str = Form(""),
):
    if not file.filename:
        raise HTTPException(400, "Audio file required")
    proj = db.create_project(title.strip() or "Untitled", artist.strip())
    pid = proj["id"]
    dest = db.project_dir(pid) / "audio" / Path(file.filename).name
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    updates: dict[str, Any] = {
        "audio_url": str(dest),
        "stage": "song_ready",
    }
    if lyrics_text.strip():
        updates["user_lyrics_text"] = lyrics_text.strip()
    db.update_project(pid, **updates)
    db.set_step(pid, "song", "needs_review")
    return db.get_project(pid)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.patch("/api/projects/{project_id}/foundation")
def patch_foundation(project_id: str, body: FoundationPatch):
    if not db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    fields = body.model_dump(exclude_unset=True)
    # top-level title/artist
    kwargs = {}
    if "title" in fields:
        kwargs["title"] = fields.pop("title")
    if "artist" in fields:
        kwargs["artist"] = fields.pop("artist")
    kwargs.update(fields)
    return db.update_project(project_id, **kwargs)


@app.post("/api/projects/{project_id}/rhythm")
def save_rhythm(project_id: str, body: RhythmBody):
    if not db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    if not body.bpm and not body.musical_key and not body.beat_grid:
        raise HTTPException(400, "Provide bpm, key, or beat grid")
    db.update_project(
        project_id,
        bpm=body.bpm,
        musical_key=body.musical_key,
        beat_grid=body.beat_grid,
        stage="rhythm_ready",
    )
    db.set_step(project_id, "rhythm", "approved")
    return db.get_project(project_id)


@app.post("/api/projects/{project_id}/steps/{step}/approve")
def approve_step(project_id: str, step: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return db.set_step(project_id, step, "approved")


@app.get("/api/projects/{project_id}/jobs")
def list_jobs(project_id: str):
    if not db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    return db.list_jobs(project_id)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    j = db.get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@app.post("/api/projects/{project_id}/jobs/{job_type}")
def start_job(project_id: str, job_type: str):
    if not db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    handlers = {
        "prepare_audio": runner.job_prepare_audio,
        "isolate_vocals": runner.job_isolate_vocals,
        "transcribe_lyrics": runner.job_transcribe_lyrics,
        "align_lyrics": runner.job_align_lyrics,
    }
    fn = handlers.get(job_type)
    if not fn:
        raise HTTPException(400, f"Unknown job type: {job_type}")
    try:
        job = runner.submit(project_id, job_type, fn)
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    return job
