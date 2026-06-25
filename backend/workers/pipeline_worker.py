"""
Pipeline workers — Chimera Tower edition.
Plain functions called directly by the orchestrator (no Celery, no broker needed).

Each function:
  1. Sets an intermediate "running" stage so the UI shows progress
  2. Does the work
  3. Sets the terminal stage for this step (orchestrator picks up from there)
  4. Never chains to the next step — that's the orchestrator's job

To restart the pipeline manually from a specific stage, just update the
project's stage column in SQLite and the orchestrator will pick it up.
"""
import logging
import tempfile
from pathlib import Path

import httpx

from database import (
    db_get_project,
    db_update_project,
    db_create_asset,
    db_get_assets,
    db_update_asset,
    db_get_series,
    db_list_shot_manifests,
    db_update_shot_manifest,
)
from utils.storage import url_to_local_path

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_stage(project_id: str, stage: str):
    db_update_project(project_id, stage=stage)
    logger.info("[Worker] %s → stage=%s", project_id[:8], stage)


def _get_project(project_id: str) -> dict:
    project = db_get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")
    return project


def _collect_creative_context(project_id: str, project: dict) -> tuple[str, str]:
    """Gather the user's creative input for this project.

    Returns (creative_brief, reference_notes). The brief is free text; the notes
    are a readable summary of every reference file the user attached (description,
    where it fits, and any extracted document text). Both feed the LLM so it
    builds on the user's vision instead of starting from scratch.
    """
    creative_brief = (project.get("user_brief") or "").strip()

    refs = db_get_assets(project_id, asset_type="reference")
    lines: list[str] = []
    for ref in refs:
        kind = ref.get("kind") or "file"
        name = ref.get("description") or ref.get("filename") or "reference"
        parts = [f"- [{kind}] {name}"]
        if ref.get("role"):
            parts.append(f"role/placement: {ref['role']}")
        if ref.get("extracted_text"):
            snippet = ref["extracted_text"].strip().replace("\n", " ")
            parts.append(f"content: {snippet[:1500]}")
        lines.append("; ".join(parts))
    reference_notes = "\n".join(lines)
    return creative_brief, reference_notes


# ── Stage 1: Audio Analysis ───────────────────────────────────────────────────

def run_audio_analysis(project_id: str):
    """Transcribe audio + LLM song analysis → sets stage='analyzed'."""
    from services.audio_analyzer import run_full_analysis
    _set_stage(project_id, "analyzing")
    project = _get_project(project_id)

    audio_url = project["audio_url"]
    audio_path = url_to_local_path(audio_url)

    # If not in local storage, download to a temp file
    if not Path(audio_path).exists():
        logger.info("[Worker] Downloading audio for project %s", project_id[:8])
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(httpx.get(audio_url, timeout=120).content)
            audio_path = f.name

    creative_brief, reference_notes = _collect_creative_context(project_id, project)
    if creative_brief or reference_notes:
        logger.info("[Worker] Incorporating user brief/references for %s", project_id[:8])

    result = run_full_analysis(
        audio_path,
        creative_brief=creative_brief,
        reference_notes=reference_notes,
    )
    db_update_project(project_id, stage="analyzed", analysis=result)
    logger.info("[Worker] Audio analysis complete for %s", project_id[:8])


# ── Stage 2: Treatment Generation ────────────────────────────────────────────

def run_treatment_generation(project_id: str):
    """LLM visual treatment → sets stage='awaiting_treatment_approval' (human gate)."""
    from services.treatment_generator import generate_treatment
    from database import db_get_series
    _set_stage(project_id, "treatment_pending")
    project = _get_project(project_id)

    analysis = project.get("analysis") or {}
    revision_notes = project.get("revision_notes") or ""
    creative_brief, reference_notes = _collect_creative_context(project_id, project)

    # Load series data for continuity if this project belongs to a series
    series = None
    if project.get("series_id"):
        series = db_get_series(project["series_id"])
        if series:
            logger.info("[Worker] Loading series '%s' for continuity", series.get("name"))

    treatment = generate_treatment(
        analysis,
        revision_notes=revision_notes,
        series=series,
        creative_brief=creative_brief,
        reference_notes=reference_notes,
    )

    # Clear revision notes after use
    db_update_project(
        project_id,
        treatment=treatment,
        revision_notes="",
        stage="awaiting_treatment_approval",
    )
    logger.info("[Worker] Treatment generated for %s — awaiting approval", project_id[:8])
    # ⏸ Orchestrator pauses here until human calls /approve-treatment


# ── Stage 3: Element Extraction ──────────────────────────────────────────────

def run_element_extraction(project_id: str):
    """Extract visual element registry → sets stage='elements_ready'."""
    from services.element_extractor import extract_elements
    _set_stage(project_id, "extracting_elements")
    project = _get_project(project_id)

    analysis = project.get("analysis") or {}
    treatment = project.get("treatment") or {}

    elements = extract_elements(treatment, analysis)
    db_update_project(project_id, elements=elements, stage="elements_ready")
    logger.info("[Worker] Elements extracted for %s (%d bg, %d chars, %d props)",
                project_id[:8],
                len(elements.get("backgrounds", [])),
                len(elements.get("characters", [])),
                len(elements.get("props", [])))


# ── Stage 4: Image Generation ────────────────────────────────────────────────

def run_image_generation(project_id: str):
    """Generate all background + element images → sets stage='images_ready'."""
    from services.image_generator import generate_background, generate_element
    _set_stage(project_id, "generating_images")
    project = _get_project(project_id)
    elements = project.get("elements") or {}
    style_suffix = elements.get("style_suffix", "")

    # Backgrounds
    for bg in elements.get("backgrounds", []):
        prompt = bg.get("image_prompt") or bg.get("prompt", "")
        logger.info("[Worker] Generating background: %s", bg.get("name", bg["id"]))
        url = generate_background(project_id, bg["id"], prompt, style_suffix)
        # Store elem_id so storyboard builder can look up by the element registry ID
        meta = {k: v for k, v in bg.items() if k != "id"}
        db_create_asset(
            project_id, "background", bg.get("name", bg["id"]),
            url, prompt, elem_id=bg["id"], **meta
        )

    # Characters
    for char in elements.get("characters", []):
        for state in char.get("states", []):
            prompt = state.get("image_prompt") or state.get("prompt", "")
            logger.info("[Worker] Generating element: %s", state["state_id"])
            url = generate_element(
                project_id, state["state_id"], prompt, style_suffix, remove_bg=True
            )
            db_create_asset(
                project_id, "element",
                f"{char['name']} — {state['state_name']}",
                url, prompt, **state
            )

    # Props
    for prop in elements.get("props", []):
        for state in prop.get("states", []):
            prompt = state.get("image_prompt") or state.get("prompt", "")
            logger.info("[Worker] Generating prop: %s", state["state_id"])
            url = generate_element(
                project_id, state["state_id"], prompt, style_suffix, remove_bg=True
            )
            db_create_asset(
                project_id, "element",
                f"{prop['name']} — {state['state_name']}",
                url, prompt, **state
            )

    db_update_project(project_id, stage="images_ready")
    logger.info("[Worker] All images generated for %s", project_id[:8])


# ── Stage 5: Storyboard Build ────────────────────────────────────────────────

def run_storyboard_build(project_id: str):
    """Composite storyboard panels → sets stage='awaiting_storyboard_approval' (human gate)."""
    from services.storyboard_builder import build_scene_plan
    from services.compositor import composite_panel
    _set_stage(project_id, "building_storyboard")
    project = _get_project(project_id)

    analysis = project.get("analysis") or {}
    treatment = project.get("treatment") or {}
    elements_data = project.get("elements") or {}
    assets = db_get_assets(project_id)

    # Build lookup maps: elem_id → url for backgrounds, state_id → url for elements
    bg_map = {
        a.get("elem_id"): a.get("url")
        for a in assets if a.get("asset_type") == "background"
    }
    el_map = {
        a.get("state_id"): a.get("url")
        for a in assets if a.get("asset_type") == "element"
    }

    panels = build_scene_plan(treatment, elements_data, analysis)
    # build_scene_plan(treatment, elements, analysis) — analysis contains transcript
    logger.info("[Worker] Building %d storyboard panels for %s", len(panels), project_id[:8])

    for i, panel in enumerate(panels):
        bg_url = bg_map.get(panel.get("background_id"), "")
        elements_with_urls = [
            {**e, "url": el_map.get(e.get("state_id"), "")}
            for e in panel.get("elements_visible", [])
            if e.get("state_id") in el_map
        ]
        panel_url = composite_panel(
            bg_url, elements_with_urls,
            project_id, panel.get("panel_id", str(i))
        )
        # Use asset_type "storyboard_panel" so the storyboard review page can filter
        db_create_asset(
            project_id, "storyboard_panel", f"Panel {i + 1}", panel_url, "",
            panel_index=i,
            energy_level=panel.get("energy_level", 0.5),
            **{k: v for k, v in panel.items() if k not in ("panel_index", "energy_level")}
        )

    _set_stage(project_id, "awaiting_storyboard_approval")
    logger.info("[Worker] Storyboard built for %s — awaiting approval", project_id[:8])
    # ⏸ Orchestrator pauses here until human calls /approve-storyboard


# ── Manifest-driven generation ───────────────────────────────────────────────

def run_manifest_generation(project_id: str):
    """Generate one full-frame image per locked shot manifest and turn each into
    a storyboard panel, then pause at awaiting_storyboard_approval.

    This is the manifest-driven path: an approved production plan deterministically
    drives image generation (prompt built from each shot + series continuity bible),
    bypassing freeform treatment/element extraction.
    """
    from services.image_generator import generate_shot_frame
    from services.shot_prompt import (
        build_shot_prompt, build_negative_prompt, shot_duration_seconds,
    )
    _set_stage(project_id, "generating_manifest_images")
    project = _get_project(project_id)

    manifests = db_list_shot_manifests(project_id)
    if not manifests:
        raise ValueError(f"No shot manifests found for project {project_id}")

    # Series continuity bible drives a coherent look across all shots
    continuity_bible = {}
    style_prompt = ""
    if project.get("series_id"):
        series = db_get_series(project["series_id"])
        if series:
            continuity_bible = series.get("continuity_bible") or {}
            style_prompt = series.get("style_prompt") or ""

    logger.info("[Worker] Manifest generation: %d shots for %s",
                len(manifests), project_id[:8])

    # Clear any stale panels from a previous run so re-generation is clean
    for old in db_get_assets(project_id, asset_type="storyboard_panel"):
        db_update_asset(old["id"], asset_type="storyboard_panel_old")

    for i, shot in enumerate(manifests):
        prompt = build_shot_prompt(shot, continuity_bible, style_prompt)
        negative = build_negative_prompt(shot, continuity_bible)
        duration = shot_duration_seconds(shot, default=settings_clip_default())
        style_suffix = f"Avoid: {negative}" if negative else ""

        shot_no = shot.get("shot_number") or str(i + 1)
        subtitle = shot.get("audio_cue") or ""
        url = generate_shot_frame(
            project_id, f"shot_{shot_no}", prompt,
            style_suffix=style_suffix,
            label=f"Shot {shot_no}",
            subtitle=subtitle,
        )

        asset_id = db_create_asset(
            project_id, "storyboard_panel", f"Shot {shot_no}",
            url, prompt,
            panel_index=i,
            duration=duration,
            energy_level=0.6,
            lyric=shot.get("audio_cue") or "",
            shot_number=shot_no,
            shot_manifest_id=shot["id"],
        )
        # Record which asset this shot produced + freeze the prompt used
        db_update_shot_manifest(
            shot["id"],
            asset_refs=[asset_id],
            locked_prompts={"image_prompt": prompt, "negative_prompt": negative},
            status="locked",
        )

    _set_stage(project_id, "awaiting_storyboard_approval")
    logger.info("[Worker] Manifest frames generated for %s — awaiting approval",
                project_id[:8])
    # ⏸ Orchestrator pauses here until human calls /approve-storyboard


def settings_clip_default() -> float:
    from config import settings
    return float(settings.clip_duration)


# ── Stage 6: Video Assembly ──────────────────────────────────────────────────

def run_video_assembly(project_id: str):
    """Assemble final music video → sets stage='complete'."""
    from services.video_assembler import assemble_music_video
    _set_stage(project_id, "assembling")
    project = _get_project(project_id)

    analysis = project.get("analysis") or {}

    # Respect panel order if the user reordered panels during storyboard review
    panel_order = project.get("panel_order") or []
    all_panels = db_get_assets(project_id, asset_type="storyboard_panel")

    if panel_order:
        order_map = {pid: i for i, pid in enumerate(panel_order)}
        panels = sorted(all_panels, key=lambda a: order_map.get(a["id"], 999))
    else:
        panels = sorted(all_panels, key=lambda a: a.get("panel_index", 0))

    if not panels:
        raise ValueError(f"No storyboard panels found for project {project_id}")

    # Flatten word timestamps from transcript
    transcript = analysis.get("transcript", {})
    word_timestamps = []
    for seg in transcript.get("segments", []):
        word_timestamps.extend(seg.get("words", []))

    panel_dicts = [
        {
            "composite_url": p.get("url"),
            "image_url": p.get("url"),
            "panel_index": p.get("panel_index", i),
            "energy_level": p.get("energy_level", 0.5),
            "duration": p.get("duration"),   # per-shot seconds (manifest path)
            "lyric": p.get("lyric") or "",
        }
        for i, p in enumerate(panels)
    ]

    # Audio is optional: a manifest-only demo project may have no song attached,
    # in which case we render a silent video from the panel durations.
    audio_url = project.get("audio_url")
    audio_path = url_to_local_path(audio_url) if audio_url else ""
    video_url = assemble_music_video(
        project_id=project_id,
        audio_path=audio_path,
        panels=panel_dicts,
        word_timestamps=word_timestamps,
    )

    db_update_project(project_id, stage="complete", video_url=video_url)
    logger.info("[Worker] Project %s complete → %s", project_id[:8], video_url)


# ── Utility: Regenerate a single image ───────────────────────────────────────

def regenerate_single_image(project_id: str, asset_id: str, new_prompt: str):
    """Regenerate one background or element image in place."""
    from services.image_generator import generate_element
    assets = db_get_assets(project_id)
    asset = next((a for a in assets if a.get("id") == asset_id), None)
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")
    remove_bg = asset.get("asset_type") == "element"
    style_suffix = asset.get("style_suffix", "")
    new_url = generate_element(
        project_id, asset_id, new_prompt, style_suffix, remove_bg=remove_bg
    )
    db_update_asset(asset_id, url=new_url, prompt=new_prompt)
    logger.info("[Worker] Regenerated asset %s", asset_id[:8])
