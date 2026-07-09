import logging
import threading
import traceback

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from database import (
    db_get_project, db_update_project,
    db_list_shot_manifests, db_update_shot_manifest,
    db_create_shot_manifest, db_delete_shot_manifest, db_get_shot_manifest,
    db_get_series, db_get_assets, db_update_asset,
)
from services.workbook_status import (
    get_section_statuses,
    section_is_approved,
    set_section_status,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request/response models ───────────────────────────────────────────────────

class TreatmentApproval(BaseModel):
    notes: str = ""          # optional notes saved with project (not used by pipeline)
    treatment: dict | None = None  # optionally override treatment before approving

class TreatmentRevision(BaseModel):
    feedback: str            # what the user wants changed

class StoryboardApproval(BaseModel):
    panel_order: list[str]   # asset IDs in the desired sequence

class ImageRegenRequest(BaseModel):
    asset_id: str
    new_prompt: str


# ── Shot Manifest models ──────────────────────────────────────────────────────

class ShotManifestPayload(BaseModel):
    shot_number: str = ""
    start_time: str = ""
    end_time: str = ""
    audio_cue: str = ""
    location: str = ""
    characters: list[str] = Field(default_factory=list)
    camera: str = ""
    action: str = ""
    mood: str = ""
    continuity_rules: list[str] = Field(default_factory=list)
    negative_constraints: list[str] = Field(default_factory=list)
    status: str = "draft"


class ManifestApproval(BaseModel):
    revision_notes: str = ""  # optional notes before approving


# ── Manual workbook worker dispatch ───────────────────────────────────────────

def _start_manual_worker(
    project_id: str,
    worker_name: str,
    allowed_stages: set[str],
    message: str,
    *,
    target_section: str | None = None,
    required_sections: tuple[str, ...] = (),
):
    """Run exactly one pipeline worker from an explicit workbook action."""
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("stage") not in allowed_stages:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Project is not ready for this action "
                f"(stage={project.get('stage')})."
            ),
        )
    statuses = get_section_statuses(project)
    if statuses:
        missing = [section for section in required_sections if not section_is_approved(project, section)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Approve these workbook sections first: {', '.join(missing)}.",
            )
    if target_section:
        set_section_status(project_id, target_section, "running", message=message)

    def _run():
        try:
            from workers import pipeline_worker
            getattr(pipeline_worker, worker_name)(project_id)
        except Exception as exc:
            err_detail = traceback.format_exc()
            logger.error(
                "[Workbook] FAILED %s -> project %s:\n%s",
                worker_name,
                project_id,
                err_detail,
            )
            db_update_project(project_id, stage="error", error_message=str(exc))
            if target_section:
                set_section_status(project_id, target_section, "failed", error=str(exc))

    threading.Thread(
        target=_run,
        daemon=True,
        name=f"workbook-{worker_name}",
    ).start()
    return {"message": message}


# ── Treatment gate ────────────────────────────────────────────────────────────

@router.post("/{project_id}/run-song-analysis")
async def run_song_analysis(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_song_interpretation",
        {"info_confirmed"},
        "Song analysis started",
        target_section="song_analysis",
        required_sections=("project_setup", "song_file", "rhythm_key", "lyrics"),
    )


@router.post("/{project_id}/generate-treatment")
async def generate_treatment(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_treatment_generation",
        {"analyzed"},
        "Treatment generation started",
        target_section="treatment",
        required_sections=("song_analysis",),
    )


@router.post("/{project_id}/generate-element-plan")
async def generate_element_plan(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_element_extraction",
        {"treatment_approved"},
        "Element plan generation started",
        target_section="element_plan",
        required_sections=("treatment",),
    )


@router.post("/{project_id}/generate-element-images")
async def generate_element_images(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_image_generation",
        {"elements_ready"},
        "Element image generation started",
        target_section="element_images",
        required_sections=("element_plan",),
    )


@router.post("/{project_id}/build-storyboard")
async def build_storyboard(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_storyboard_build",
        {"images_ready"},
        "Storyboard image generation started",
        target_section="storyboard_images",
        required_sections=("element_images",),
    )


@router.post("/{project_id}/generate-manifest-images")
async def generate_manifest_images(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_manifest_generation",
        {"manifest_approved"},
        "Manifest-driven storyboard image generation started",
        target_section="storyboard_images",
        required_sections=("shot_manifest",),
    )


@router.post("/{project_id}/generate-base-video")
async def generate_base_video(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_video_assembly",
        {"storyboard_approved"},
        "Base video generation started",
        target_section="final_video",
        required_sections=("storyboard_images",),
    )


@router.post("/{project_id}/run-lip-sync")
async def run_lip_sync(project_id: str):
    return _start_manual_worker(
        project_id,
        "run_lip_sync_generation",
        {"complete", "base_video_ready", "lip_sync_ready"},
        "Lip sync started",
        target_section="lip_sync",
        required_sections=("final_video",),
    )


@router.post("/{project_id}/approve-treatment")
async def approve_treatment(project_id: str, body: TreatmentApproval = TreatmentApproval()):
    """
    Human approves the AI-generated treatment.
    Optionally pass an edited treatment dict to override before approval.
    The workbook pauses here until the user explicitly runs Element Plan.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates: dict = {"stage": "treatment_approved"}
    if body.treatment:
        updates["treatment"] = body.treatment

    db_update_project(project_id, **updates)
    set_section_status(project_id, "treatment", "approved", message="Treatment approved.")
    return {"message": "Treatment approved. Element Plan is ready to run."}


@router.post("/{project_id}/revise-treatment")
async def revise_treatment(project_id: str, body: TreatmentRevision):
    """
    Human rejects the treatment and provides feedback.
    Stores the feedback and resets stage so the orchestrator regenerates.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_update_project(
        project_id,
        revision_notes=body.feedback,
        stage="analyzed",   # orchestrator will re-run treatment generation
    )
    set_section_status(project_id, "treatment", "rejected", message=body.feedback)
    return {"message": "Revision noted — regenerating treatment"}


# ── Storyboard gate ───────────────────────────────────────────────────────────

@router.post("/{project_id}/approve-storyboard")
async def approve_storyboard(project_id: str, body: StoryboardApproval):
    """
    Human approves the storyboard (optionally with a new panel order).
    The workbook pauses here until the user explicitly runs base video generation.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    panels = db_get_assets(project_id, asset_type="storyboard_panel") + db_get_assets(project_id, asset_type="panel")
    unapproved = [asset for asset in panels if asset.get("asset_status") != "approved"]
    if not panels:
        raise HTTPException(status_code=400, detail="Generate storyboard images before approving the storyboard.")
    if unapproved:
        raise HTTPException(status_code=400, detail=f"Approve every storyboard image first ({len(unapproved)} remaining).")

    db_update_project(
        project_id,
        panel_order=body.panel_order,
        stage="storyboard_approved",
    )
    set_section_status(project_id, "storyboard_images", "approved", message="Storyboard images approved.")
    return {"message": "Storyboard approved. Base video generation is ready to run."}


# ── Image regeneration ────────────────────────────────────────────────────────

@router.post("/{project_id}/regenerate-image")
async def regenerate_image(project_id: str, body: ImageRegenRequest):
    """Regenerate a single background or element image with a revised prompt."""
    from workers.pipeline_worker import regenerate_single_image
    import threading
    t = threading.Thread(
        target=regenerate_single_image,
        args=(project_id, body.asset_id, body.new_prompt),
        daemon=True,
    )
    t.start()
    return {"message": "Regeneration started"}


@router.post("/{project_id}/upload-shot-image")
async def upload_shot_image(
    project_id: str,
    asset_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Manually supply an image for a shot, bypassing AI image generation
    entirely. Fills the exact same slot generate_shot_frame/regenerate would
    have — same asset, same approval gate — so manual and AI-generated shots
    flow through the pipeline identically from here on.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    assets = db_get_assets(project_id)
    asset = next((a for a in assets if a.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.get("asset_type") not in ("storyboard_panel", "panel"):
        raise HTTPException(
            status_code=400,
            detail="Only storyboard panel images can be manually uploaded",
        )

    raw = await file.read()
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()  # force-decode so downstream save can't fail silently
        # Preserve transparency: convert to RGBA when the image has an alpha
        # channel (RGBA, LA, PA) or a transparency palette entry ('P' with
        # 'transparency' in img.info); otherwise normalise to RGB.
        if img.mode not in ("RGB", "RGBA"):
            has_transparency = (
                img.mode in ("LA", "PA")
                or (img.mode == "P" and "transparency" in img.info)
            )
            img = img.convert("RGBA" if has_transparency else "RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Uploaded file is not a readable image")

    import uuid
    import json as _json
    from utils.storage import upload_bytes
    shot_no = asset.get("shot_number") or asset_id[:6]
    # Unique key per upload (like AI re-rolls) so the URL always changes —
    # otherwise the browser/UI has no signal that the image was replaced.
    key = f"{project_id}/shots/shot_{shot_no}_manual_{uuid.uuid4().hex}.png"
    url = upload_bytes(png_bytes, key, "image/png")

    # "source" isn't a real column — it lives in the metadata JSON blob
    # alongside duration/panel_index/shot_manifest_id etc, so merge into the
    # existing metadata rather than overwriting it via db_update_asset's
    # column-only kwargs.
    metadata = _json.loads(asset.get("metadata") or "{}")
    metadata["source"] = "manual"
    metadata["asset_status"] = "generated"
    metadata["review_note"] = ""
    db_update_asset(asset_id, url=url, prompt="(manually uploaded)", metadata=metadata)
    return {"message": "Image uploaded", "url": url}


# ── Shot Manifest gate ───────────────────────────────────────────────────────

@router.get("/{project_id}/shot-manifests")
async def get_shot_manifests(project_id: str):
    """Retrieve all shot manifests for a project."""
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    manifests = db_list_shot_manifests(project_id)
    return {
        "project_id": project_id,
        "count": len(manifests),
        "manifests": manifests,
    }


def _manifest_payload_updates(body: ShotManifestPayload) -> dict:
    allowed_statuses = {"draft", "reviewing", "approved", "locked", "rejected"}
    status = body.status.strip().lower() or "draft"
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Unsupported shot status: {status}")
    return {
        "shot_number": body.shot_number.strip(),
        "start_time": body.start_time.strip(),
        "end_time": body.end_time.strip(),
        "audio_cue": body.audio_cue.strip(),
        "location": body.location.strip(),
        "characters": body.characters,
        "camera": body.camera.strip(),
        "action": body.action.strip(),
        "mood": body.mood.strip(),
        "continuity_rules": body.continuity_rules,
        "negative_constraints": body.negative_constraints,
        "status": status,
    }


def _manifest_missing_required(manifest: dict) -> list[str]:
    missing = []
    for field in ("shot_number", "start_time", "end_time", "action"):
        if not str(manifest.get(field) or "").strip():
            missing.append(field)
    return missing


@router.post("/{project_id}/shot-manifests")
async def create_shot_manifest(project_id: str, body: ShotManifestPayload):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    updates = _manifest_payload_updates(body)
    if not updates["shot_number"]:
        raise HTTPException(status_code=400, detail="Shot number is required.")

    manifest_id = db_create_shot_manifest(
        project_id,
        shot_number=updates["shot_number"],
        start_time=updates["start_time"],
        end_time=updates["end_time"],
        audio_cue=updates["audio_cue"],
        location=updates["location"],
        characters=updates["characters"],
        camera=updates["camera"],
        action=updates["action"],
        mood=updates["mood"],
        continuity_rules=updates["continuity_rules"],
        negative_constraints=updates["negative_constraints"],
    )
    db_update_shot_manifest(manifest_id, status=updates["status"])
    db_update_project(project_id, stage="awaiting_manifest_approval")
    set_section_status(project_id, "shot_manifest", "generated", message="Shot manifest edited and ready for approval.")
    return {"manifest": db_get_shot_manifest(manifest_id)}


@router.put("/{project_id}/shot-manifests/{manifest_id}")
async def update_shot_manifest(project_id: str, manifest_id: str, body: ShotManifestPayload):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    manifest = db_get_shot_manifest(manifest_id)
    if not manifest or manifest.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Shot manifest not found")
    updates = _manifest_payload_updates(body)
    if not updates["shot_number"]:
        raise HTTPException(status_code=400, detail="Shot number is required.")

    db_update_shot_manifest(manifest_id, **updates, locked_prompts=None, asset_refs=[])
    db_update_project(project_id, stage="awaiting_manifest_approval")
    set_section_status(project_id, "shot_manifest", "generated", message="Shot manifest edited and ready for approval.")
    return {"manifest": db_get_shot_manifest(manifest_id)}


@router.delete("/{project_id}/shot-manifests/{manifest_id}")
async def delete_shot_manifest(project_id: str, manifest_id: str):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    manifest = db_get_shot_manifest(manifest_id)
    if not manifest or manifest.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Shot manifest not found")

    db_delete_shot_manifest(manifest_id)
    db_update_project(project_id, stage="awaiting_manifest_approval")
    set_section_status(project_id, "shot_manifest", "generated", message="Shot manifest edited and ready for approval.")
    return {"deleted": True}


@router.post("/{project_id}/approve-manifests")
async def approve_manifests(project_id: str, body: ManifestApproval = ManifestApproval()):
    """
    Human approves all shot manifests for the project.
    Marks all drafts as 'locked'. The workbook pauses here until the user
    explicitly generates storyboard images.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Mark all draft manifests as locked
    manifests = db_list_shot_manifests(project_id)
    if not manifests:
        raise HTTPException(status_code=400, detail="Add or import at least one shot before approving the manifest.")
    incomplete = [
        f"shot {manifest.get('shot_number') or manifest.get('id')[:8]} missing {', '.join(_manifest_missing_required(manifest))}"
        for manifest in manifests
        if _manifest_missing_required(manifest)
    ]
    if incomplete:
        raise HTTPException(status_code=400, detail="Complete required shot fields first: " + "; ".join(incomplete[:5]))
    for manifest in manifests:
        if manifest['status'] in ('draft', 'approved'):
            db_update_shot_manifest(
                manifest['id'],
                status='locked',
                revision_notes=body.revision_notes,
            )

    db_update_project(
        project_id,
        stage="manifest_approved",
        revision_notes=body.revision_notes,
    )
    set_section_status(project_id, "shot_manifest", "approved", message="Shot manifest approved.")
    return {"message": "Shot manifests locked. Storyboard image generation is ready to run."}


@router.post("/{project_id}/revise-manifests")
async def revise_manifests(project_id: str, body: ManifestApproval):
    """
    Human rejects the shot manifests and provides feedback.
    Stores feedback and resets to treatment stage for regeneration.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_update_project(
        project_id,
        revision_notes=body.revision_notes,
        stage="analyzed",
    )
    set_section_status(project_id, "shot_manifest", "rejected", message=body.revision_notes)
    return {"message": "Manifest revision noted — regenerating treatment"}


@router.post("/{project_id}/import-production-guide")
async def import_production_guide(project_id: str, file: UploadFile = File(...)):
    """
    Import a production guide (Excel shot sheet) and create shot manifests.
    Transitions project to awaiting_manifest_approval for human review.
    """
    from services.production_guide_importer import (
        parse_excel_shot_sheet, create_project_shot_manifests
    )
    import tempfile

    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse the Excel file
        parsed = parse_excel_shot_sheet(tmp_path, project_id=project_id)

        # Create shot manifests in database
        manifest_ids = create_project_shot_manifests(project_id, parsed['shots'])

        # Update project stage and metadata
        db_update_project(
            project_id,
            stage="awaiting_manifest_approval",
            revision_notes=f"Imported {len(manifest_ids)} shot manifests from production guide",
        )
        set_section_status(project_id, "shot_manifest", "generated", message=f"Imported {len(manifest_ids)} shot manifests.")

        return {
            "message": f"Imported {len(manifest_ids)} shot manifests",
            "manifest_ids": manifest_ids,
            "metadata": parsed['metadata'],
            "continuity_bible": parsed['continuity_bible'],
        }

    finally:
        # Clean up temp file
        import os
        os.unlink(tmp_path)
