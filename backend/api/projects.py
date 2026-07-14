import json
import logging
import re
import tempfile
import threading
import traceback
import uuid
from pathlib import Path
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from models.project import ProjectCreate, ProjectInfoConfirm, FoundationUpdate, ProductionPathAdd
from database import (
    db_list_projects, db_create_project, db_get_project, db_update_project,
    db_create_asset, db_get_assets, db_delete_project, db_get_last_task,
    db_list_series, db_create_series, db_get_series,
)
from utils.storage import upload_bytes, upload_file_path, url_to_local_path, delete_project_files
from services.workbook_status import get_section_statuses, set_section_status, validate_section_key

router = APIRouter()
logger = logging.getLogger(__name__)

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


def _normalize_production_paths(raw, *, max_paths: int = 4) -> list[str]:
    """Validate music-video format module(s) enabled on this project.

    Foundation (audio/lyrics/rhythm) is always shared. Formats can accumulate
    over the project lifetime (Lyric first, then Karaoke/Cinematic/etc.) per
    decision-log 2026-07-14. Creation UI still defaults to Lyric-only; hybrids
    at create time remain allowed up to max_paths.
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
    if len(paths) > max_paths:
        raise HTTPException(
            status_code=400,
            detail=f"At most {max_paths} production formats can be enabled on one project.",
        )
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


def _mark_generated(project_id: str, section_key: str, message: str):
    set_section_status(project_id, section_key, "generated", message=message)


# ── Guided step background dispatch ───────────────────────────────────────────
#
# guided/* steps (vocal isolation, transcription, alignment, audio prep,
# metadata reads) do real CPU/IO work — a full song through the vocal
# separator or Whisper can take minutes. Running that inline in an `async
# def` route handler blocks FastAPI's single event loop for the whole
# duration: confirmed directly (see testing-notes/2026-07-10-pipeline-run.md)
# that a plain GET /health on a separate connection hung until an unrelated
# isolate-vocals call finished. Every other request — including the
# frontend's own project-state polling — starves the same way, which is what
# produced "Project not found" during a still-in-progress job.
#
# Mirrors pipeline.py's _start_manual_worker: fast preconditions are checked
# synchronously by the caller before dispatch (so bad requests still fail
# fast with a real error), the slow work runs in a background thread, and
# section_statuses' existing "running" state (already rendered distinctly in
# the workbook UI) is what the frontend's existing 5s poll picks up — no new
# job-tracking mechanism needed since one already exists for this purpose.
_guided_in_flight: set[str] = set()
_guided_lock = threading.Lock()


def _start_guided_worker(project_id: str, step_name: str, target_section: str, work_fn):
    """Run a slow guided-workflow step in a background thread."""
    with _guided_lock:
        if project_id in _guided_in_flight:
            raise HTTPException(status_code=409, detail="This project already has a guided step running.")
        _guided_in_flight.add(project_id)

    set_section_status(project_id, target_section, "running", message=f"{step_name} in progress…")

    def _run():
        try:
            work_fn()
        except Exception as exc:
            logger.error("[Guided] FAILED %s -> project %s:\n%s", step_name, project_id, traceback.format_exc())
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            _set_guided_failure(project_id, step_name, RuntimeError(str(detail)))
            set_section_status(project_id, target_section, "failed", error=str(detail))
        finally:
            with _guided_lock:
                _guided_in_flight.discard(project_id)

    threading.Thread(target=_run, daemon=True, name=f"guided-{step_name}").start()
    return {"message": f"{step_name} started"}


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
    lyrics_text: str = Form(""),
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
    if lyrics_text.strip():
        updates["user_lyrics_text"] = lyrics_text.strip()
    if vocals_file is not None and vocals_file.filename:
        vocals_contents = await vocals_file.read()
        vocals_key = f"projects/{project_id}/audio/vocals_{_sanitize_filename(vocals_file.filename)}"
        updates["user_vocals_url"] = upload_bytes(
            vocals_contents, vocals_key, vocals_file.content_type or "audio/mpeg"
        )

    db_update_project(project_id, **updates)
    _mark_generated(project_id, "song_file", "Song file uploaded and ready for review.")
    if updates.get("bpm") or updates.get("musical_key") or updates.get("beat_grid"):
        _mark_generated(project_id, "rhythm_key", "Browser rhythm/key analysis was supplied during upload.")
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
    _mark_generated(project_id, "rhythm_key", "Rhythm/key analysis generated. Review and approve before song analysis.")
    return db_get_project(project_id)


@router.post("/{project_id}/guided/prepare-audio")
async def guided_prepare_audio(project_id: str):
    project = _get_project_or_404(project_id)
    if not project.get("audio_url"):
        raise HTTPException(status_code=400, detail="Upload a song before preparing audio.")

    def _work():
        from services.audio_preprocessor import convert_to_mp3
        original_path = _local_audio_path(project.get("audio_url"), ".audio")
        original_ext = Path(original_path).suffix.lower()
        with tempfile.TemporaryDirectory(prefix="htxpunk_prepare_audio_") as tmp:
            converted_path = str(Path(tmp) / "converted.mp3")
            convert_to_mp3(original_path, converted_path)
            converted_url = upload_file_path(converted_path, f"projects/{project_id}/audio/converted.mp3", "audio/mpeg")

        action = "Source was already MP3. Conversion skipped; file copied." if original_ext == ".mp3" else "Source converted to MP3."
        db_update_project(project_id, converted_audio_url=converted_url, stage="audio_prepared", processing_step=action, error_message="")
        _mark_generated(project_id, "song_file", "Prepared audio is ready.")

    return _start_guided_worker(project_id, "Prepare Project Audio", "song_file", _work)


@router.post("/{project_id}/guided/read-metadata")
async def guided_read_metadata(project_id: str):
    project = _get_project_or_404(project_id)
    if not project.get("converted_audio_url"):
        raise HTTPException(status_code=400, detail="Prepare project audio before reading metadata.")

    def _work():
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
        _mark_generated(project_id, "project_setup", "Metadata was read and is ready for setup review.")

    return _start_guided_worker(project_id, "Read Metadata Tags", "project_setup", _work)


@router.post("/{project_id}/guided/isolate-vocals")
async def guided_isolate_vocals(project_id: str):
    project = _get_project_or_404(project_id)

    def _work():
        existing = db_get_assets(project_id, asset_type="vocal_stem")
        if existing:
            db_update_project(project_id, stage="vocals_ready", processing_step="Vocal stem already available", error_message="")
            _mark_generated(project_id, "song_file", "Vocal stem is ready.")
            return

        if project.get("user_vocals_url"):
            db_create_asset(project_id, "vocal_stem", "User-provided vocal stem", project["user_vocals_url"], "", source="user")
            db_update_project(project_id, stage="vocals_ready", processing_step="Using user-provided vocal stem", error_message="")
            _mark_generated(project_id, "song_file", "User-provided vocal stem is ready.")
            return

        from services.audio_preprocessor import separate_vocals
        mp3_path = _local_audio_path(project.get("converted_audio_url"), ".mp3")
        with tempfile.TemporaryDirectory(prefix="htxpunk_vocals_") as tmp:
            vocals_path = separate_vocals(mp3_path, tmp)
            suffix = Path(vocals_path).suffix.lower() or ".wav"
            content_type = "audio/wav" if suffix == ".wav" else "audio/mpeg"
            vocals_url = upload_file_path(vocals_path, f"projects/{project_id}/audio/isolated_vocals{suffix}", content_type)

        db_create_asset(project_id, "vocal_stem", "Generated vocal stem", vocals_url, "", source="generated")
        db_update_project(project_id, stage="vocals_ready", processing_step="Vocal stem isolated", error_message="")
        _mark_generated(project_id, "song_file", "Generated vocal stem is ready.")

    return _start_guided_worker(project_id, "Isolate Vocal Stem", "song_file", _work)


@router.post("/{project_id}/guided/transcribe-lyrics")
async def guided_transcribe_lyrics(project_id: str):
    project = _get_project_or_404(project_id)
    vocal_assets = db_get_assets(project_id, asset_type="vocal_stem")
    vocals_url = (vocal_assets[-1].get("url") if vocal_assets else "") or project.get("user_vocals_url") or ""
    if not vocals_url:
        raise HTTPException(status_code=400, detail="No vocal stem is available. Run Isolate Vocal Stem first.")

    def _work():
        from services.audio_analyzer import transcribe_audio
        vocals_path = _local_audio_path(vocals_url, Path(vocals_url).suffix or ".audio")
        transcript = transcribe_audio(vocals_path)
        db_update_project(project_id, transcript=transcript, stage="awaiting_project_info_review", processing_step="Transcription complete", error_message="")
        _mark_generated(project_id, "lyrics", "Timestamped lyrics generated. Review and approve before song analysis.")

    return _start_guided_worker(project_id, "Transcribe & Timestamp Lyrics", "lyrics", _work)


class LyricsAlignRequest(BaseModel):
    lyrics_text: str | None = None


@router.post("/{project_id}/guided/align-lyrics")
async def guided_align_lyrics(project_id: str, payload: LyricsAlignRequest | None = None):
    """Forced-align user-supplied lyrics against the vocal stem instead of
    transcribing with Whisper.

    Serves two cases with the same endpoint: lyrics provided upfront at
    upload (called with no body, reads project.user_lyrics_text), and a
    correction after a bad Whisper transcript (payload.lyrics_text is
    stored as the new user_lyrics_text, then aligned) — both produce the
    same transcript shape Transcribe & Timestamp Lyrics does, so nothing
    downstream needs to know which path ran.
    """
    project = _get_project_or_404(project_id)
    lyrics_text = ((payload.lyrics_text if payload else None) or project.get("user_lyrics_text") or "").strip()
    if not lyrics_text:
        raise HTTPException(status_code=400, detail="No lyrics text provided. Paste or upload lyrics first.")
    if payload and payload.lyrics_text and payload.lyrics_text.strip() != (project.get("user_lyrics_text") or "").strip():
        db_update_project(project_id, user_lyrics_text=lyrics_text)

    vocal_assets = db_get_assets(project_id, asset_type="vocal_stem")
    vocals_url = (vocal_assets[-1].get("url") if vocal_assets else "") or project.get("user_vocals_url") or ""
    if not vocals_url:
        raise HTTPException(status_code=400, detail="No vocal stem is available. Run Isolate Vocal Stem first.")

    def _work():
        vocals_path = _local_audio_path(vocals_url, Path(vocals_url).suffix or ".audio")
        from services.lyrics_aligner import align_lyrics
        segments = align_lyrics(vocals_path, lyrics_text)
        transcript = {"segments": segments}
        db_update_project(project_id, transcript=transcript, stage="awaiting_project_info_review", processing_step="Lyric alignment complete", error_message="")
        _mark_generated(project_id, "lyrics", "Timestamped lyrics aligned from your provided text. Review and approve before song analysis.")

    return _start_guided_worker(project_id, "Align Lyrics", "lyrics", _work)


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
    _mark_generated(project_id, "song_file", "Song file uploaded and ready for review.")
    return {"audio_url": audio_url, "message": "Audio uploaded. Continue with Analyze Rhythm & Key."}


@router.post("/{project_id}/foundation")
async def update_foundation(project_id: str, payload: FoundationUpdate):
    """Edit shared foundation fields without requiring the one-shot review gate.

    Title, artist, BPM/key, transcript lines, and brief are foundation data for
    every video format — users must be able to correct them anytime after upload.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("audio_url"):
        raise HTTPException(status_code=400, detail="Upload a song before editing foundation fields.")

    updates = payload.model_dump(exclude_unset=True)
    if "brief" in updates:
        updates["user_brief"] = updates.pop("brief")
    if updates:
        db_update_project(project_id, **updates)
    project = db_get_project(project_id)
    if project.get("title") or project.get("artist"):
        set_section_status(project_id, "project_setup", "generated", message="Foundation fields updated.")
    if project.get("bpm") or project.get("musical_key") or project.get("beat_grid"):
        set_section_status(project_id, "rhythm_key", "generated", message="Rhythm/key foundation updated.")
    if project.get("transcript"):
        set_section_status(project_id, "lyrics", "generated", message="Lyrics foundation updated.")
    return db_get_project(project_id)


@router.post("/{project_id}/production-paths/add")
async def add_production_path(project_id: str, payload: ProductionPathAdd):
    """Enable another video format that reuses this project's foundation.

    Does not re-run upload, rhythm, or lyrics. Used after Lyric Video (or any
    foundation-ready state) to branch into Karaoke / Performance / Cinematic.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    new_path = str(payload.path or "").strip().lower()
    if new_path not in ALLOWED_PRODUCTION_PATHS:
        raise HTTPException(status_code=400, detail=f"Unsupported production path: {new_path}")

    existing = list(project.get("production_paths") or [])
    if new_path in existing:
        return {"project": project, "message": f"Format '{new_path}' is already enabled.", "added": False}

    # Foundation gate: need song + some lyric or rhythm signal so we don't
    # enable cinematic on an empty shell.
    if not project.get("audio_url"):
        raise HTTPException(status_code=400, detail="Upload a song before enabling more formats.")
    has_foundation = bool(
        project.get("transcript")
        or project.get("bpm")
        or project.get("converted_audio_url")
        or project.get("stage") in (
            "awaiting_project_info_review", "info_confirmed", "base_video_ready",
            "assembling_lyric_video", "complete",
        )
    )
    if not has_foundation:
        raise HTTPException(
            status_code=400,
            detail="Finish foundation steps (rhythm and/or lyrics) before enabling another format.",
        )

    merged = _normalize_production_paths(existing + [new_path], max_paths=4)
    db_update_project(project_id, production_paths=merged)
    project = db_get_project(project_id)
    return {
        "project": project,
        "message": (
            f"Enabled '{new_path}'. Shared foundation (song, rhythm, lyrics) is reused — "
            "continue with that format's generation stages; do not re-upload the song."
        ),
        "added": True,
    }


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
    set_section_status(project_id, "project_setup", "approved", message="Project setup approved.")
    # Song file is present by definition at this gate — mark approved so the
    # workbook's Final Video / Lyric Video action unlocks without a second
    # redundant "Approve Song File" click after Confirm & Continue.
    if project.get("audio_url"):
        set_section_status(project_id, "song_file", "approved", message="Song file confirmed with project setup.")
    if project.get("transcript"):
        set_section_status(project_id, "lyrics", "approved", message="Timestamped lyrics approved.")
    if project.get("bpm") or project.get("musical_key") or project.get("beat_grid"):
        set_section_status(project_id, "rhythm_key", "approved", message="Rhythm/key analysis approved.")
    return db_get_project(project_id)


@router.post("/{project_id}/sections/{section_key}/approve")
async def approve_workbook_section(project_id: str, section_key: str):
    project = _get_project_or_404(project_id)
    key = validate_section_key(section_key)
    if key == "song_file" and not project.get("audio_url"):
        raise HTTPException(status_code=400, detail="Upload a song file before approving this section.")
    if key == "rhythm_key" and not (project.get("bpm") or project.get("musical_key") or project.get("beat_grid")):
        raise HTTPException(status_code=400, detail="Run or enter rhythm/key data before approving this section.")
    if key == "lyrics" and not project.get("transcript"):
        raise HTTPException(status_code=400, detail="Transcribe or enter timestamped lyrics before approving this section.")
    if key == "song_analysis" and not project.get("analysis"):
        raise HTTPException(status_code=400, detail="Run song analysis before approving this section.")
    if key == "element_plan" and not project.get("elements"):
        raise HTTPException(status_code=400, detail="Generate or enter an element plan before approving this section.")
    if key == "element_images":
        image_assets = db_get_assets(project_id, asset_type="background") + db_get_assets(project_id, asset_type="element")
        if not image_assets:
            raise HTTPException(status_code=400, detail="Generate or upload element images before approving this section.")
        unapproved = [asset for asset in image_assets if asset.get("asset_status") != "approved"]
        if unapproved:
            raise HTTPException(status_code=400, detail=f"Approve every element image first ({len(unapproved)} remaining).")
    if key == "storyboard_images":
        panels = db_get_assets(project_id, asset_type="storyboard_panel") + db_get_assets(project_id, asset_type="panel")
        if not panels:
            raise HTTPException(status_code=400, detail="Generate or upload storyboard images before approving this section.")
        unapproved = [asset for asset in panels if asset.get("asset_status") != "approved"]
        if unapproved:
            raise HTTPException(status_code=400, detail=f"Approve every storyboard image first ({len(unapproved)} remaining).")
    if key == "final_video":
        final_candidate = project.get("base_video_url") or project.get("video_url")
        if not final_candidate:
            raise HTTPException(status_code=400, detail="Generate a base video before approving this section.")
        db_update_project(
            project_id,
            final_video_url=final_candidate,
            video_url=final_candidate,
            stage="complete",
            processing_step="Final video approved",
        )
    if key == "lip_sync":
        lipsynced_candidate = project.get("lipsynced_video_url")
        if not lipsynced_candidate:
            raise HTTPException(status_code=400, detail="Generate the lip-synced video before approving this section.")
        if get_section_statuses(project).get("final_video", {}).get("status") != "approved":
            raise HTTPException(status_code=400, detail="Approve the base video before choosing a lip-synced final.")
        db_update_project(
            project_id,
            final_video_url=lipsynced_candidate,
            video_url=lipsynced_candidate,
            stage="complete",
            processing_step="Lip-synced video approved as final",
        )
    if key == "project_setup" and project.get("stage") == "awaiting_project_info_review":
        raise HTTPException(status_code=400, detail="Use the setup review form so title, brief, references, and lyrics are saved with the approval.")
    message = "Lip-synced video approved as final." if key == "lip_sync" else "Section approved."
    return set_section_status(project_id, key, "approved", message=message)


@router.post("/{project_id}/sections/{section_key}/reject")
async def reject_workbook_section(project_id: str, section_key: str, payload: dict | None = None):
    _get_project_or_404(project_id)
    key = validate_section_key(section_key)
    note = ""
    if isinstance(payload, dict):
        note = str(payload.get("note") or payload.get("message") or "").strip()
    return set_section_status(project_id, key, "rejected", message=note or "Section rejected.")


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
