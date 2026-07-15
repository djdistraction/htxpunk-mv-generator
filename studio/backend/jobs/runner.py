"""Background job runner — keeps FastAPI responsive during long CPU work."""
from __future__ import annotations

import logging
import sys
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

# monorepo backend/ FIRST — shared services import `config` with local_storage_path
_REPO_ROOT = Path(__file__).resolve().parents[3]
_LEGACY_BACKEND = _REPO_ROOT / "backend"
_sys_path_legacy = str(_LEGACY_BACKEND)
if _sys_path_legacy in sys.path:
    sys.path.remove(_sys_path_legacy)
sys.path.insert(0, _sys_path_legacy)

import database as db

logger = logging.getLogger("studio.jobs")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="studio-job")
_lock = threading.Lock()
_running_projects: set[str] = set()


def _progress(job_id: str, pct: float, message: str) -> None:
    db.update_job(job_id, status="running", progress=min(100.0, max(0.0, pct)), message=message)


def _fail(job_id: str, project_id: str, step: str | None, exc: BaseException) -> None:
    err = str(exc)
    logger.error("Job %s failed: %s\n%s", job_id, err, traceback.format_exc())
    db.update_job(job_id, status="failed", progress=0, message="Failed", error=err)
    if step:
        db.set_step(project_id, step, "failed")
    db.update_project(project_id, error_message=err, stage="error")


def _succeed(job_id: str, message: str = "Done") -> None:
    db.update_job(job_id, status="succeeded", progress=100, message=message, error=None)


def submit(project_id: str, job_type: str, fn: Callable[[str, str], None]) -> dict:
    """Create job row and run fn(job_id, project_id) in the pool."""
    with _lock:
        if project_id in _running_projects:
            raise RuntimeError("This project already has a job running. Wait or let it finish.")
        _running_projects.add(project_id)

    job = db.create_job(project_id, job_type)
    job_id = job["id"]

    def wrapper():
        try:
            db.update_job(job_id, status="running", progress=1, message="Starting…")
            db.update_project(project_id, error_message=None)
            fn(job_id, project_id)
            _succeed(job_id)
        except Exception as exc:
            step = {
                "prepare_audio": "song",
                "isolate_vocals": "vocals",
                "transcribe_lyrics": "lyrics",
                "align_lyrics": "lyrics",
                "analyze_rhythm": "rhythm",
                "render_lyric_video": "lyric_video",
            }.get(job_type)
            _fail(job_id, project_id, step, exc)
        finally:
            with _lock:
                _running_projects.discard(project_id)

    _executor.submit(wrapper)
    return job


def job_prepare_audio(job_id: str, project_id: str) -> None:
    from services.audio_preprocessor import convert_to_mp3  # type: ignore

    proj = db.get_project(project_id)
    audio = proj.get("audio_url")
    if not audio:
        raise RuntimeError("No song uploaded.")
    src = Path(audio)
    if not src.is_file():
        raise RuntimeError(f"Audio file missing: {audio}")

    _progress(job_id, 10, "Converting audio to project MP3…")
    out_dir = db.project_dir(project_id) / "audio"
    out_dir.mkdir(exist_ok=True)
    out_mp3 = out_dir / "converted.mp3"
    convert_to_mp3(str(src), str(out_mp3))
    _progress(job_id, 90, "Saving…")
    db.update_project(
        project_id,
        converted_audio_url=str(out_mp3),
        stage="audio_prepared",
    )
    db.set_step(project_id, "song", "approved")
    _progress(job_id, 100, "Audio prepared")


def job_isolate_vocals(job_id: str, project_id: str) -> None:
    from services.audio_preprocessor import separate_vocals  # type: ignore

    proj = db.get_project(project_id)

    # If user already uploaded a stem, isolation is unnecessary.
    existing = proj.get("vocals_url")
    if existing and Path(str(existing)).is_file() and proj.get("vocals_source") == "uploaded":
        _progress(job_id, 100, "Using uploaded vocal stem — isolation skipped")
        db.set_step(project_id, "vocals", "approved")
        db.update_project(project_id, stage="vocals_ready", error_message=None)
        return

    src = proj.get("converted_audio_url") or proj.get("audio_url")
    if not src or not Path(src).is_file():
        raise RuntimeError("Prepare project audio first (converted MP3), or upload a vocal stem file.")

    db.set_step(project_id, "vocals", "running")
    _progress(job_id, 5, "Loading vocal separation model (CPU — can take several minutes)…")

    # Heartbeat thread so UI never looks frozen
    stop = threading.Event()

    def heartbeat():
        n = 5
        while not stop.wait(8):
            n = min(90, n + 3)
            _progress(job_id, n, f"Separating vocals on CPU… ~{n}% (still working)")

    t = threading.Thread(target=heartbeat, daemon=True)
    t.start()
    try:
        out_dir = str(db.project_dir(project_id) / "vocals")
        Path(out_dir).mkdir(exist_ok=True)
        vocals_path = separate_vocals(src, out_dir)
    finally:
        stop.set()

    if not Path(vocals_path).is_file():
        raise RuntimeError(f"Vocal stem not written: {vocals_path}")

    _progress(job_id, 95, "Saving vocal stem…")
    db.update_project(
        project_id,
        vocals_url=str(vocals_path),
        vocals_source="isolated",
        stage="vocals_ready",
        error_message=None,
    )
    db.set_step(project_id, "vocals", "approved")
    _progress(job_id, 100, "Vocal stem ready — you can align or transcribe lyrics next")


def job_transcribe_lyrics(job_id: str, project_id: str) -> None:
    from services.audio_analyzer import transcribe_audio  # type: ignore

    proj = db.get_project(project_id)
    src = proj.get("vocals_url") or proj.get("converted_audio_url") or proj.get("audio_url")
    if not src or not Path(src).is_file():
        raise RuntimeError("No audio/vocals available for transcription.")

    db.set_step(project_id, "lyrics", "running")
    _progress(job_id, 10, "Transcribing with Whisper (CPU)…")
    stop = threading.Event()

    def heartbeat():
        n = 10
        while not stop.wait(5):
            n = min(90, n + 5)
            _progress(job_id, n, f"Whisper transcription… ~{n}%")

    t = threading.Thread(target=heartbeat, daemon=True)
    t.start()
    try:
        result = transcribe_audio(src)
    finally:
        stop.set()

    # Normalize to segments list
    if isinstance(result, dict):
        transcript = result
    else:
        transcript = {"segments": result, "text": ""}

    segs = transcript.get("segments") or []
    if not segs:
        raise RuntimeError("Transcription returned no segments. Retry or paste lyrics and align.")

    _progress(job_id, 95, f"Saving {len(segs)} lyric segments…")
    # New timestamps invalidate any previous lyric video
    db.update_project(
        project_id,
        transcript=transcript,
        stage="lyrics_ready",
        error_message=None,
        video_url=None,
        base_video_url=None,
        final_video_url=None,
    )
    db.set_step(project_id, "lyrics", "needs_review")
    db.set_step(project_id, "lyric_video", "pending")
    _progress(job_id, 100, "Lyrics ready for review")


def job_align_lyrics(job_id: str, project_id: str) -> None:
    from services.lyrics_aligner import align_lyrics  # type: ignore

    proj = db.get_project(project_id)
    text = (proj.get("user_lyrics_text") or "").strip()
    if not text:
        raise RuntimeError("Paste exact lyrics into foundation before aligning.")
    src = proj.get("vocals_url")
    if not src or not Path(src).is_file():
        raise RuntimeError("Vocal stem required for alignment. Run Isolate vocals first (and Retry if it failed).")

    db.set_step(project_id, "lyrics", "running")
    _progress(
        job_id,
        10,
        "Aligning lyrics to vocal stem (Whisper word timestamps — can take a few minutes)…",
    )
    stop = threading.Event()

    def heartbeat():
        n = 12
        while not stop.wait(6):
            n = min(90, n + 4)
            _progress(job_id, n, f"Aligning lyrics… ~{n}%")

    t = threading.Thread(target=heartbeat, daemon=True)
    t.start()
    try:
        segments = align_lyrics(src, text)
    finally:
        stop.set()
    transcript = {
        "segments": segments if isinstance(segments, list) else (segments.get("segments") if isinstance(segments, dict) else []),
        "text": text,
    }
    segs = transcript.get("segments") or []
    if not segs:
        raise RuntimeError("Alignment produced no segments.")
    # New timestamps invalidate any previous lyric video
    db.update_project(
        project_id,
        transcript=transcript,
        stage="lyrics_ready",
        error_message=None,
        video_url=None,
        base_video_url=None,
        final_video_url=None,
    )
    db.set_step(project_id, "lyrics", "needs_review")
    db.set_step(project_id, "lyric_video", "pending")
    _progress(job_id, 100, f"Aligned {len(segs)} segments")


def job_render_lyric_video(job_id: str, project_id: str) -> None:
    """Render pure Lyric Video via Remotion (same path as legacy assemble_lyric_video)."""
    import shutil

    from services.video_assembler import assemble_lyric_video  # type: ignore
    from utils.storage import url_to_local_path  # type: ignore

    proj = db.get_project(project_id)
    transcript = proj.get("transcript") or {}
    segments = transcript.get("segments") or []
    if not segments:
        raise RuntimeError("No timed lyric segments. Finish step 4 (align/transcribe) first.")

    audio = proj.get("converted_audio_url") or proj.get("audio_url")
    if not audio or not Path(str(audio)).is_file():
        raise RuntimeError("Project audio missing. Finish step 1 (prepare song) first.")

    db.set_step(project_id, "lyric_video", "running")
    _progress(job_id, 5, "Building lyric timeline…")

    stop = threading.Event()

    def heartbeat():
        n = 8
        while not stop.wait(6):
            n = min(92, n + 4)
            _progress(job_id, n, f"Remotion lyric render… ~{n}% (can take several minutes)")

    t = threading.Thread(target=heartbeat, daemon=True)
    t.start()
    try:
        storage_url = assemble_lyric_video(
            project_id=project_id,
            audio_path=str(audio),
            segments=segments,
        )
    finally:
        stop.set()

    # Copy into Studio project storage so /files and media endpoint can serve it.
    if str(storage_url).startswith("/storage/"):
        rendered = Path(url_to_local_path(str(storage_url)))
    else:
        rendered = Path(str(storage_url))
    if not rendered.is_file():
        raise RuntimeError(
            f"Lyric video render finished but file not found: {storage_url}. "
            "Check remotion-composer (npm install) and Node/npx on PATH."
        )

    out_dir = db.project_dir(project_id) / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "lyric_video.mp4"
    shutil.copy2(rendered, dest)

    _progress(job_id, 97, "Saving video…")
    db.update_project(
        project_id,
        video_url=str(dest),
        base_video_url=str(dest),
        final_video_url=str(dest),
        stage="lyric_video_ready",
        error_message=None,
    )
    db.set_step(project_id, "lyric_video", "approved")
    _progress(job_id, 100, f"Lyric video ready ({len(segments)} lines)")
