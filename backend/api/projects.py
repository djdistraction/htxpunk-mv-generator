import json
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.project import ProjectCreate
from database import (
    db_list_projects, db_create_project, db_get_project, db_update_project,
    db_create_asset, db_get_assets,
    db_list_series, db_create_series, db_get_series,
)
from utils.storage import upload_bytes

router = APIRouter()


# ── Reference files (user's supporting material) ──────────────────────────────

# Plain-text document types we can read directly to feed the LLM. Anything else
# (images, PDFs, binary docs) relies on the user's description, which is exactly
# why we require one per reference.
_TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".rtf", ".csv"}


def _reference_kind(filename: str, content_type: str | None) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return "image"
    if any((filename or "").lower().endswith(ext) for ext in _TEXT_EXTENSIONS):
        return "document"
    return "document"


def _extract_reference_text(filename: str, contents: bytes, content_type: str | None) -> str:
    """Pull readable text out of a reference document, if we safely can.

    We only decode obvious text formats — images and binary documents return ""
    and rely on the user's description. Capped so a giant file can't blow up the
    LLM prompt later.
    """
    ct = (content_type or "").lower()
    is_textual = ct.startswith("text/") or any(
        (filename or "").lower().endswith(ext) for ext in _TEXT_EXTENSIONS
    )
    if not is_textual:
        return ""
    try:
        return contents.decode("utf-8", errors="ignore").strip()[:4000]
    except Exception:
        return ""


async def _store_references(project_id: str, references, reference_meta: str, source: str) -> list[dict]:
    """Persist uploaded reference files as 'reference' assets.

    reference_meta is a JSON array aligned positionally with `references`, each:
      {"description": "who/what this is", "role": "where it fits in the video"}
    """
    try:
        meta_list = json.loads(reference_meta) if reference_meta else []
    except json.JSONDecodeError:
        meta_list = []

    stored: list[dict] = []
    for i, ref in enumerate(references or []):
        contents = await ref.read()
        if not contents:
            continue
        meta = meta_list[i] if i < len(meta_list) else {}
        description = (meta.get("description") or "").strip()
        role = (meta.get("role") or "").strip()
        kind = _reference_kind(ref.filename, ref.content_type)
        key = f"projects/{project_id}/references/{uuid.uuid4().hex}_{ref.filename}"
        url = upload_bytes(contents, key, ref.content_type or "application/octet-stream")
        extracted_text = _extract_reference_text(ref.filename, contents, ref.content_type)
        asset_id = db_create_asset(
            project_id, "reference", ref.filename or "reference", url, "",
            description=description, role=role, kind=kind,
            filename=ref.filename, extracted_text=extracted_text, source=source,
        )
        stored.append({"id": asset_id, "filename": ref.filename, "kind": kind,
                       "description": description, "role": role, "url": url})
    return stored


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
    brief: str = Form(""),
    reference_meta: str = Form("[]"),
    file: UploadFile = File(...),
    references: list[UploadFile] = File(default=[]),
):
    """
    Create a new project and upload audio in one step. The user may also include
    a free-text creative brief and supporting reference files (images, docs).
    Audio is the only requirement; everything else is optional context the AI
    folds into its analysis and treatment.

    The orchestrator picks up stage='uploaded' and starts analysis — so we store
    the brief and references BEFORE flipping the stage, ensuring they're included.
    """
    project_id = str(uuid.uuid4())
    db_create_project(project_id, title, artist)

    contents = await file.read()
    key = f"projects/{project_id}/audio/{file.filename}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")

    # Store brief + references first so analysis includes them.
    if brief.strip():
        db_update_project(project_id, user_brief=brief.strip())
    if references:
        await _store_references(project_id, references, reference_meta, source="initial")

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


@router.get("/{project_id}/references")
async def list_references(project_id: str):
    """List the supporting reference files attached to a project."""
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return db_get_assets(project_id, asset_type="reference")


@router.post("/{project_id}/references")
async def add_references(
    project_id: str,
    reference_meta: str = Form("[]"),
    references: list[UploadFile] = File(default=[]),
):
    """Attach more reference files to an existing project (e.g. while requesting
    treatment changes). The treatment generator reads all reference assets, so
    anything added here is folded into the next regeneration."""
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    stored = await _store_references(project_id, references, reference_meta, source="revision")
    return {"added": stored}


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
