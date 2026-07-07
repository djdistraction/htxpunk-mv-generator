"""
Chimera Tower Orchestrator
==========================
The "CEO's Assistant" — runs as a background thread inside uvicorn.
Polls the projects table every few seconds, dispatches the right specialist
worker for each stage, and handles human approval pauses cleanly.

No broker. No external process. One server to run.

Architecture:
  Building  = SQLite (shared state)
  Security  = _in_flight set (prevents double-dispatch per project)
  Receptionist = tasks table (logs every dispatch with timestamp)
  Workers   = plain functions in pipeline_worker.py
  Human gates = stages the orchestrator skips (waits for API approval)
"""
import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from database import (
    db_update_project,
    db_create_task,
    db_complete_task,
    db_fail_task,
    _sync_db,
)

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

POLL_INTERVAL = 3  # seconds between polls

# Stages the orchestrator automatically dispatches workers for
STAGE_WORKERS: dict[str, str] = {
    "uploaded":            "run_audio_preprocessing",
    "info_confirmed":      "run_song_interpretation",
    "analyzed":            "run_treatment_generation",
    "treatment_approved":  "run_element_extraction",
    "elements_ready":      "run_image_generation",
    "images_ready":        "run_storyboard_build",
    "manifest_approved":   "run_manifest_generation",
    "storyboard_approved": "run_video_assembly",
}

# Reverse of STAGE_WORKERS — given the task_type that failed, which stage do
# we reset a project to so the orchestrator re-dispatches it? Used by the
# /retry endpoint; computed here so it can never drift out of sync with the
# forward mapping above.
TASK_TYPE_TO_STAGE: dict[str, str] = {v: k for k, v in STAGE_WORKERS.items()}

# Stages where a human must act — orchestrator skips them
HUMAN_GATES = {
    "awaiting_project_info_review",
    "awaiting_treatment_approval",
    "awaiting_manifest_approval",
    "awaiting_storyboard_approval",
}

# Stages that indicate the pipeline finished (no more dispatch)
TERMINAL_STAGES = {"complete", "error"}

# Transitional stages: the worker is running and set this intermediate stage.
# If the server restarts mid-flight, reset these back to their dispatch stage
# so the orchestrator can re-pick them up.
TRANSITIONAL_RESET: dict[str, str] = {
    "preprocessing_audio":        "uploaded",
    "interpreting_song":          "info_confirmed",
    "treatment_pending":          "analyzed",
    "extracting_elements":        "treatment_approved",
    "generating_images":          "elements_ready",
    "building_storyboard":        "images_ready",
    "generating_manifest_images": "manifest_approved",
    "assembling":                 "storyboard_approved",
}

# ── State ─────────────────────────────────────────────────────────────────────

_executor: ThreadPoolExecutor | None = None
_in_flight: set[str] = set()   # project IDs currently being processed
_lock = threading.Lock()
_started = False


# ── Worker dispatch ───────────────────────────────────────────────────────────

def _get_worker(task_type: str):
    """Import and return a pipeline worker function by name."""
    from workers import pipeline_worker
    return getattr(pipeline_worker, task_type)


def _dispatch(project_id: str, task_type: str):
    """
    Security check → insert task record → submit to thread pool.
    The in-flight set prevents double-dispatch in the same process.
    The tasks table persists the audit trail.
    """
    with _lock:
        if project_id in _in_flight:
            return  # already running
        _in_flight.add(project_id)

    task_id = db_create_task(project_id, task_type)
    logger.info("[Orchestrator] Dispatching %s → project %s", task_type, project_id)

    def _run():
        try:
            fn = _get_worker(task_type)
            fn(project_id)
            db_complete_task(task_id)
            logger.info("[Orchestrator] Completed %s → project %s", task_type, project_id)
        except Exception as exc:
            err_detail = traceback.format_exc()
            logger.error("[Orchestrator] FAILED %s → project %s:\n%s",
                         task_type, project_id, err_detail)
            db_fail_task(task_id, str(exc))
            db_update_project(project_id, stage="error", error_message=str(exc))
        finally:
            with _lock:
                _in_flight.discard(project_id)

    assert _executor is not None
    _executor.submit(_run)


# ── Poll cycle ────────────────────────────────────────────────────────────────

def _poll():
    """Single orchestration sweep — check all active projects."""
    import sqlite3
    conn = _sync_db()
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, stage FROM projects WHERE stage NOT IN ('complete','error')"
    ).fetchall()
    conn.close()

    for row in rows:
        project_id: str = row["id"]
        stage: str = row["stage"]

        # Skip human gates
        if stage in HUMAN_GATES:
            continue

        # Skip stages we don't recognize (safety)
        task_type = STAGE_WORKERS.get(stage)
        if not task_type:
            continue

        # Security: skip if already in-flight (in-process check)
        with _lock:
            if project_id in _in_flight:
                continue

        _dispatch(project_id, task_type)


# ── Startup reset ─────────────────────────────────────────────────────────────

def _reset_stuck_projects():
    """
    On startup, reset any projects stuck in transitional stages back to their
    dispatch stage so the orchestrator can re-pick them up cleanly.
    Also mark any orphaned 'running' tasks as failed.
    """
    import sqlite3
    conn = _sync_db()
    conn.row_factory = sqlite3.Row

    # Reset transitional stages
    for stuck_stage, reset_to in TRANSITIONAL_RESET.items():
        rows = conn.execute(
            "SELECT id FROM projects WHERE stage=?", (stuck_stage,)
        ).fetchall()
        for row in rows:
            logger.warning(
                "[Orchestrator] Resetting stuck project %s: %s → %s",
                row["id"], stuck_stage, reset_to
            )
            conn.execute(
                "UPDATE projects SET stage=?, updated_at=? WHERE id=?",
                (reset_to, datetime.utcnow().isoformat(), row["id"])
            )

    # Mark orphaned running tasks as failed
    conn.execute(
        "UPDATE tasks SET status='failed', error='Server restarted' "
        "WHERE status='running'"
    )

    conn.commit()
    conn.close()


# ── Public API ────────────────────────────────────────────────────────────────

def start_orchestrator(max_workers: int = 4):
    """
    Start the Chimera Tower orchestrator as a daemon background thread.
    Call once from FastAPI lifespan startup.
    """
    global _executor, _started
    if _started:
        return
    _started = True

    _executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="chimera-worker")

    _reset_stuck_projects()

    def _loop():
        logger.info("[Orchestrator] Chimera Tower online — polling every %ds", POLL_INTERVAL)
        while True:
            try:
                _poll()
            except Exception:
                logger.exception("[Orchestrator] Poll error")
            import time
            time.sleep(POLL_INTERVAL)

    t = threading.Thread(target=_loop, daemon=True, name="chimera-orchestrator")
    t.start()
    return t
