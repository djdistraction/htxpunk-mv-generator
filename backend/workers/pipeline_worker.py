"""
Celery pipeline workers — each stage runs as an async task.
Tasks update project stage in the DB and chain to the next step automatically.
"""
import tempfile
import httpx
from pathlib import Path
from celery import Celery
from config import settings
from database import get_db

app = Celery("voodoo_hut", broker=settings.redis_url, backend=settings.redis_url)
app.conf.task_track_started = True


def _set_stage(project_id: str, stage: str):
    get_db().table("projects").update({"stage": stage}).eq("id", project_id).execute()


def _get_project(project_id: str) -> dict:
    return get_db().table("projects").select("*").eq("id", project_id).single().execute().data


# ── Stage 1: Audio Analysis ───────────────────────────────────────────────────

@app.task(name="pipeline.run_audio_analysis")
def run_audio_analysis(project_id: str):
    from services.audio_analyzer import run_full_analysis
    _set_stage(project_id, "analyzing")
    project = _get_project(project_id)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(httpx.get(project["audio_url"], timeout=60).content)
        tmp_path = f.name

    result = run_full_analysis(tmp_path)
    Path(tmp_path).unlink(missing_ok=True)

    get_db().table("projects").update({
        "stage": "analyzed",
        "analysis": result
    }).eq("id", project_id).execute()

    run_treatment_generation.delay(project_id)


# ── Stage 2: Treatment Generation ─────────────────────────────────────────────

@app.task(name="pipeline.run_treatment_generation")
def run_treatment_generation(project_id: str):
    from services.treatment_generator import generate_treatment
    _set_stage(project_id, "treatment_pending")
    project = _get_project(project_id)
    data = project["analysis"]
    treatment = generate_treatment(data["analysis"], data["transcript"])
    get_db().table("projects").update({"treatment": treatment}).eq("id", project_id).execute()
    # Pipeline pauses here — waits for human approval via POST /api/pipeline/{id}/approve-treatment


# ── Stage 3: Element Extraction ───────────────────────────────────────────────

@app.task(name="pipeline.run_element_extraction")
def run_element_extraction(project_id: str):
    from services.element_extractor import extract_elements
    _set_stage(project_id, "extracting_elements")
    project = _get_project(project_id)
    data = project["analysis"]
    elements = extract_elements(project["treatment"], data["analysis"], data["transcript"])
    get_db().table("projects").update({
        "elements": elements,
        "stage": "elements_ready"
    }).eq("id", project_id).execute()
    run_image_generation.delay(project_id)


# ── Stages 4-5: Image Generation ─────────────────────────────────────────────

@app.task(name="pipeline.run_image_generation")
def run_image_generation(project_id: str):
    from services.image_generator import generate_background, generate_element
    _set_stage(project_id, "generating_backgrounds")
    project = _get_project(project_id)
    elements = project["elements"]
    db = get_db()

    for bg in elements.get("backgrounds", []):
        bg["project_id"] = project_id
        url = generate_background(bg)
        db.table("assets").insert({
            "project_id": project_id, "asset_type": "background",
            "name": bg["name"], "url": url, "metadata": bg
        }).execute()

    _set_stage(project_id, "generating_elements")

    for char in elements.get("characters", []):
        for state in char.get("states", []):
            state["project_id"] = project_id
            url = generate_element(state, remove_bg=True)
            db.table("assets").insert({
                "project_id": project_id, "asset_type": "element",
                "name": f"{char['name']} - {state['state_name']}", "url": url, "metadata": state
            }).execute()

    for prop in elements.get("props", []):
        for state in prop.get("states", []):
            state["project_id"] = project_id
            url = generate_element(state, remove_bg=True)
            db.table("assets").insert({
                "project_id": project_id, "asset_type": "element",
                "name": f"{prop['name']} - {state['state_name']}", "url": url, "metadata": state
            }).execute()

    run_storyboard_build.delay(project_id)


# ── Stage 6: Storyboard Build ─────────────────────────────────────────────────

@app.task(name="pipeline.run_storyboard_build")
def run_storyboard_build(project_id: str):
    from services.storyboard_builder import build_scene_plan
    from services.compositor import composite_panel
    _set_stage(project_id, "building_storyboard")
    project = _get_project(project_id)
    db = get_db()

    assets = db.table("assets").select("*").eq("project_id", project_id).execute().data
    bg_map = {a["metadata"]["id"]: a["url"] for a in assets if a["asset_type"] == "background"}
    el_map = {a["metadata"]["state_id"]: a["url"] for a in assets if a["asset_type"] == "element"}

    analysis_data = project["analysis"]
    panels = build_scene_plan(
        project["treatment"],
        project["elements"],
        analysis_data.get("transcript", analysis_data),
        analysis_data.get("analysis", {})
    )

    for panel in panels:
        bg_url = bg_map.get(panel["background_id"], "")
        elements_with_urls = [
            {**e, "url": el_map.get(e["state_id"], "")}
            for e in panel.get("elements_visible", [])
            if e["state_id"] in el_map
        ]
        panel_url = composite_panel(bg_url, elements_with_urls, project_id, panel["panel_id"])
        db.table("assets").insert({
            "project_id": project_id, "asset_type": "storyboard_panel",
            "name": f"Panel {panel['panel_id']}", "url": panel_url, "metadata": panel
        }).execute()
    # Pipeline pauses here — waits for human approval via POST /api/pipeline/{id}/approve-storyboard


# ── Stage 7: Clip Generation ──────────────────────────────────────────────────

@app.task(name="pipeline.run_clip_generation")
def run_clip_generation(project_id: str):
    from services.video_generator import generate_clip
    _set_stage(project_id, "generating_clips")
    db = get_db()

    panels = db.table("assets").select("*").eq("project_id", project_id).eq("asset_type", "storyboard_panel").execute().data
    pairs: dict[int, dict] = {}
    for p in panels:
        ci = p["metadata"]["clip_index"]
        ft = p["metadata"]["frame_type"]
        pairs.setdefault(ci, {})[ft] = p

    clip_urls = []
    for ci in sorted(pairs.keys()):
        pair = pairs[ci]
        if "open" not in pair or "close" not in pair:
            continue
        clip_url = generate_clip(
            frame_a_url=pair["open"]["url"],
            frame_b_url=pair["close"]["url"],
            project_id=project_id,
            clip_index=ci,
            scene_description=pair["open"]["metadata"].get("scene_description", "")
        )
        db.table("assets").insert({
            "project_id": project_id, "asset_type": "clip",
            "name": f"Clip {ci:04d}", "url": clip_url, "metadata": {"clip_index": ci}
        }).execute()
        clip_urls.append((ci, clip_url))

    ordered_urls = [url for _, url in sorted(clip_urls)]
    run_final_assembly.delay(project_id, ordered_urls)


# ── Stage 8: Final Assembly ───────────────────────────────────────────────────

@app.task(name="pipeline.run_final_assembly")
def run_final_assembly(project_id: str, clip_urls: list[str]):
    from services.video_assembler import assemble_video
    _set_stage(project_id, "assembling")
    project = _get_project(project_id)
    title_slug = project["title"].lower().replace(" ", "-")
    video_url = assemble_video(
        project_id=project_id,
        clip_urls=clip_urls,
        audio_url=project["audio_url"],
        output_name=f"{title_slug}-final.mp4"
    )
    get_db().table("projects").update({
        "video_url": video_url, "stage": "complete"
    }).eq("id", project_id).execute()


# ── Utility: Regenerate a single image ───────────────────────────────────────

@app.task(name="pipeline.regenerate_single_image")
def regenerate_single_image(project_id: str, asset_id: str, new_prompt: str):
    from services.image_generator import generate_element
    db = get_db()
    asset = db.table("assets").select("*").eq("id", asset_id).single().execute().data
    state_def = {**asset["metadata"], "project_id": project_id, "image_prompt": new_prompt}
    new_url = generate_element(state_def, remove_bg=(asset["asset_type"] == "element"))
    db.table("assets").update({"url": new_url}).eq("id", asset_id).execute()
