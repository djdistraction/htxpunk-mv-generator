"""
HTXpunk Studio v2 API — job-based production desk.
Port 8010 by default (legacy app stays on 8000).
"""
from __future__ import annotations

import logging
import shutil
import sys
from pathlib import Path
from typing import Any, Optional

# Put monorepo backend FIRST so `import config` / services resolve to legacy
# backend/config.py (has local_storage_path), not a studio module named config.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_LEGACY_BACKEND = _REPO_ROOT / "backend"
if str(_LEGACY_BACKEND) not in sys.path:
    sys.path.insert(0, str(_LEGACY_BACKEND))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import database as db
from studio_settings import STORAGE
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

_AUDIO_EXTS = {".wav", ".mp3", ".mp4", ".m4a", ".flac", ".ogg"}


def _safe_name(name: str | None) -> str:
    base = Path(name or "audio.bin").name
    return base.replace("..", "_") or "audio.bin"


async def _save_upload(upload: UploadFile, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    if not dest.is_file() or dest.stat().st_size < 64:
        raise HTTPException(400, f"Uploaded file empty or too small: {dest.name}")
    return dest


def _assert_audio_filename(filename: str | None, label: str) -> None:
    if not filename:
        raise HTTPException(400, f"{label} filename missing")
    ext = Path(filename).suffix.lower()
    if ext not in _AUDIO_EXTS:
        raise HTTPException(
            400,
            f"{label} must be audio ({', '.join(sorted(_AUDIO_EXTS))}), got '{ext or 'no extension'}'",
        )


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
    vocals_file: Optional[UploadFile] = File(None),
):
    """Create project with full mix. Optional pre-isolated vocal stem skips CPU separation."""
    _assert_audio_filename(file.filename, "Song file")
    proj = db.create_project(title.strip() or "Untitled", artist.strip())
    pid = proj["id"]
    dest = db.project_dir(pid) / "audio" / _safe_name(file.filename)
    await _save_upload(file, dest)
    updates: dict[str, Any] = {
        "audio_url": str(dest),
        "stage": "song_ready",
        "vocals_source": None,
    }
    if lyrics_text.strip():
        updates["user_lyrics_text"] = lyrics_text.strip()

    # Pre-existing vocal stem: store and mark vocals step done (skip isolate job).
    if vocals_file is not None and vocals_file.filename:
        _assert_audio_filename(vocals_file.filename, "Vocal stem")
        vdest = db.project_dir(pid) / "vocals" / f"uploaded_{_safe_name(vocals_file.filename)}"
        await _save_upload(vocals_file, vdest)
        updates["vocals_url"] = str(vdest)
        updates["vocals_source"] = "uploaded"
        updates["stage"] = "vocals_ready"

    db.update_project(pid, **updates)
    db.set_step(pid, "song", "needs_review")
    if updates.get("vocals_url"):
        db.set_step(pid, "vocals", "approved")
    return db.get_project(pid)


@app.post("/api/projects/{project_id}/vocals")
async def upload_vocals_stem(project_id: str, vocals_file: UploadFile = File(...)):
    """Attach a pre-isolated vocal stem and skip CPU vocal separation.

    Stores the file as vocals_url with vocals_source=uploaded so align/transcribe
    use it directly. Prefer a clean mono/stereo vocal-only file (wav/mp3).
    """
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if not proj.get("audio_url"):
        raise HTTPException(400, "Upload the full song before attaching a vocal stem.")
    _assert_audio_filename(vocals_file.filename, "Vocal stem")
    vdest = db.project_dir(project_id) / "vocals" / f"uploaded_{_safe_name(vocals_file.filename)}"
    await _save_upload(vocals_file, vdest)
    db.update_project(
        project_id,
        vocals_url=str(vdest),
        vocals_source="uploaded",
        stage="vocals_ready",
        error_message=None,
    )
    db.set_step(project_id, "vocals", "approved")
    return db.get_project(project_id)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.get("/api/projects/{project_id}/media/{kind}")
def get_project_media(project_id: str, kind: str):
    """Stream project audio for browser analysis / playback (original|converted|vocals)."""
    from fastapi.responses import FileResponse

    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    path_map = {
        "original": p.get("audio_url"),
        "converted": p.get("converted_audio_url") or p.get("audio_url"),
        "vocals": p.get("vocals_url"),
    }
    path = path_map.get(kind)
    if not path or not Path(str(path)).is_file():
        raise HTTPException(404, f"No {kind} audio on this project yet")
    media = Path(str(path))
    media_type = "audio/mpeg" if media.suffix.lower() == ".mp3" else "application/octet-stream"
    return FileResponse(str(media), media_type=media_type, filename=media.name)


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
