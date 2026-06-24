import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.project import ProjectCreate
from database import (
    db_list_projects, db_create_project, db_get_project, db_update_project,
    db_list_series, db_create_series, db_get_series,
)
from utils.storage import upload_bytes

router = APIRouter()


@router.get("/")
async def list_projects():
    return db_list_projects()


@router.post("/")
async def create_project(data: ProjectCreate):
    project_id = str(uuid.uuid4())
    return db_create_project(project_id, data.title, data.artist)


# Combined endpoint: create project + upload audio in one multipart call
# !! Must be defined BEFORE /{project_id} to avoid routing ambiguity !!
@router.post("/upload-audio")
async def create_and_upload(
    title: str = Form(...),
    artist: str = Form(""),
    series_id: str = Form(""),
    file: UploadFile = File(...),
):
    """
    Create a new project and upload audio in one step.
    The orchestrator automatically picks up the project and starts analysis.
    """
    project_id = str(uuid.uuid4())
    db_create_project(project_id, title, artist)

    contents = await file.read()
    key = f"projects/{project_id}/audio/{file.filename}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")

    updates: dict = {"audio_url": audio_url, "stage": "uploaded"}
    if series_id:
        updates["series_id"] = series_id

    db_update_project(project_id, **updates)
    # No .delay() — orchestrator sees stage="uploaded" and dispatches automatically
    return db_get_project(project_id)


@router.get("/{project_id}")
async def get_project(project_id: str):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    """Upload audio to an existing project."""
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    contents = await file.read()
    key = f"projects/{project_id}/audio/{file.filename}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")
    db_update_project(project_id, audio_url=audio_url, stage="uploaded")
    return {"audio_url": audio_url, "message": "Audio uploaded — analysis starting"}


# ── Series endpoints ──────────────────────────────────────────────────────────

@router.get("/series/list")
async def list_series():
    return db_list_series()


@router.post("/series/create")
async def create_series(name: str = Form(...), artist: str = Form("")):
    series_id = str(uuid.uuid4())
    return db_create_series(series_id, name, artist)


@router.get("/series/{series_id}")
async def get_series(series_id: str):
    s = db_get_series(series_id)
    if not s:
        raise HTTPException(status_code=404, detail="Series not found")
    return s
