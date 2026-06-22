"""
Celery pipeline workers — each stage runs as an async task.
Uses SQLite via SQLAlchemy sync helpers (db_get_project, etc.)
Tasks update project stage in DB and chain to the next step automatically.

Start with:  celery -A workers.pipeline_worker worker --pool=solo --loglevel=info
"""
import json
import logging
import tempfile
from pathlib import Path

import httpx
from celery import Celery

from config import settings
from database import (
    SessionLocal,
    db_get_project,
    db_update_project,
    db_create_asset,
    db_get_assets,
)
from utils.storage import url_to_local_path

logger = logging.getLogger(__name__)

app = Celery(
    "voodoo_hut",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
app.conf.task_track_started = True


# ── DB helpers ────────────────────────────────────────────────────────────────

def _set_stage(project_id: str, stage: str):
    with SessionLocal() as db:
        db_update_project(db, project_id, {"stage": stage})


def _get_project(project_id: str) -> dict:
    with SessionLocal() as db:
        row = db_get_project(db, project_id)
        return {
            "id": row.id,
            "audio_url": row.audio_url,
            "title": row.title or "untitled",
            "stage": row.stage,
            "analysis_json": row.analysis_json,
            "treatment_json": row.treatment_json,
        }


# ── Stage 1: Audio Analysis ───────────────────────────────────────────────────

@app.task(name="pipeline.run_audio_analysis")
def run_audio_analysis(project_id: str):
    from services.audio_analyzer import run_full_analysis
    _set_stage(project_id, "analyzing")
    project = _get_project(project_id)

    # Download audio to temp file for Whisper
    audio_url = project["audio_url"]
    audio_path = url_to_local_path(audio_url)

    if not Path(audio_path).exists():
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(httpx.get(audio_url, timeout=120).content)
            audio_path = f.name

    result = run_full_analysis(audio_path)

    with SessionLocal() as db:
        db_update_project(db, project_id, {
            "stage": "analyzed",
            "analysis_json": json.dumps(result),
        })

    run_treatment_generation.delay(project_id)


# ── Stage 2: Treatment Generation ─────────────────────────────────────────────

@app.task(name="pipeline.run_treatment_generation")
def run_treatment_generation(project_id: str):
    from services.treatment_generator import generate_treatment
    _set_stage(project_id, "treatment_pending")
    project = _get_project(project_id)
    analysis = json.loads(project["analysis_json"] or "{}")
    treatment = generate_treatment(analysis)
    with SessionLocal() as db:
        db_update_project(db, project_id, {
            "treatment_json": json.dumps(treatment),
            "stage": "awaiting_treatment_approval",
        })
    # ⏸ Pipeline pauses here — resumed by POST /api/pipeline/{id}/approve-treatment


# ── Stage 3: Element Extraction ───────────────────────────────────────────────

@app.task(name="pipeline.run_element_extraction")
def run_element_extraction(project_id: str):
    from services.element_extractor import extract_elements
    _set_stage(project_id, "extracting_elements")
    project = _get_project(project_id)
    analysis = json.loads(project["analysis_json"] or "{}")
    treatment = json.loads(project["treatment_json"] or "{}")
    elements = extract_elements(treatment, analysis)
    with SessionLocal() as db:
        db_update_project(db, project_id, {
            "elements_json": json.dumps(elements),
            "stage": "elements_ready",
        })
    run_image_generation.delay(project_id)


# ── Stages 4–5: Image Generation ─────────────────────────────────────────────

@app.task(name="pipeline.run_image_generation")
def run_image_generation(project_id: str):
    from services.image_generator import generate_background, generate_element
    _set_stage(project_id, "generating_backgrounds")
    project = _get_project(project_id)
    with SessionLocal() as db:
        row = db_get_project(db, project_id)
        elements = json.loads(row.elements_json or "{}")

    for bg in elements.get("backgrounds", []):
        url = generate_background(project_id, bg["id"], bg["prompt"], bg.get("style_suffix", ""))
        with SessionLocal() as db:
            db_create_asset(db, project_id, "background", bg["name"], url, bg)

    _set_stage(project_id, "generating_elements")

    for char in elements.get("characters", []):
        for state in char.get("states", []):
            url = generate_element(project_id, state["state_id"], state["prompt"],
                                   state.get("style_suffix", ""), remove_bg=True)
            with SessionLocal() as db:
                db_create_asset(db, project_id, "element",
                                f"{char['name']} – {state['state_name']}", url, state)

    for prop in elements.get("props", []):
        for state in prop.get("states", []):
            url = generate_element(project_id, state["state_id"], state["prompt"],
                                   state.get("style_suffix", ""), remove_bg=True)
            with SessionLocal() as db:
                db_create_asset(db, project_id, "element",
                                f"{prop['name']} – {state['state_name']}", url, state)

    run_storyboard_build.delay(project_id)


# ── Stage 6: Storyboard Build ─────────────────────────────────────────────────

@app.task(name="pipeline.run_storyboard_build")
def run_storyboard_build(project_id: str):
    from services.storyboard_builder import build_scene_plan
    from services.compositor import composite_panel
    _set_stage(project_id, "building_storyboard")
    project = _get_project(project_id)

    with SessionLocal() as db:
        row = db_get_project(db, project_id)
        analysis = json.loads(row.analysis_json or "{}")
        treatment = json.loads(row.treatment_json or "{}")
        elements_data = json.loads(row.elements_json or "{}")
        assets = db_get_assets(db, project_id)

    bg_map = {a.metadata.get("id"): a.file_url for a in assets if a.asset_type == "background"}
    el_map = {a.metadata.get("state_id"): a.file_url for a in assets if a.asset_type == "element"}

    panels = build_scene_plan(treatment, elements_data, analysis)

    for i, panel in enumerate(panels):
        bg_url = bg_map.get(panel.get("background_id"), "")
        elements_with_urls = [
            {**e, "url": el_map.get(e.get("state_id"), "")}
            for e in panel.get("elements_visible", [])
            if e.get("state_id") in el_map
        ]
        panel_url = composite_panel(bg_url, elements_with_urls, project_id, panel.get("panel_id", str(i)))
        metadata = {**panel, "panel_index": i, "energy_level": panel.get("energy_level", 0.5)}
        with SessionLocal() as db:
            db_create_asset(db, project_id, "panel", f"Panel {i+1}", panel_url, metadata)

    _set_stage(project_id, "awaiting_storyboard_approval")
    # ⏸ Pipeline pauses here — resumed by POST /api/pipeline/{id}/approve-storyboard


# ── Stage 7: Remotion Assembly (replaces clip gen + ffmpeg concat) ────────────

@app.task(name="pipeline.run_video_assembly")
def run_video_assembly(project_id: str):
    from services.video_assembler import assemble_music_video
    _set_stage(project_id, "assembling")
    project = _get_project(project_id)

    with SessionLocal() as db:
        row = db_get_project(db, project_id)
        analysis = json.loads(row.analysis_json or "{}")
        assets = db_get_assets(db, project_id, asset_type="panel")

    # Word-level timestamps from Whisper for lyric sync
    word_timestamps = analysis.get("transcription", {}).get("words", [])

    panels = sorted(assets, key=lambda a: a.metadata.get("panel_index", 0))
    if not panels:
        raise ValueError(f"No panels found for project {project_id}")

    panel_dicts = [
        {
            "composite_url": p.file_url,
            "image_url": p.file_url,
            "panel_index": p.metadata.get("panel_index", i),
            "energy_level": p.metadata.get("energy_level", 0.5),
        }
        for i, p in enumerate(panels)
    ]

    audio_path = url_to_local_path(project["audio_url"])
    video_url = assemble_music_video(
        project_id=project_id,
        audio_path=audio_path,
        panels=panel_dicts,
        word_timestamps=word_timestamps,
    )

    with SessionLocal() as db:
        db_update_project(db, project_id, {"video_url": video_url, "stage": "complete"})

    logger.info("Project %s complete — %s", project_id, video_url)


# ── Utility: Regenerate a single image ───────────────────────────────────────

@app.task(name="pipeline.regenerate_single_image")
def regenerate_single_image(project_id: str, asset_id: str, new_prompt: str):
    from services.image_generator import generate_element
    with SessionLocal() as db:
        from database import db_get_asset, db_update_asset
        asset = db_get_asset(db, asset_id)
        remove_bg = asset.asset_type == "element"
        new_url = generate_element(
            project_id, asset_id, new_prompt,
            asset.metadata.get("style_suffix", ""), remove_bg=remove_bg
        )
        db_update_asset(db, asset_id, {"file_url": new_url})
