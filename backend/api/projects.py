import json
import re
import tempfile
import uuid
from pathlib import Path
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.project import ProjectCreate, ProjectInfoConfirm
from database import (
    db_list_projects, db_create_project, db_get_project, db_update_project,
    db_create_asset, db_get_assets, db_delete_project, db_get_last_task,
    db_list_series, db_create_series, db_get_series,
)
from utils.storage import upload_bytes, upload_file_path, url_to_local_path, delete_project_files

router = APIRouter()

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".mp4"}
ALLOWED_PRODUCTION_PATHS = {"lyric", "karaoke", "performance", "cinematic"}
_WINDOWS_ILLEGAL_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _sanitize_filename(filename: str | None) -> str:
    name = (filename or "file").strip().rstrip(". ")
    name = _WINDOWS_ILLEGAL_CHARS.sub("_", name)
    return name or "file"


def _validate_audio_file(filename: str | None):
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if filename and "." in filename else ""
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or '(none)'}' — only .wav, .mp3, and .mp4 are accepted.",
        )


def _normalize_production_paths(raw) -> list[str]:
    """Validate the selected music-video path.

    A project can use one base path or a hybrid of any two:
    lyric, karaoke, performance, cinematic.
    """
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else []
        except json.JSONDecodeError:
            raw = [p.strip() for p in raw.split(",") if p.strip()]
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="production_paths must be a list.")

    paths: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key and key not in paths:
            paths.append(key)

    invalid = [p for p in paths if p not in ALLOWED_PRODUCTION_PATHS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported production path: {', '.join(invalid)}.",
        )
    if not paths:
        raise HTTPException(status_code=400, detail="Select at least one production path.")
    if len(paths) > 2:
        raise HTTPException(status_code=400, detail="Select one path or a hybrid of any two paths.")
    return paths


def _get_project_or_404(project_id: str) -> dict:
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _local_audio_path(url: str | None, suffix: str = ".audio") -> str:
    if not url:
        raise HTTPException(status_code=400, detail="Project does not have an audio file for this step.")
    local_path = url_to_local_path(url)
    if Path(local_path).exists():
        return local_path
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(httpx.get(url, timeout=120).content)
            return f.name
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not resolve audio file: {exc}")


def _set_guided_failure(project_id: str, step: str, exc: Exception):
    db_update_project(project_id, processing_step=f"Failed: {step}", error_message=str(exc))


_TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".rtf", ".csv"}


def _reference_kind(filename: str, content_type: str | None) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return "image"
    if any((filename or "").lower().endswith(ext) for ext in _TEXT_EXTENSIONS):
        return "document"
    return "document"


def _extract_reference_text(filename: str, contents: bytes, content_type: str | None) -> str:
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
        key = f"projects/{project_id}/references/{uuid.uuid4().hex}_{_sanitize_filename(ref.filename)}"
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


_THUMBNAIL_ASSET_PRIORITY = ("storyboard_panel", "background", "element")


def _thumbnail_for_project(project_id: str) -> str | None:
    assets = db_get_assets(project_id)
    for asset_type in _THUMBNAIL_ASSET_PRIORITY:
        candidates = [a for a in assets if a.get("asset_type") == asset_type and a.get("url")]
        if not candidates:
            continue
        if asset_type == "storyboard_panel":
            candidates.sort(key=lambda a: a.get("panel_index", 0))
        return candidates[0]["url"]
    return None


@router.get("")
async def list_projects():
    projects = db_list_projects()
    for p in projects:
        p["thumbnail_url"] = _thumbnail_for_project(p["id"])
    return projects


@router.post("")
async def create_project(data: ProjectCreate):
    project_id = str(uuid.uuid4())
    production_paths = _normalize_production_paths(data.production_paths or ["cinematic"])
    return db_create_project(project_id, data.title, data.artist, production_paths=production_paths)


@router.post("/upload-audio")
async def create_and_upload(
    title: str = Form(...),
    production_paths: str = Form('["cinematic"]'),
    bpm: str = Form(""),
    musical_key: str = Form(""),
    beat_grid: str = Form("[]"),
    file: UploadFile = File(...),
    vocals_file: UploadFile | None = File(None),
):
    """Create a new project and save the original audio only.

    The guided workflow now runs each expensive/meaningful operation one at a
    time from the project page instead of launching the whole preprocessing
    stack immediately.
    """
    _validate_audio_file(file.filename)
    if vocals_file is not None and vocals_file.filename:
        _validate_audio_file(vocals_file.filename)
    selected_paths = _normalize_production_paths(production_paths)

    project_id = str(uuid.uuid4())
    db_create_project(project_id, title, "", production_paths=selected_paths)

    contents = await file.read()
    key = f"projects/{project_id}/audio/{_sanitize_filename(file.filename)}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")

    updates: dict = {
        "audio_url": audio_url,
        "stage": "audio_uploaded",
        "processing_step": "Upload complete",
        "error_message": "",
    }
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
        vocals_key = f"projects/{project_id}/audio/vocals_{_sanitize_filename(vocals_file.filename)}"
        updates["user_vocals_url"] = upload_bytes(
            vocals_contents, vocals_key, vocals_file.content_type or "audio/mpeg"
        )

    db_update_project(project_id, **updates)
    return db_get_project(project_id)


@router.get("/{project_id}")
async def get_project(project_id: str):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    delete_project_files(project_id)
    db_delete_project(project_id)
    return {"deleted": True}


@router.post("/{project_id}/retry")
async def retry_project(project_id: str):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["stage"] != "error":
        raise HTTPException(status_code=400, detail=f"Project is not in an error state (stage={project['stage']})")

    last_task = db_get_last_task(project_id)
    if not last_task:
        raise HTTPException(status_code=400, detail="No task history found for this project — can't determine where to resume.")

    from orchestrator import TASK_TYPE_TO_STAGE
    resume_stage = TASK_TYPE_TO_STAGE.get(last_task["task_type"])
    if not resume_stage:
        raise HTTPException(status_code=400, detail=f"Unrecognized task type '{last_task['task_type']}' — can't determine where to resume.")

    db_update_project(project_id, stage=resume_stage, error_message="")
    return db_get_project(project_id)


# ── Guided audio workflow endpoints ───────────────────────────────────────────

@router.post("/{project_id}/guided/analyze-rhythm-key")
async def guided_analyze_rhythm_key(project_id: str, payload: dict):
    project = _get_project_or_404(project_id)
    if not project.get("audio_url"):
        raise HTTPException(status_code=400, detail="Upload a song before analyzing rhythm/key.")

    bpm = str(payload.get("bpm") or "").strip()
    musical_key = str(payload.get("musical_key") or payload.get("musicalKey") or "").strip()
    beat_grid = payload.get("beat_grid", payload.get("beatGrid", []))
    if not isinstance(beat_grid, list):
        beat_grid = []
    if not bpm and not musical_key and not beat_grid:
        raise HTTPException(status_code=400, detail="No rhythm/key result was provided.")

    db_update_project(
        project_id,
        bpm=bpm,
        musical_key=musical_key,
        beat_grid=beat_grid,
        stage="rhythm_key_analyzed",
        processing_step="Analyze Rhythm & Key complete",
        error_message="",
    )
    return db_get_project(project_id)


@router.post("/{project_id}/guided/prepare-audio")
async def guided_prepare_audio(project_id: str):
    project = _get_project_or_404(project_id)
    try:
        from services.audio_preprocessor import convert_to_mp3
        original_path = _local_audio_path(project.get("audio_url"), ".audio")
        original_ext = Path(original_path).suffix.lower()
        with tempfile.TemporaryDirectory(prefix="htxpunk_prepare_audio_") as tmp:
            converted_path = str(Path(tmp) / "converted.mp3")
            convert_to_mp3(original_path, converted_path)
            converted_url = upload_file_path(converted_path, f"projects/{project_id}/audio/converted.mp3", "audio/mpeg")

        action = "Source was already MP3. Conversion skipped; file copied." if original_ext == ".mp3" else "Source converted to MP3."
        db_update_project(project_id, converted_audio_url=converted_url, stage="audio_prepared", processing_step=action, error_message="")
        return {"project": db_get_project(project_id), "result": {"action": action, "converted_audio_url": converted_url}}
    except Exception as exc:
        _set_guided_failure(project_id, "Prepare Project Audio", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{project_id}/guided/read-metadata")
async def guided_read_metadata(project_id: str):
    project = _get_project_or_404(project_id)
    try:
        from services.audio_preprocessor import extract_metadata_tags
        mp3_path = _local_audio_path(project.get("converted_audio_url"), ".mp3")
        tags = extract_metadata_tags(mp3_path)
        db_update_project(
            project_id,
            title=project.get("title") or tags.get("title") or Path(project.get("audio_url", "song")).stem,
            artist=project.get("artist") or tags.get("artist") or "",
            composer=tags.get("composer") or "",
            album=tags.get("album") or "",
            song_length=str(tags["length"]) if tags.get("length") else "",
            stage="metadata_ready",
            processing_step="Metadata tags read",
            error_message="",
        )
        return {"project": db_get_project(project_id), "result": tags}
    except Exception as exc:
        _set_guided_failure(project_id, "Read Metadata Tags", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{project_id}/guided/isolate-vocals")
async def guided_isolate_vocals(project_id: str):
    project = _get_project_or_404(project_id)
    try:
        existing = db_get_assets(project_id, asset_type="vocal_stem")
        if existing:
            db_update_project(project_id, stage="vocals_ready", processing_step="Vocal stem already available", error_message="")
            return {"project": db_get_project(project_id), "result": {"action": "Existing vocal stem reused."}}

        if project.get("user_vocals_url"):
            db_create_asset(project_id, "vocal_stem", "User-provided vocal stem", project["user_vocals_url"], "", source="user")
            db_update_project(project_id, stage="vocals_ready", processing_step="Using user-provided vocal stem", error_message="")
            return {"project": db_get_project(project_id), "result": {"action": "User-provided vocal stem used."}}

        from services.audio_preprocessor import separate_vocals
        mp3_path = _local_audio_path(project.get("converted_audio_url"), ".mp3")
        with tempfile.TemporaryDirectory(prefix="htxpunk_vocals_") as tmp:
            vocals_path = separate_vocals(mp3_path, tmp)
            suffix = Path(vocals_path).suffix.lower() or ".wav"
            content_type = "audio/wav" if suffix == ".wav" else "audio/mpeg"
            vocals_url = upload_file_path(vocals_path, f"projects/{project_id}/audio/isolated_vocals{suffix}", content_type)

        db_create_asset(project_id, "vocal_stem", "Generated vocal stem", vocals_url, "", source="generated")
        db_update_project(project_id, stage="vocals_ready", processing_step="Vocal stem isolated", error_message="")
        return {"project": db_get_project(project_id), "result": {"action": "Vocal stem isolated.", "url": vocals_url}}
    except Exception as exc:
        _set_guided_failure(project_id, "Isolate Vocal Stem", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{project_id}/guided/transcribe-lyrics")
async def guided_transcribe_lyrics(project_id: str):
    project = _get_project_or_404(project_id)
    try:
        from services.audio_analyzer import transcribe_audio
        vocal_assets = db_get_assets(project_id, asset_type="vocal_stem")
        vocals_url = vocal_assets[-1].get("url") if vocal_assets else ""
        if not vocals_url:
            vocals_url = project.get("user_vocals_url") or ""
        if not vocals_url:
            raise RuntimeError("No vocal stem is available. Run Isolate Vocal Stem first.")

        vocals_path = _local_audio_path(vocals_url, Path(vocals_url).suffix or ".audio")
        transcript = transcribe_audio(vocals_path)
        segment_count = len(transcript.get("segments", [])) if isinstance(transcript, dict) else 0
        db_update_project(project_id, transcript=transcript, stage="awaiting_project_info_review", processing_step="Transcription complete", error_message="")
        return {"project": db_get_project(project_id), "result": {"segments": segment_count}}
    except Exception as exc:
        _set_guided_failure(project_id, "Transcribe & Timestamp Lyrics", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{project_id}/references")
async def list_references(project_id: str):
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return db_get_assets(project_id, asset_type="reference")


@router.post("/{project_id}/references")
async def add_references(project_id: str, reference_meta: str = Form("[]"), source: str = Form("revision"), references: list[UploadFile] = File(default=[])):
    if not db_get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    stored = await _store_references(project_id, references, reference_meta, source=source)
    return {"added": stored}


@router.post("/{project_id}/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _validate_audio_file(file.filename)
    contents = await file.read()
    key = f"projects/{project_id}/audio/{_sanitize_filename(file.filename)}"
    audio_url = upload_bytes(contents, key, file.content_type or "audio/mpeg")
    db_update_project(project_id, audio_url=audio_url, stage="audio_uploaded", error_message="", processing_step="Upload complete")
    return {"audio_url": audio_url, "message": "Audio uploaded. Continue with Analyze Rhythm & Key."}


@router.post("/{project_id}/confirm-info")
async def confirm_project_info(project_id: str, payload: ProjectInfoConfirm):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["stage"] != "awaiting_project_info_review":
        raise HTTPException(status_code=400, detail=f"Project is not awaiting info review (stage={project['stage']})")

    updates = payload.model_dump(exclude_unset=True)
    if "brief" in updates:
        updates["user_brief"] = updates.pop("brief")
    if "production_paths" in updates:
        updates["production_paths"] = _normalize_production_paths(updates["production_paths"])
    if updates:
        db_update_project(project_id, **updates)
        project = db_get_project(project_id)

    from services.project_folder import create_human_readable_folder
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
    return db_get_project(project_id)


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
