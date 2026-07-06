import json
import tempfile
import uuid
from pathlib import Path
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.project import ProjectCreate, ProjectInfoConfirm
from database import (
    db_list_projects, db_create_project, db_get_project, db_update_project,
    db_create_asset, db_get_assets,
    db_list_series, db_create_series, db_get_series,
)
from utils.storage import upload_bytes, url_to_local_path

router = APIRouter()

# Server-side enforcement — the frontend's accept="audio/*" file-picker hint
# doesn't stop anyone selecting "All Files" or hitting the API directly.
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".mp4"}


def _validate_audio_file(filename: str | None):
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if filename and "." in filename else ""
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or '(none)'}' — only .wav, .mp3, and .mp4 are accepted.",
        )


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


@router.get("")
async def list_projects():
    return db_list_projects()


@router.post("")
async def create_project(data: ProjectCreate):
    project_id = str(uuid.uuid4())
    return db_create_project(project_id, data.title, data.artist)


# Combined endpoint: create project + upload audio in one multipart call
# !! Must be defined BEFORE /{project_id} to avoid routing ambiguity !!
@router.post("/upload-audio")
async def create_and_upload(
    title: str = Form(...),
    bpm: str = Form(""),
    musical_key: str = Form(""),
    beat_grid: str = Form("[]"),
    file: UploadFile = File(...),
    vocals_file: UploadFile | None = File(None),
):
    """
    Create a new project: a name for it, plus the audio file — that's the
    entire upload form. Artist, series, creative brief, and reference files
    are still deferred to the project-info review screen, filled in once
    there's real data (transcript, tags) to react to; only the project's own
    name is needed up front; so it exists as something findable in the
    project list, and so the human has confirmed the anchor everything else
    grounds against before preprocessing ever starts.

    bpm/musical_key/beat_grid are measured client-side (essentia.js, WASM, in
    the browser — never server-side, per design) and arrive already computed;
    this endpoint only persists them. They're locked/read-only from here on,
    surfaced on the project-info review gate alongside the server-measured
    song_length.

    vocals_file is optional: if the artist already has an isolated vocal
    stem (e.g. from their own DAW session), uploading it here skips
    run_audio_preprocessing's separate_vocals() step entirely — real time
    and CPU saved, since separation is the slowest part of preprocessing.
    """
    _validate_audio_file(file.filename)
    if vocals_file is not None and vocals_file.filename:
        _validate_audio_file(vocals_file.filename)

    project_id = str(uuid.uuid4())
    db_create_project(project_id, title, "")

    contents = await file.read()
    key = f"projects/{project_id}/audio/{file.filename}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")

    updates: dict = {"audio_url": audio_url, "stage": "uploaded"}
    if bpm.strip():
        updates["bpm"] = bpm.strip()
    if musical_key.strip():
        updates["musical_key"] = musical_key.strip()
    if beat_grid.strip():
        try:
            parsed_grid = json.loads(beat_grid)
            if isinstance(parsed_grid, list):
                updates["beat_grid"] = parsed_grid
        except json.JSONDecodeError:
            pass
    if vocals_file is not None and vocals_file.filename:
        vocals_contents = await vocals_file.read()
        vocals_key = f"projects/{project_id}/audio/vocals_{vocals_file.filename}"
        updates["user_vocals_url"] = upload_bytes(
            vocals_contents, vocals_key, vocals_file.content_type or "audio/mpeg"
        )

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
    source: str = Form("revision"),
    references: list[UploadFile] = File(default=[]),
):
    """Attach more reference files to an existing project — used both from the
    project-info review screen (source="initial", first time the artist can
    attach anything) and later while requesting treatment changes
    (source="revision", the original use). The treatment generator reads all
    reference assets regardless of source; it's audit metadata only."""
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    stored = await _store_references(project_id, references, reference_meta, source=source)
    return {"added": stored}


@router.post("/{project_id}/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    """Upload audio to an existing project."""
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _validate_audio_file(file.filename)
    contents = await file.read()
    key = f"projects/{project_id}/audio/{file.filename}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")
    db_update_project(project_id, audio_url=audio_url, stage="uploaded")
    return {"audio_url": audio_url, "message": "Audio uploaded — analysis starting"}


@router.post("/{project_id}/confirm-info")
async def confirm_project_info(project_id: str, payload: ProjectInfoConfirm):
    """
    "Create Project & Save": the human fills in title, artist, series, and
    creative vision for the first time here (none of it was collected at
    upload, which is audio-only now), and edits whatever preprocessing
    extracted (composer, album, transcript — bpm/musical_key arrive here from
    the client-side essentia.js measurement). We apply the edits, write the
    human-readable project folder, then hand off to song interpretation (the
    first LLM call in the pipeline) — grounded in whatever the human just
    confirmed.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["stage"] != "awaiting_project_info_review":
        raise HTTPException(
            status_code=400,
            detail=f"Project is not awaiting info review (stage={project['stage']})",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "brief" in updates:
        updates["user_brief"] = updates.pop("brief")
    if updates:
        db_update_project(project_id, **updates)
        project = db_get_project(project_id)

    from services.project_folder import create_human_readable_folder

    def _local_audio_path(url: str | None, suffix: str) -> str:
        if not url:
            return ""
        local_path = url_to_local_path(url)
        if Path(local_path).exists():
            return local_path
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(httpx.get(url, timeout=120).content)
                return f.name
        except Exception:
            return ""

    original_path = _local_audio_path(project.get("audio_url"), ".audio")
    converted_path = _local_audio_path(project.get("converted_audio_url"), ".mp3")

    folder = create_human_readable_folder(
        project_id,
        title=project.get("title", ""),
        artist=project.get("artist", ""),
        original_audio_path=original_path,
        converted_audio_path=converted_path,
        transcript=project.get("transcript") or {},
        metadata={
            "composer": project.get("composer"),
            "album": project.get("album"),
            "song_length": project.get("song_length"),
            "bpm": project.get("bpm"),
            "musical_key": project.get("musical_key"),
        },
    )
    db_update_project(project_id, project_folder=folder, stage="info_confirmed")
    # No .delay() — orchestrator sees stage="info_confirmed" and dispatches automatically
    return db_get_project(project_id)


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
